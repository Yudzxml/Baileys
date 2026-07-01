"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

const { default: NodeCache } = require("@cacheable/node-cache")
const { Boom } = require("@hapi/boom")
const { randomBytes } = require("crypto")
const { proto } = require("../../WAProto")
const {
  DEFAULT_CACHE_TTLS, 
  WA_DEFAULT_EPHEMERAL
} = require("../Defaults/constants")
const { 
  delay, 
  assertMediaContent, 
  bindWaitForEvent, 
  decryptMediaRetryData, 
  encodeNewsletterMessage, 
  encodeSignedDeviceIdentity, 
  encodeWAMessage, 
  encryptMediaRetryRequest,
  extractDeviceJids, 
  generateMessageID, 
  generateParticipantHashV2,
  generateWAMessage, 
  generateWAMessageFromContent, 
  getStatusCodeForMediaRetry, 
  getUrlFromDirectPath, 
  getWAUploadToServer, 
  MessageRetryManager, 
  normalizeMessageContent, 
  parseAndInjectE2ESessions, 
  unixTimestampSeconds,  
  prepareAlbumMessageContent, 
  aggregateMessageKeysNotFromMe,
  generateWAMessageContent
} = require("../Utils")
const { WAMessageAddressingMode } = require("../Types")
const { 
  areJidsSameUser, 
  getBinaryNodeChild, 
  getBinaryNodeChildren, 
  getBinaryFilteredBizBot, 
  getBinaryFilteredButtons, 
  isHostedLidUser, 
  isHostedPnUser, 
  isJidNewsletter, 
  isJidGroup,
  isLidUser, 
  isPnUser,
  isJidMetaAI,
  isJidBot,
  jidDecode,  
  jidEncode, 
  jidNormalizedUser,
  STORIES_JID, 
  S_WHATSAPP_NET,
  PSA_WID
} = require("../WABinary")
const {
  USyncUser, 
  USyncQuery
} = require("../WAUSync") 
const {
	buildMergedTcTokenIndexWrite,
	isTcTokenExpired,
	resolveIssuanceJid,
	resolveTcTokenJid,
	shouldSendNewTcToken,
	storeTcTokensFromIqResult,
	buildTcTokenFromJid
} = require('../Utils/tc-token-utils')
const { getMessageReportingToken, shouldIncludeReportingToken } = require('../Utils/reporting-utils')
const { makeNewsletterSocket } = require("./newsletter")
const { getUrlInfo } = require("../Utils/link-preview")
const { makeKeyedMutex } = require("../Utils/make-mutex") 

const makeMessagesSocket = (config) => {
    const { 
        logger,
        linkPreviewImageThumbnailWidth, 
        generateHighQualityLinkPreview,
        options: httpRequestOptions, 
        patchMessageBeforeSending,
        cachedGroupMetadata, 
        enableRecentMessageCache, 
        maxMsgRetryCount 
    } = config
	
    const suki = makeNewsletterSocket(config)
    
    const { 
        ev, 
        authState, 
        messageMutex, 
        signalRepository, 
        upsertMessage, 
        createCallLink, 
        query, 
        fetchPrivacySettings, 
        sendNode, 
        groupQuery, 
        groupMetadata, 
        groupToggleEphemeral, 
        executeUSyncQuery, 
        newsletterMetadata
    } = suki   
    
    const getLIDForPN = signalRepository.lidMapping.getLIDForPN.bind(signalRepository.lidMapping)
    
    const inFlightTcTokenIssuance = new Set()

    const userDevicesCache = config.userDevicesCache || new NodeCache({
        stdTTL: DEFAULT_CACHE_TTLS.USER_DEVICES,
        useClones: false
    })
    
    const peerSessionsCache = new NodeCache({
        stdTTL: DEFAULT_CACHE_TTLS.USER_DEVICES,
        useClones: false
    })
    
    // Initialize message retry manager if enabled
    const messageRetryManager = enableRecentMessageCache ? new MessageRetryManager(logger, maxMsgRetryCount) : null
    
    // Prevent race conditions in Signal session encryption by user
    const encryptionMutex = makeKeyedMutex()

    let mediaConn

    const refreshMediaConn = async (forceGet = false) => {
        const media = await mediaConn
        
        if (!media || forceGet || new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000) {
            mediaConn = (async () => {
                const result = await query({
                    tag: 'iq',
                    attrs: {
                        type: 'set',
                        xmlns: 'w:m',
                        to: S_WHATSAPP_NET
                    },
                    content: [{ tag: 'media_conn', attrs: {} }]
                })
                
                const mediaConnNode = getBinaryNodeChild(result, 'media_conn')
                
                // TODO: explore full length of data that whatsapp provides
                const node = {
                    hosts: getBinaryNodeChildren(mediaConnNode, 'host').map(({ attrs }) => ({
                        hostname: attrs.hostname,
                        maxContentLengthBytes: +attrs.maxContentLengthBytes
                    })),
                    auth: mediaConnNode.attrs.auth,
                    ttl: +mediaConnNode.attrs.ttl,
                    fetchDate: new Date()
                }
                
                logger.debug('fetched media conn')
                
                return node
            })()
        }
        
        return mediaConn
    }

    /**
     * generic send receipt function
     * used for receipts of phone call, read, delivery etc.
     * */
    const sendReceipt = async (jid, participant, messageIds, type) => {
        if (!messageIds || messageIds.length === 0) {
            throw new Boom('missing ids in receipt')
        }
        
        const node = {
            tag: 'receipt',
            attrs: {
                id: messageIds[0]
            }
        }
        
        const isReadReceipt = type === 'read' || type === 'read-self'
        
        if (isReadReceipt) {
            node.attrs.t = unixTimestampSeconds().toString()
        }
        
        if (type === 'sender' && (isPnUser(jid) || isLidUser(jid))) {
            node.attrs.recipient = jid
            node.attrs.to = participant
        }
        
        else {
            node.attrs.to = jid
            
            if (participant) {
                node.attrs.participant = participant
            }
        }
        
        if (type) {
            node.attrs.type = type
        }
        
        const remainingMessageIds = messageIds.slice(1)
        
        if (remainingMessageIds.length) {
            node.content = [
                {
                    tag: 'list',
                    attrs: {},
                    content: remainingMessageIds.map(id => ({
                        tag: 'item',
                        attrs: { id }
                    }))
                }
            ]
        }
        
        logger.debug({ attrs: node.attrs, messageIds }, 'sending receipt for messages')
        
        await sendNode(node)
    }

    /** Correctly bulk send receipts to multiple chats, participants */
    const sendReceipts = async (keys, type) => {
        const recps = aggregateMessageKeysNotFromMe(keys)

        for (const { jid, participant, messageIds } of recps) {
            await sendReceipt(jid, participant, messageIds, type)
        }
    }

    /** Bulk read messages. Keys can be from different chats & participants */
    const readMessages = async (keys) => {
        const privacySettings = await fetchPrivacySettings()

        // based on privacy settings, we have to change the read type
        const readType = privacySettings.readreceipts === 'all' ? 'read' : 'read-self'

        await sendReceipts(keys, readType)
    }
    
    /** Fetch all the devices we've to send a message to */
    const getUSyncDevices = async (jids, useCache, ignoreZeroDevices) => {
        const deviceResults = []
        
        if (!useCache) {
            logger.debug('not using cache for devices')
        }
        
        const toFetch = []
        
        const jidsWithUser = jids
            .map(jid => {
            const decoded = jidDecode(jid)
            const user = decoded?.user
            const device = decoded?.device
            const isExplicitDevice = typeof device === 'number' && device >= 0
            
            if (isExplicitDevice && user) {
                deviceResults.push({
                    user,
                    device,
                    jid
                })
                
                return null
            }
            
            jid = jidNormalizedUser(jid)
            
            return { jid, user }
        }).filter(jid => jid !== null)
            
        let mgetDevices
        
        if (useCache && userDevicesCache.mget) {
            const usersToFetch = jidsWithUser.map(j => j?.user).filter(Boolean)
            
            mgetDevices = await userDevicesCache.mget(usersToFetch)
        }
        
        for (const { jid, user } of jidsWithUser) {
            if (useCache) {
                const devices = mgetDevices?.[user] ||
                    (userDevicesCache.mget ? undefined : (await userDevicesCache.get(user)))
                    
                if (devices) {
                    const devicesWithJid = devices.map(d => ({
                        ...d,
                        jid: jidEncode(d.user, d.server, d.device)
                    }))
                    
                    deviceResults.push(...devicesWithJid)
                    
                    logger.trace({ user }, 'using cache for devices')
                }
                
                else {
                    toFetch.push(jid)
                }
            }
            
            else {
                toFetch.push(jid)
            }
        }
        
        if (!toFetch.length) {
            return deviceResults
        }
        
        const requestedLidUsers = new Set()
        
        for (const jid of toFetch) {
            if (isLidUser(jid) || isHostedLidUser(jid)) {
                const user = jidDecode(jid)?.user
                
                if (user)
                    requestedLidUsers.add(user)
            }
        }
        
        const query = new USyncQuery().withContext('message').withDeviceProtocol().withLIDProtocol()
        
        for (const jid of toFetch) {
            query.withUser(new USyncUser().withId(jid)) // todo: investigate - the idea here is that <user> should have an inline lid field with the lid being the pn equivalent
        }
        
        const result = await executeUSyncQuery(query)
        
        if (result) {
            // TODO: LID MAP this stuff (lid protocol will now return lid with devices)
            const lidResults = result.list.filter(a => !!a.lid)
            
            if (lidResults.length > 0) {
                logger.trace('Storing LID maps from device call')
                
                await signalRepository.lidMapping.storeLIDPNMappings(lidResults.map(a => ({ lid: a.lid, pn: a.id })))
                
                // Force-refresh sessions for newly mapped LIDs to align identity addressing
                try {
                    const lids = lidResults.map(a => a.lid)
                    
                    if (lids.length) {
                        await assertSessions(lids, true)
                    }
                }
                
                catch (e) {
                    logger.warn({ e, count: lidResults.length }, 'failed to assert sessions for newly mapped LIDs')
                }
            }
            
            const extracted = extractDeviceJids(result?.list, authState.creds.me.id, authState.creds.me.lid, ignoreZeroDevices)
            
            const deviceMap = {}
            
            for (const item of extracted) {
                deviceMap[item.user] = deviceMap[item.user] || []
                deviceMap[item.user]?.push(item)
            }
            
            // Process each user's devices as a group for bulk LID migration
            for (const [user, userDevices] of Object.entries(deviceMap)) {
                const isLidUser = requestedLidUsers.has(user);
                // Process all devices for this user
                for (const item of userDevices) {
                    const finalJid = isLidUser
                        ? jidEncode(user, item.server, item.device)
                        : jidEncode(item.user, item.server, item.device)
                    deviceResults.push({
                        ...item,
                        jid: finalJid
                    })
                    
                    logger.debug({
                        user: item.user,
                        device: item.device,
                        finalJid,
                        usedLid: isLidUser
                    }, 'Processed device with LID priority')
                }
            }
            
            if (userDevicesCache.mset) {
                // if the cache supports mset, we can set all devices in one go
                await userDevicesCache.mset(Object.entries(deviceMap).map(([key, value]) => ({ key, value })))
            }
            
            else {
                for (const key in deviceMap) {
                    if (deviceMap[key])
                        await userDevicesCache.set(key, deviceMap[key])
                }
            }
            
            const userDeviceUpdates = {}
            
            for (const [userId, devices] of Object.entries(deviceMap)) {
                if (devices && devices.length > 0) {
                    userDeviceUpdates[userId] = devices.map(d => d.device?.toString() || '0')
                }
            }
            
            if (Object.keys(userDeviceUpdates).length > 0) {
                try {
                    await authState.keys.set({ 'device-list': userDeviceUpdates })
                    
                    logger.debug({ userCount: Object.keys(userDeviceUpdates).length }, 'stored user device lists for bulk migration')
                }
                
                catch (error) {
                    logger.warn({ error }, 'failed to store user device lists')
                }
            }
        }
        
        return deviceResults
    }
    
    const updateMemberLabel = (jid, memberLabel) => {
        if (!isJidGroup(jid)) {
            throw new Error('Jid must a group!')
        }
        
        const protocolMessage = {
            protocolMessage: {
                type: proto.Message.ProtocolMessage.Type.GROUP_MEMBER_LABEL_CHANGE,
                memberLabel: {
                  label: memberLabel?.slice(0, 30),
                  labelTimestamp: unixTimestampSeconds()
                }
            }
        }
        
        return relayMessage(jid, protocolMessage, {
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: {
                      tag_reason: 'user_update', 
                      appdata: 'member_tag' 
                    }
                }
            ]
        })
    }
    
    const assertSessions = async (jids, force) => {
        let didFetchNewSession = false
        
        const uniqueJids = [...new Set(jids)] // Deduplicate JIDs
        const jidsRequiringFetch = []
        
        logger.debug({ jids }, 'assertSessions call with jids')
        
        // Check peerSessionsCache and validate sessions using libsignal loadSession
        for (const jid of uniqueJids) {
            const signalId = signalRepository.jidToSignalProtocolAddress(jid)
            const cachedSession = peerSessionsCache.get(signalId)
            
            if (cachedSession !== undefined) {
                if (cachedSession && !force) {
                    continue // Session exists in cache
                }
            }
            
            else {
                const sessionValidation = await signalRepository.validateSession(jid)
                const hasSession = sessionValidation.exists
                
                peerSessionsCache.set(signalId, hasSession)
                
                if (hasSession && !force) {
                    continue
                }
            }
            
            jidsRequiringFetch.push(jid)
        }
        
        if (jidsRequiringFetch.length) {
            // LID if mapped, otherwise original
            const wireJids = [
                ...jidsRequiringFetch.filter(jid => !!isLidUser(jid) || !!isHostedLidUser(jid)),
                ...((await signalRepository.lidMapping.getLIDsForPNs(jidsRequiringFetch.filter(jid => !!isPnUser(jid) || !!isHostedPnUser(jid)))) || []).map(a => a.lid)
            ]
            
            logger.debug({ jidsRequiringFetch, wireJids }, 'fetching sessions')
            
            const result = await query({
                tag: 'iq',
                attrs: {
                    xmlns: 'encrypt',
                    type: 'get',
                    to: S_WHATSAPP_NET
                },
                content: [
                    {
                        tag: 'key',
                        attrs: {},
                        content: wireJids.map(jid => {
                            const attrs = { jid }
                            
                            if (force) attrs.reason = 'identity'
                            
                            return { tag: 'user', attrs }
                        })
                    }
                ]
            })
            
            await parseAndInjectE2ESessions(result, signalRepository)
            
            didFetchNewSession = true
            
            // Cache fetched sessions using wire JIDs
            for (const wireJid of wireJids) {
                const signalId = signalRepository.jidToSignalProtocolAddress(wireJid)
                peerSessionsCache.set(signalId, true)
            }
        }
        
        return didFetchNewSession
    }
    
    const sendPeerDataOperationMessage = async (pdoMessage) => {
        //TODO: for later, abstract the logic to send a Peer Message instead of just PDO - useful for App State Key Resync with phone
        if (!authState.creds.me?.id) {
            throw new Boom('Not authenticated')
        }
        
        const protocolMessage = {
            protocolMessage: {
                peerDataOperationRequestMessage: pdoMessage,
                type: proto.Message.ProtocolMessage.Type.PEER_DATA_OPERATION_REQUEST_MESSAGE
            }
        }
        
        const meJid = jidNormalizedUser(authState.creds.me.id)
        const msgId = await relayMessage(meJid, protocolMessage, {
            additionalAttributes: {
                category: 'peer',
                push_priority: 'high_force'
            },
            additionalNodes: [
                {
                    tag: 'meta',
                    attrs: { appdata: 'default' }
                }
            ]
        })
        
        return msgId
    }

    const createParticipantNodes = async (recipientJids, message, extraAttrs, dsmMessage) => {
        if (!recipientJids.length) {
            return { nodes: [], shouldIncludeDeviceIdentity: false }
        }
        
        const patched = await patchMessageBeforeSending(message, recipientJids)
        const patchedMessages = Array.isArray(patched)
            ? patched
            : recipientJids.map(jid => ({ recipientJid: jid, message: patched }))
            
        let shouldIncludeDeviceIdentity = false
        
        const meId = authState.creds.me.id
        const meLid = authState.creds.me?.lid
        const meLidUser = meLid ? jidDecode(meLid)?.user : null
        const encryptionPromises = patchedMessages.map(async ({ recipientJid: jid, message: patchedMessage }) => {
            if (!jid) return null
                
            let msgToEncrypt = patchedMessage
            
            if (dsmMessage) {
                const { user: targetUser } = jidDecode(jid)
                const { user: ownPnUser } = jidDecode(meId)
                const ownLidUser = meLidUser
                const isOwnUser = targetUser === ownPnUser || (ownLidUser && targetUser === ownLidUser)
                const isExactSenderDevice = jid === meId || (meLid && jid === meLid)
                
                if (isOwnUser && !isExactSenderDevice) {
                    msgToEncrypt = dsmMessage
                    logger.debug({ jid, targetUser }, 'Using DSM for own device')
                }
            }
            
            const bytes = encodeWAMessage(msgToEncrypt)
            const mutexKey = jid
            const node = await encryptionMutex.mutex(mutexKey, async () => {
                const { type, ciphertext } = await signalRepository.encryptMessage({
                    jid,
                    data: bytes
                })
                
                if (type === 'pkmsg') {
                    shouldIncludeDeviceIdentity = true
                }
                
                return {
                    tag: 'to',
                    attrs: { jid },
                    content: [
                        {
                            tag: 'enc',
                            attrs: {
                                v: '2',
                                type,
                                ...(extraAttrs || {})
                            },
                            content: ciphertext
                        }
                    ]
                };
            })
            
            return node
        })
        
        const nodes = (await Promise.all(encryptionPromises)).filter(node => node !== null)
        
        return { nodes, shouldIncludeDeviceIdentity }
    }
    
    /** Fetch image for groups, user, and newsletter **/
    const profilePictureUrl = async (jid, type = 'preview', timeoutMs) => {
	const normalizedJid = jidNormalizedUser(jid)

	const isUserJid =
		isPnUser(normalizedJid) ||
		isLidUser(normalizedJid)

	const me = authState.creds.me

	const isSelf =
		me &&
		(
			normalizedJid === jidNormalizedUser(me.id) ||
			(me.lid && normalizedJid === jidNormalizedUser(me.lid))
		)

	let tcTokenContent

	if (suki.serverProps.profilePicPrivacyToken && isUserJid && !isSelf) {
		tcTokenContent = await buildTcTokenFromJid({
			authState,
			jid: normalizedJid,
			getLIDForPN: signalRepository.lidMapping.getLIDForPN.bind(
				signalRepository.lidMapping
			)
		})
	}

	jid = jidNormalizedUser(jid)

	const result = await query(
		{
			tag: 'iq',
			attrs: {
				target: jid,
				to: S_WHATSAPP_NET,
				type: 'get',
				xmlns: 'w:profile:picture'
			},
			content: buildProfilePictureQueryContent(type, tcTokenContent)
		},
		timeoutMs
	)

	const child = getBinaryNodeChild(result, 'picture')
	return child?.attrs?.url
}
    // modifikasi code
    const relayMessage = async (jid, message, { 
    messageId: msgId, 
    participant, 
    additionalAttributes, 
    useUserDevicesCache, 
    useCachedGroupMetadata, 
    statusJidList, 
    additionalNodes, 
    AI = false 
    }) => {
    const meId = authState.creds.me.id
    const meLid = authState.creds.me?.lid
    const isRetryResend = Boolean(participant?.jid)
    
    let shouldIncludeDeviceIdentity = isRetryResend
    let didPushAdditional = false
    let reportingMessage  // ← FIX: Variable yang hilang
    
    const statusJid = 'status@broadcast'
    const decodedJid = jidDecode(jid)  // ← FIX: Tambahkan null check
    if (!decodedJid) {
        throw new Boom('Invalid JID: ' + jid)
    }
    
    const { user, server } = decodedJid
    const isGroup = server === 'g.us'
    const isStatus = jid === statusJid
    const isLid = server === 'lid'
    const isNewsletter = server === 'newsletter'
    const isGroupOrStatus = isGroup || isStatus
    const isPrivate = !isGroup && !isStatus && !isNewsletter  // ← FIX: Definisikan isPrivate
    const finalJid = jid
    
    msgId = msgId || generateMessageID(meId)  // ← FIX: generateMessageID
    useUserDevicesCache = useUserDevicesCache !== false
    useCachedGroupMetadata = useCachedGroupMetadata !== false && !isStatus
    
    const participants = []
    const destinationJid = !isStatus ? finalJid : statusJid
    const binaryNodeContent = []
    const devices = []

    const meMsg = {
        deviceSentMessage: {
            destinationJid,
            message
        }, 
        messageContextInfo: message.messageContextInfo
    }

    const extraAttrs = {}
    const regexGroupOld = /^(\d{1,15})-(\d+)@g\.us$/
    const messages = normalizeMessageContent(message) || {}  // ← FIX: Default empty object

    const buttonType = typeof getButtonType === 'function' ? getButtonType(messages) : null  // ← FIX: Safe check
    const pollMessage = messages.pollCreationMessage || messages.pollCreationMessageV2 || messages.pollCreationMessageV3

    if (participant) {
        if (!isGroup && !isStatus) {
            additionalAttributes = { ...additionalAttributes, device_fanout: 'false' }
        }
        
        const decodedParticipant = jidDecode(participant.jid)  // ← FIX: Null check
        if (decodedParticipant) {
            devices.push({
                user: decodedParticipant.user,
                device: decodedParticipant.device,
                jid: participant.jid
            })
        }
    }

    await authState.keys.transaction(async () => {
        const mediaType = getMediaType(message)

        if (mediaType) {
            extraAttrs['mediatype'] = mediaType
        }
        
        if (isNewsletter) {
            const patched = patchMessageBeforeSending ? await patchMessageBeforeSending(message, []) : message
            const bytes = encodeNewsletterMessage(patched)
            
            binaryNodeContent.push({
                tag: 'plaintext',
                attrs: mediaType ? { mediatype: mediaType } : {},
                content: bytes
            })
            
            const stanza = {
                tag: 'message',
                attrs: {
                    to: jid,
                    id: msgId,
                    type: getTypeMessage(message),  // ← FIX: getTypeMessage 
                    ...(additionalAttributes || {})
                },
                content: binaryNodeContent
            }
            
            logger.debug({ msgId }, `sending newsletter message to ${jid}`)
            await sendNode(stanza)
            return
        }

        if (messages.pinInChatMessage || messages.keepInChatMessage || message.reactionMessage || message.protocolMessage?.editedMessage) {
            extraAttrs['decrypt-fail'] = 'hide'
        } 

        if (messages.interactiveResponseMessage?.nativeFlowResponseMessage) {
            extraAttrs['native_flow_name'] = messages.interactiveResponseMessage.nativeFlowResponseMessage?.name || 'menu_options'
        }

        if (isGroupOrStatus && !isRetryResend) {
            const [groupData, senderKeyMap] = await Promise.all([
                (async () => {
                    let groupData = useCachedGroupMetadata && cachedGroupMetadata ? await cachedGroupMetadata(jid) : undefined
                    if (groupData && Array.isArray(groupData?.participants)) {
                        logger.trace({ jid, participants: groupData.participants.length }, 'using cached group metadata')
                    } else if (!isStatus) {
                        groupData = await groupMetadata(jid)
                    }
                    return groupData
                })(),
                (async () => {
                    if (!participant && !isStatus) {
                        const result = await authState.keys.get('sender-key-memory', [jid])
                        return result[jid] || {}
                    }
                    return {}
                })()
            ])
            
            const participantsList = groupData ? groupData.participants.map(p => p.id) : []
            
            if (groupData?.ephemeralDuration && groupData.ephemeralDuration > 0) {
                additionalAttributes = {
                    ...additionalAttributes,
                    expiration: groupData.ephemeralDuration.toString()
                }
            }
            
            if (isStatus && statusJidList) {
                participantsList.push(...statusJidList)
            }
            
            const additionalDevices = await getUSyncDevices(participantsList, !!useUserDevicesCache, false)
            devices.push(...additionalDevices)
            
            if (isGroup) {
                additionalAttributes = {
                    ...additionalAttributes,
                    addressing_mode: groupData?.addressingMode || 'lid'
                }
            }
            
            const patched = await patchMessageBeforeSending(message)
            
            if (Array.isArray(patched)) {
                throw new Boom('Per-jid patching is not supported in groups')
            }
            
            const bytes = encodeWAMessage(patched)
            reportingMessage = patched  // ← FIX: Set reportingMessage
            const groupAddressingMode = additionalAttributes?.['addressing_mode'] || groupData?.addressingMode || 'lid'
            const groupSenderIdentity = groupAddressingMode === 'lid' && meLid ? meLid : meId
            
            const { ciphertext, senderKeyDistributionMessage } = await signalRepository.encryptGroupMessage({
                group: destinationJid,
                data: bytes,
                meId: groupSenderIdentity
            })
            
            const senderKeyRecipients = []
            
            for (const device of devices) {
                const deviceJid = device.jid
                const hasKey = !!senderKeyMap[deviceJid]
                
                if ((!hasKey || !!participant) &&
                    !isHostedLidUser(deviceJid) &&
                    !isHostedPnUser(deviceJid) &&
                    device.device !== 99) {
                    senderKeyRecipients.push(deviceJid)
                    senderKeyMap[deviceJid] = true
                }
            }
            
            if (senderKeyRecipients.length) {
                logger.debug({ senderKeyJids: senderKeyRecipients }, 'sending new sender key')
                
                const senderKeyMsg = {
                    senderKeyDistributionMessage: {
                        axolotlSenderKeyDistributionMessage: senderKeyDistributionMessage,
                        groupId: destinationJid
                    }
                }
                
                await assertSessions(senderKeyRecipients)
                const result = await createParticipantNodes(senderKeyRecipients, senderKeyMsg, extraAttrs)
                shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || result.shouldIncludeDeviceIdentity
                participants.push(...result.nodes)
            }
            
            binaryNodeContent.push({
                tag: 'enc',
                attrs: { v: '2', type: 'skmsg', ...extraAttrs },
                content: ciphertext
            })
            
            await authState.keys.set({ 'sender-key-memory': { [jid]: senderKeyMap } })
        }
        else {
            // 1:1 chat logic
            let ownId = meId
            
            if (isLid && meLid) {
                ownId = meLid
                logger.debug({ to: jid, ownId }, 'Using LID identity for @lid conversation')
            } else {
                logger.debug({ to: jid, ownId }, 'Using PN identity for @s.whatsapp.net conversation')
            }
            
            const decodedOwnId = jidDecode(ownId)  // ← FIX: Null check
            if (!decodedOwnId) {
                throw new Boom('Failed to decode own ID')
            }
            const { user: ownUser } = decodedOwnId
            
            // ← FIX: Set reportingMessage untuk 1:1
            if (!participant) {
                const patchedForReporting = await patchMessageBeforeSending(message, [jid])
                reportingMessage = Array.isArray(patchedForReporting)
                    ? patchedForReporting.find(item => item.recipientJid === jid) || patchedForReporting[0]
                    : patchedForReporting
            }

            if (!isRetryResend) {
                const targetUserServer = isLid ? 'lid' : 's.whatsapp.net'
                devices.push({
                    user,
                    device: 0,
                    jid: jidEncode(user, targetUserServer, 0)
                })
                
                if (user !== ownUser) {
                    const ownUserServer = isLid ? 'lid' : 's.whatsapp.net'
                    const decodedMeLid = meLid ? jidDecode(meLid) : null
                    const decodedMeId = jidDecode(meId)
                    const ownUserForAddressing = isLid && decodedMeLid ? decodedMeLid.user : (decodedMeId ? decodedMeId.user : ownUser)
                    
                    devices.push({
                        user: ownUserForAddressing,
                        device: 0,
                        jid: jidEncode(ownUserForAddressing, ownUserServer, 0)
                    })
                }
                
                if (additionalAttributes?.['category'] !== 'peer') {
                    devices.length = 0
                    
                    const decodedMeLid = meLid ? jidDecode(meLid) : null
                    const decodedMeId = jidDecode(meId)
                    const senderIdentity = isLid && decodedMeLid
                        ? jidEncode(decodedMeLid.user, 'lid', undefined)
                        : (decodedMeId ? jidEncode(decodedMeId.user, 's.whatsapp.net', undefined) : null)
                    
                    if (senderIdentity) {
                        const sessionDevices = await getUSyncDevices([senderIdentity, jid], true, false)
                        devices.push(...sessionDevices)
                    }
                    
                    logger.debug({
                        deviceCount: devices.length,
                        devices: devices.map(d => {
                            const dec = jidDecode(d.jid)
                            return `${d.user}:${d.device}@${dec?.server || 'unknown'}`
                        })
                    }, 'Device enumeration complete with unified addressing')
                }
            }
            
            const allRecipients = []
            const meRecipients = []
            const otherRecipients = []
            
            const decodedMeId = jidDecode(meId)
            const mePnUser = decodedMeId ? decodedMeId.user : null
            const decodedMeLid = meLid ? jidDecode(meLid) : null
            const meLidUser = decodedMeLid ? decodedMeLid.user : null
            
            for (const device of devices) {
                const isExactSenderDevice = device.jid === meId || (meLid && device.jid === meLid)
                
                if (isExactSenderDevice) {
                    logger.debug({ jid: device.jid, meId, meLid }, 'Skipping exact sender device (whatsmeow pattern)')
                    continue
                }
                
                const isMe = device.user === mePnUser || device.user === meLidUser
                
                if (isMe) {
                    meRecipients.push(device.jid)
                } else {
                    otherRecipients.push(device.jid)
                }
                
                allRecipients.push(device.jid)
            }
            
            await assertSessions(allRecipients)
            
            const [
                { nodes: meNodes, shouldIncludeDeviceIdentity: s1 },
                { nodes: otherNodes, shouldIncludeDeviceIdentity: s2 }
            ] = await Promise.all([
                createParticipantNodes(meRecipients, meMsg || message, extraAttrs),
                createParticipantNodes(otherRecipients, message, extraAttrs, meMsg)
            ])
            
            participants.push(...meNodes)
            participants.push(...otherNodes)
            
            if (meRecipients.length > 0 || otherRecipients.length > 0) {
                extraAttrs['phash'] = generateParticipantHashV2([...meRecipients, ...otherRecipients])
            }
            
            shouldIncludeDeviceIdentity = shouldIncludeDeviceIdentity || s1 || s2
        }
        
        if (isRetryResend) {
            const isParticipantLid = isLidUser(participant.jid)
            const isMe = areJidsSameUser(participant.jid, isParticipantLid ? meLid : meId)
            const encodedMessageToSend = isMe
                ? encodeWAMessage({
                    deviceSentMessage: {
                        destinationJid,
                        message
                    }
                })
                : encodeWAMessage(message)
            
            const { type, ciphertext: encryptedContent } = await signalRepository.encryptMessage({
                data: encodedMessageToSend,
                jid: participant.jid
            })
            
            binaryNodeContent.push({
                tag: 'enc',
                attrs: {
                    v: '2',
                    type,
                    count: participant.count.toString()
                },
                content: encryptedContent
            })
        }
        
        if (participants.length) {
            if (additionalAttributes?.['category'] === 'peer') {
                const peerNode = participants[0]?.content?.[0]
                if (peerNode) {
                    binaryNodeContent.push(peerNode)
                }
            } else {
                binaryNodeContent.push({
                    tag: 'participants',
                    attrs: {},
                    content: participants
                })
            }
        }
        
        const stanza = {
            tag: 'message',
            attrs: {
                id: msgId,
                to: destinationJid,
                type: getTypeMessage(message),  // ← FIX: getTypeMessage
                ...(additionalAttributes || {})
            },
            content: binaryNodeContent
        }

        if (participant) {
            if (isJidGroup(destinationJid)) {
                stanza.attrs.to = destinationJid
                stanza.attrs.participant = participant.jid
            } else if (areJidsSameUser(participant.jid, meId)) {
                stanza.attrs.to = participant.jid
                stanza.attrs.recipient = destinationJid
            } else {
                stanza.attrs.to = participant.jid
            }
        } else {
            stanza.attrs.to = destinationJid
        }
        
        if (shouldIncludeDeviceIdentity) {
            stanza.content.push({
                tag: 'device-identity',
                attrs: {},
                content: encodeSignedDeviceIdentity(authState.creds.account, true)
            })
            logger.debug({ jid }, 'adding device identity')
        }
        
        // ← FIX: Tambahkan kembali reporting token logic yang hilang
        if (
            !isNewsletter &&
            !isRetryResend &&
            reportingMessage?.messageContextInfo?.messageSecret &&
            typeof shouldIncludeReportingToken === 'function' && 
            shouldIncludeReportingToken(reportingMessage)
        ) {
            try {
                const encoded = encodeWAMessage(reportingMessage)
                const reportingKey = {
                    id: msgId,
                    fromMe: true,
                    remoteJid: destinationJid,
                    participant: participant?.jid
                }
                const reportingNode = await getMessageReportingToken(encoded, reportingMessage, reportingKey)
                if (reportingNode) {
                    stanza.content.push(reportingNode)
                    logger.trace({ jid }, 'added reporting token to message')
                }
            } catch (error) {
                logger.warn({ jid, trace: error?.stack }, 'failed to attach reporting token')
            }
        }

        const isPeerMessage = additionalAttributes?.category === 'peer'
        const is1on1Send = !isGroup && !isRetryResend && !isStatus && !isNewsletter && !isPeerMessage
        
        const tcTokenJid = is1on1Send ? await resolveTcTokenJid(destinationJid, getLIDForPN) : destinationJid
        const contactTcTokenData = is1on1Send ? await authState.keys.get('tctoken', [tcTokenJid]) : {}
        const existingTokenEntry = contactTcTokenData[tcTokenJid]
        let tcTokenBuffer = existingTokenEntry?.token
        
        if (tcTokenBuffer?.length && isTcTokenExpired(existingTokenEntry?.timestamp)) {
            logger.debug({
                jid: destinationJid,
                timestamp: existingTokenEntry?.timestamp
            }, 'tctoken expired, clearing')
            tcTokenBuffer = undefined
            
            const cleared = existingTokenEntry?.senderTimestamp !== undefined
                ? {
                    token: Buffer.alloc(0),
                    senderTimestamp: existingTokenEntry.senderTimestamp
                }
                : null
            
            try {
                await authState.keys.set({
                    tctoken: {
                        [tcTokenJid]: cleared
                    }
                })
            } catch (err) {
                logger.debug({
                    jid: destinationJid,
                    err: err?.message
                }, 'failed to persist tctoken expiry cleanup')
            }
        }

        // ← FIX: suki.serverProps 
        if (tcTokenBuffer?.length && suki.serverProps.privacyTokenOn1to1) {
            stanza.content.push({
                tag: 'tctoken',
                attrs: {},
                content: tcTokenBuffer
            })
        }

        const isProtocolMsg = !!normalizeMessageContent(message)?.protocolMessage
        const isBotOrPSA = destinationJid === PSA_WID || isJidBot(destinationJid) || isJidMetaAI(destinationJid)

        if (
            is1on1Send &&
            !isProtocolMsg &&
            !isBotOrPSA &&
            shouldSendNewTcToken(existingTokenEntry?.senderTimestamp) &&
            !inFlightTcTokenIssuance.has(tcTokenJid)
        ) {
            inFlightTcTokenIssuance.add(tcTokenJid)
            const issueTimestamp = unixTimestampSeconds()
            const getPNForLID = signalRepository.lidMapping.getPNForLID.bind(signalRepository.lidMapping)
            
            // ← FIX: suki.serverProps 
            resolveIssuanceJid(
                destinationJid,
                suki.serverProps.lidTrustedTokenIssueToLid,
                getLIDForPN,
                getPNForLID
            )
                .then(issueJid => issuePrivacyTokens([issueJid], issueTimestamp))
                .then(async result => {
                    await storeTcTokensFromIqResult({
                        result,
                        fallbackJid: tcTokenJid,
                        keys: authState.keys,
                        getLIDForPN
                    })

                    const currentData = await authState.keys.get('tctoken', [tcTokenJid])
                    const currentEntry = currentData[tcTokenJid]
                    const indexWrite = await buildMergedTcTokenIndexWrite(authState.keys, [tcTokenJid])

                    await authState.keys.set({
                        tctoken: {
                            [tcTokenJid]: {
                                token: Buffer.alloc(0),
                                ...currentEntry,
                                senderTimestamp: issueTimestamp
                            },
                            ...indexWrite
                        }
                    })
                })
                .catch(err => {
                    logger.debug({
                        jid: destinationJid,
                        err: err?.message
                    }, 'fire-and-forget tctoken issuance failed')
                })
                .finally(() => {
                    inFlightTcTokenIssuance.delete(tcTokenJid)
                })
        }

        // Custom additions
        if (isGroup && regexGroupOld.test(jid) && !message.reactionMessage) {
            stanza.content.push({
                tag: 'multicast',
                attrs: {}
            })
        }

        if (pollMessage || messages.eventMessage) {
            stanza.content.push({
                tag: 'meta',
                attrs: messages.eventMessage ? {
                    event_type: 'creation'
                } : isNewsletter ? {
                    polltype: 'creation',
                    contenttype: pollMessage?.pollContentType === 2 ? 'image' : 'text'
                } : {
                    polltype: 'creation'
                }
            })
        }

        if (!isNewsletter && buttonType && typeof getButtonArgs === 'function' && typeof getBinaryFilteredButtons === 'function') {
            const buttonsNode = getButtonArgs(messages)
            const filteredButtons = getBinaryFilteredButtons(additionalNodes || [])

            if (filteredButtons) {
                stanza.content.push(...(additionalNodes || []))
                didPushAdditional = true
            } else {
                stanza.content.push(buttonsNode)
            }
        }

        // ← FIX: isPrivate sudah didefinisikan di atas
        if (AI && isPrivate && typeof getBinaryFilteredBizBot === 'function') {
            const botNode = {
                tag: 'bot',
                attrs: {
                    biz_bot: '1'
                }
            }

            const filteredBizBot = getBinaryFilteredBizBot(additionalNodes || [])

            if (filteredBizBot) {
                stanza.content.push(...(additionalNodes || []))
                didPushAdditional = true
            } else {
                stanza.content.push(botNode)
            }
        }

        if (!didPushAdditional && additionalNodes && additionalNodes.length > 0) {
            stanza.content.push(...additionalNodes)
        }

        logger.debug({ msgId }, `sending message to ${participants.length} devices`)
        await sendNode(stanza)
        
        if (messageRetryManager && !participant) {
            messageRetryManager.addRecentMessage(destinationJid, msgId, message)
        }
    }, meId)

    return msgId
}

    const getTypeMessage = (msg) => {
        if (msg.viewOnceMessage) {
            return getTypeMessage(msg.viewOnceMessage.message);
        }
        else if (msg.viewOnceMessageV2) {
            return getTypeMessage(msg.viewOnceMessageV2.message);
        }
        else if (msg.viewOnceMessageV2Extension) {
            return getTypeMessage(msg.viewOnceMessageV2Extension.message);
        }
        else if (msg.ephemeralMessage) {
            return getTypeMessage(msg.ephemeralMessage.message);
        }
        else if (msg.documentWithCaptionMessage) {
            return getTypeMessage(msg.documentWithCaptionMessage.message);
        }
        else if (msg.reactionMessage) {
            return 'reaction';
        }
        else if (msg.pollCreationMessage || msg.pollCreationMessageV2 || msg.pollCreationMessageV3 || msg.pollUpdateMessage) {
            return 'poll';
        }
        else if (getMediaType(msg)) {
            return 'media';
        }
        else {
            return 'text';
        }
    };

    const getMediaType = (message) => {
      if (message.imageMessage) {
            return 'image'
        }
        else if (message.stickerMessage) {
            return message.stickerMessage.isLottie ? '1p_sticker' : message.stickerMessage.isAvatar ? 'avatar_sticker' : 'sticker'
        }
        else if (message.videoMessage) {
            return message.videoMessage.gifPlayback ? 'gif' : 'video'
        }
        else if (message.audioMessage) {
            return message.audioMessage.ptt ? 'ptt' : 'audio'
        }
        else if (message.ptvMessage) {
            return 'ptv'
        }
        else if (message.albumMessage) {
            return 'collection'
        }
        else if (message.contactMessage) {
            return 'vcard'
        }
        else if (message.documentMessage) {
            return 'document'
        }
        else if (message.stickerPackMessage) {
            return 'sticker_pack'
        }
        else if (message.contactsArrayMessage) {
            return 'contact_array'
        }
        else if (message.locationMessage) {
            return 'location'
        }
        else if (message.liveLocationMessage) {
            return 'livelocation'
        }
        else if (message.listMessage) {
            return 'list'
        }
        else if (message.listResponseMessage) {
            return 'list_response'
        }
        else if (message.buttonsResponseMessage) {
            return 'buttons_response'
        }
        else if (message.orderMessage) {
            return 'order'
        }
        else if (message.productMessage) {
            return 'product'
        }
        else if (message.interactiveResponseMessage) {
            return 'native_flow_response'
        }
        else if (/https:\/\/wa\.me\/c\/\d+/.test(message.extendedTextMessage?.text)) {
            return 'cataloglink'
        }
        else if (/https:\/\/wa\.me\/p\/\d+\/\d+/.test(message.extendedTextMessage?.text)) {
            return 'productlink'
        }
        else if (message.extendedTextMessage?.matchedText || message.groupInviteMessage) {
            return 'url'
        }
    }

    const getButtonType = (message) => {
        if (message.listMessage) {
            return 'list'
       }
        else if (message.buttonsMessage) {
            return 'buttons'
        }
        else if(message.interactiveMessage?.nativeFlowMessage) {
            return 'native_flow'
        }
    }

    const getButtonArgs = (message) => {
        const nativeFlow = message.interactiveMessage?.nativeFlowMessage
        const firstButtonName = nativeFlow?.buttons?.[0]?.name
        const nativeFlowSpecials = [
            'mpm', 'cta_catalog', 'send_location',
            'call_permission_request', 'wa_payment_transaction_details',
            'automated_greeting_message_view_catalog'
        ]

        if (nativeFlow && (firstButtonName === 'review_and_pay' || firstButtonName === 'payment_info')) {
                return {
                    tag: 'biz', 
                    attrs: {
                        native_flow_name: firstButtonName === 'review_and_pay' ? 'order_details' : firstButtonName
                }
            } 
        } else if (nativeFlow && nativeFlowSpecials.includes(firstButtonName)) {
            // Only works for WhatsApp Original, not WhatsApp Business
            return {
                tag: 'biz',
                attrs: {
                	actual_actors: '2', 
                	host_storage: '2', 
                	privacy_mode_ts: unixTimestampSeconds().toString()
                }, 
                content: [{
                    tag: 'interactive',
                    attrs: {
                        type: 'native_flow',
                        v: '1'
                    },
                    content: [{
                        tag: 'native_flow',
                        attrs: {
                            v: '2', 
                            name: firstButtonName
                        }
                    }]
                }, 
                {
                	tag: 'quality_control', 
                	attrs: {
                		source_type: 'third_party'
                	}
                }]
            }
        } else if (nativeFlow || message.buttonsMessage) {
            // It works for whatsapp original and whatsapp business
            return {
                tag: 'biz', 
                attrs: {
                	actual_actors: '2', 
                	host_storage: '2', 
                	privacy_mode_ts: unixTimestampSeconds().toString()
                }, 
                content: [{
                    tag: 'interactive', 
                    attrs: {
                        type: 'native_flow', 
                        v: '1'
                    }, 
                    content: [{
                        tag: 'native_flow', 
                        attrs: {
                            v: '9', 
                            name: 'mixed'
                        }
                    }]
                }, 
                {
                	tag: 'quality_control', 
                	attrs: {
                		source_type: 'third_party'
                	}
                }]
            }
        } else if (message.listMessage) {
            return {
                tag: 'biz', 
                attrs: {
                	actual_actors: '2', 
                	host_storage: '2', 
                	privacy_mode_ts: unixTimestampSeconds().toString()
                }, 
                content: [{
                    tag: 'list', 
                    attrs: {
                        v: '2', 
                        type: 'product_list'
                    }
                }, 
                {
                	tag: 'quality_control', 
                	attrs: {
                		source_type: 'third_party'
                	}
                }]
            }
        } else {
            return {
                tag: 'biz', 
                attrs: {
                	actual_actors: '2', 
                	host_storage: '2', 
                	privacy_mode_ts: unixTimestampSeconds().toString()
                }
            }
        }
    }

    const getPrivacyTokens = async (jids) => {
        const t = unixTimestampSeconds().toString()

        const result = await query({
            tag: 'iq',
            attrs: {
                to: S_WHATSAPP_NET,
                type: 'set',
                xmlns: 'privacy'
            },
            content: [
                {
                    tag: 'tokens',
                    attrs: {},
                    content: jids.map(jid => ({
                        tag: 'token',
                        attrs: {
                            jid: jidNormalizedUser(jid),
                            t,
                            type: 'trusted_contact'
                        }
                    }))
                }
            ]
        })

        return result
    }    
    
    const getEphemeralGroup = (jid) => {
    	if (!isJidGroup(jid)) throw new TypeError("Jid should originate from a group!") 
    
        return groupQuery(jid, 'get', [{
        	tag: 'query',
            attrs: {
            	request: 'interactive'
            }
        }])
        .then((groups) => getBinaryNodeChild(groups, 'group'))
        .then((metadata) => getBinaryNodeChild(metadata, 'ephemeral')?.attrs?.expiration || 0) 
    }
    
    const issuePrivacyTokens = async (jids, timestamp) => {
    const t = (timestamp ?? unixTimestampSeconds()).toString()

    const result = await query({
        tag: 'iq',
        attrs: {
            to: S_WHATSAPP_NET,
            type: 'set',
            xmlns: 'privacy'
        },
        content: [
            {
                tag: 'tokens',
                attrs: {},
                content: jids.map(jid => ({
                    tag: 'token',
                    attrs: {
                        jid: jidNormalizedUser(jid),
                        t,
                        type: 'trusted_contact'
                    }
                }))
            }
        ]
    })

    return result
}

    const waUploadToServer = getWAUploadToServer(config, refreshMediaConn)

    const waitForMsgMediaUpdate = bindWaitForEvent(ev, 'messages.media-update')
    
    return {
        ...suki,
        getPrivacyTokens,
        issuePrivacyTokens,
        assertSessions,
        profilePictureUrl, 
        relayMessage,
        sendReceipt,
        sendReceipts,
        readMessages,
        getUSyncDevices,
        refreshMediaConn,
        waUploadToServer,
        getEphemeralGroup, 
        fetchPrivacySettings, 
        messageRetryManager, 
        createParticipantNodes, 
        sendPeerDataOperationMessage, 
        updateMemberLabel, 
        updateMediaMessage: async (message) => {
            const content = assertMediaContent(message.message)
            const mediaKey = content.mediaKey
            const meId = authState.creds.me.id
            const node = await encryptMediaRetryRequest(message.key, mediaKey, meId)
            
            let error = undefined
            
            await Promise.all([
                sendNode(node),
                waitForMsgMediaUpdate(async (update) => {
                    const result = update.find(c => c.key.id === message.key.id)
                    
                    if (result) {
                        if (result.error) {
                            error = result.error
                        }
                        
                        else {
                            try {
                                const media = await decryptMediaRetryData(result.media, mediaKey, result.key.id)
                                
                                if (media.result !== proto.MediaRetryNotification.ResultType.SUCCESS) {
                                    const resultStr = proto.MediaRetryNotification.ResultType[media.result]
                                    
                                    throw new Boom(`Media re-upload failed by device (${resultStr})`, {
                                        data: media,
                                        statusCode: getStatusCodeForMediaRetry(media.result) || 404
                                    })
                                }
                                
                                content.directPath = media.directPath
                                content.url = getUrlFromDirectPath(content.directPath)
                                logger.debug({ directPath: media.directPath, key: result.key }, 'media update successful')
                            }
                            
                            catch (err) {
                                error = err
                            }
                        }
                        
                        return true
                    }
                })
            ])
            
            if (error) {
                throw error
            }
            
            ev.emit('messages.update', [{ key: message.key, update: { message: message.message } }])
            
            return message
        },
        sendStatusMentions: async (content, jids = []) => {
          const userJid = jidNormalizedUser(authState.creds.me.id)
          let allUsers = new Set()
          allUsers.add(userJid)

          for (const id of jids) {
            const isGroup = isJidGroup(id) 
            const isPrivate = isPnUser(id) 

            if (isGroup) {
              try {
                const metadata = await cachedGroupMetadata(id) || await groupMetadata(id)
                const participants = metadata.participants.map(p => jidNormalizedUser(p.id))
                participants.forEach(jid => allUsers.add(jid))
              } catch (error) {
                logger.error(`Error getting metadata for group ${id}: ${error}`)
              }
            } else if (isPrivate) {
              allUsers.add(jidNormalizedUser(id))
            }
          }

          const uniqueUsers = Array.from(allUsers)
          const getRandomHexColor = () => "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, "0")

          const isMedia = content.image || content.video || content.audio
          const isAudio = !!content.audio

          const messageContent = { ...content }

          if (isMedia && !isAudio) {
            if (messageContent.text) {
              messageContent.caption = messageContent.text

              delete messageContent.text
            }

            delete messageContent.ptt
            delete messageContent.font
            delete messageContent.backgroundColor
            delete messageContent.textColor
          }

          if (isAudio) {
            delete messageContent.text
            delete messageContent.caption
            delete messageContent.font
            delete messageContent.textColor
          }

          const font = !isMedia ? (content.font || Math.floor(Math.random() * 9)) : undefined
          const textColor = !isMedia ? (content.textColor || getRandomHexColor()) : undefined
          const backgroundColor = (!isMedia || isAudio) ? (content.backgroundColor || getRandomHexColor()) : undefined
          const ptt = isAudio ? (typeof content.ptt === 'boolean' ? content.ptt : true) : undefined

          let msg
          let mediaHandle
          try {
            msg = await generateWAMessage(STORIES_JID, messageContent, {
              logger,
              userJid,
              getUrlInfo: text => getUrlInfo(text, {
                thumbnailWidth: linkPreviewImageThumbnailWidth,
                fetchOpts: {
                    timeout: 3000,
                    ...(httpRequestOptions || {})
                },
                logger,
                uploadImage: generateHighQualityLinkPreview ? waUploadToServer : undefined
              }),
              upload: async (encFilePath, opts) => {
                const up = await waUploadToServer(encFilePath, { ...opts })
                mediaHandle = up.handle
                return up
              },
              mediaCache: config.mediaCache,
              options: config.options,
              font,
              textColor,
              backgroundColor,
              ptt
            })
          } catch (error) {
            logger.error(`Error generating message: ${error}`)
            throw error
          }

          await relayMessage(STORIES_JID, msg.message, {
            messageId: msg.key.id,
            statusJidList: uniqueUsers, 
            additionalNodes: [
              {
                tag: 'meta',
                attrs: {},
                content: [
                  {
                    tag: 'mentioned_users',
                    attrs: {},
                    content: jids.map(jid => ({
                      tag: 'to',
                      attrs: { jid: jidNormalizedUser(jid) }
                    }))
                  }]
              }]
          })

          for (const id of jids) {
            try {
              const normalizedId = jidNormalizedUser(id)
              const isPrivate = isPnUser(normalizedId) 
              const type = isPrivate ? 'statusMentionMessage' : 'groupStatusMentionMessage'

              const protocolMessage = {
                [type]: {
                  message: {
                    protocolMessage: {
                      key: msg.key,
                      type: 25
                    }
                  }
                },
                messageContextInfo: {
                  messageSecret: randomBytes(32)
                }
              }

              const statusMsg = await generateWAMessageFromContent(normalizedId,
                protocolMessage,
                {}
              )

              await relayMessage(
                normalizedId,
                statusMsg.message,
                {
                  additionalNodes: [{
                    tag: 'meta',
                    attrs: isPrivate ?
                    { is_status_mention: 'true' } :
                    { is_group_status_mention: 'true' }
                  }]
                }
              )

              await delay(2000)
            } catch (error) {
              logger.error(`Error sending to ${id}: ${error}`)
            }
          }

          return msg
        },
        userDevicesCache,
        
    sendMessage: async (jid, content, options = {}) => {
    const userJid = authState.creds.me.id
    const isObj = typeof content === 'object' && content !== null

    let mediaHandle
    let additionalAttributes = {}

    const buildAttributes = () => ({})

    if (options.ephemeralExpiration === undefined && isJidGroup(jid)) {
        options.ephemeralExpiration = await getEphemeralGroup(jid)
    }

    if (
        isObj &&
        'disappearingMessagesInChat' in content &&
        content.disappearingMessagesInChat !== undefined &&
        isJidGroup(jid)
    ) {
        const value =
            typeof content.disappearingMessagesInChat === 'boolean'
                ? (
                    content.disappearingMessagesInChat
                        ? WA_DEFAULT_EPHEMERAL
                        : 0
                )
                : content.disappearingMessagesInChat

        await groupToggleEphemeral(jid, value)
        return
    }

    if (isObj && content.groupStatusMessage) {
        const storyData = content.groupStatusMessage
        let waMsgContent

        if (storyData.message) {
            waMsgContent = storyData
        } else {
            const generateContent = generateWAMessageContent

            waMsgContent = await generateContent(storyData, {
                upload: waUploadToServer
            })
        }

        const msg = {
            groupStatusMessageV2: {
                message: waMsgContent.message || waMsgContent
            }
        }

        return await relayMessage(jid, msg, {
            messageId: generateMessageID()
        })
    }

    if (isObj && content.album) {
        const albumMsg = await prepareAlbumMessageContent(
            jid,
            content.album,
            {
                suki: {
                    relayMessage,
                    waUploadToServer
                },
                userJid,
                ...options
            }
        )

        const results = []

        for (const media of albumMsg) {
            await delay(options.delay ?? 500)

            const attrs = buildAttributes()

            await relayMessage(jid, media.message, {
                messageId: media.key.id,
                useCachedGroupMetadata:
                    options.useCachedGroupMetadata,
                additionalAttributes: attrs,
                statusJidList: options.statusJidList,
                additionalNodes: options.additionalNodes,
                AI: options.ai
            })

            results.push(media)
        }

        return results
    }

    const fullMsg = await generateWAMessage(jid, content, {
        logger,
        userJid,

        getUrlInfo: text =>
            getUrlInfo(text, {
                thumbnailWidth:
                    linkPreviewImageThumbnailWidth,
                fetchOpts: {
                    timeout: 3000,
                    ...(httpRequestOptions || {})
                },
                logger,
                uploadImage:
                    generateHighQualityLinkPreview
                        ? waUploadToServer
                        : undefined
            }),

        getProfilePicUrl: profilePictureUrl,
        getCallLink: createCallLink,

        upload: async (readStream, opts) => {
            const up = await waUploadToServer(
                readStream,
                {
                    ...opts,
                    newsletter:
                        isJidNewsletter(jid)
                }
            )

            mediaHandle = up.handle
            return up
        },

        mediaCache: config.mediaCache,
        options: config.options,
        messageId: generateMessageID(userJid),
        ...options
    })

    const isPin = isObj && content.pin
    const isEdit = isObj && content.edit
    const isDelete = isObj && content.delete
    const isKeep =
        isObj && content.keep?.type === 2

    const isPollMessage =
        isObj && !!content.poll

    const isEventMsg =
        isObj && !!content.event

    if (isDelete || isKeep) {
        const isGroupAdminDelete =
            isJidGroup(content.delete?.remoteJid) &&
            !content.delete?.fromMe

        additionalAttributes.edit =
            isGroupAdminDelete ||
            isJidNewsletter(jid)
                ? '8'
                : '7'
    } else if (isEdit) {
        additionalAttributes.edit =
            isJidNewsletter(jid)
                ? '3'
                : '1'
    } else if (isPin) {
        additionalAttributes.edit = '2'
    }

    if (mediaHandle) {
        additionalAttributes.media_id =
            mediaHandle
    }
    
    const internalAdditionalNodes = []
    
    if (isObj && content.ai === true) {
        const msgType = Object.keys(fullMsg.message || {})[0]
        const msgContent =
        fullMsg.message?.[msgType]
    
    if (
        msgType &&
        msgContent &&
        typeof msgContent === 'object'
    ) {
        msgContent.contextInfo = {
            ...(msgContent.contextInfo || {}),
            businessMessageType: 3,
            aiMessageMetadata: {
                isAiMessage: true
            }
        }
    }
        
        internalAdditionalNodes.push({
           tag: 'bot',
           attrs: {
              biz_bot: '1'
        }
    })
}

    if (isPollMessage) {
        internalAdditionalNodes.push({
            tag: 'meta',
            attrs: {
                polltype: 'creation'
            }
        })
    } else if (isEventMsg) {
        internalAdditionalNodes.push({
            tag: 'meta',
            attrs: {
                event_type: 'creation'
            }
        })
    }

    await relayMessage(jid, fullMsg.message, {
        messageId: fullMsg.key.id,
        useCachedGroupMetadata:
            options.useCachedGroupMetadata,
        additionalAttributes,
        statusJidList:
            options.statusJidList,
        additionalNodes: [
            ...(options.additionalNodes || []),
            ...internalAdditionalNodes
        ],
        AI: options.ai
    })

    if (config.emitOwnEvents) {
        process.nextTick(async () => {
            await messageMutex.mutex(() =>
                upsertMessage(
                    fullMsg,
                    'append'
                )
            )
        })
    }

    return fullMsg
}
    }
}

module.exports = {
  makeMessagesSocket
}