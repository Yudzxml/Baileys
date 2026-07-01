"use strict"

Object.defineProperty(exports, "__esModule", { value: true })

const { default: NodeCache } = require("@cacheable/node-cache")
const { Boom } = require("@hapi/boom")
const { randomBytes } = require("crypto")
const { proto } = require("../../WAProto")
const {
  KEY_BUNDLE_TYPE, 
  MIN_PREKEY_COUNT, 
  DEFAULT_CACHE_TTLS
} = require("../Defaults/constants")
const {
  XWAPaths, 
  XWAPathsMexUpdates, 
  MexOperations, 
  MexUpdatesOperations, 
  WAMessageStubType,
  WAMessageStatus
} = require("../Types")
const { 
  aesDecryptCTR, 
  aesEncryptGCM, 
  cleanMessage, 
  Curve, 
  decodeMediaRetryNode, 
  decodeMessageNode, 
  decryptMessageNode, 
  delay, 
  derivePairingCodeKey, 
  encodeBigEndian, 
  encodeSignedDeviceIdentity, 
  extractAddressingContext,
  extractE2ESessionFromRetryReceipt,
  getCallStatusFromNode,
  getHistoryMsg, 
  getNextPreKeys, 
  getStatusFromReceiptType, 
  handleIdentityChange,
  hkdf,
  NO_MESSAGE_FOUND_ERROR_TEXT, 
  MISSING_KEYS_ERROR_TEXT, 
  NACK_REASONS, 
  unixTimestampSeconds, 
  xmppPreKey, 
  xmppSignedPreKey, 
  generateMessageID
} = require("../Utils")
const { 
  areJidsSameUser,
  binaryNodeToString, 
  getAllBinaryNodeChildren, 
  getBinaryNodeChild, 
  getBinaryNodeChildBuffer, 
  getBinaryNodeChildren, 
  getBinaryNodeChildString,
  getBinaryNodeChildUInt,
  isJidGroup, 
  isJidNewsletter, 
  isJidStatusBroadcast, 
  isLidUser,
  isPnUser, 
  jidDecode, 
  jidNormalizedUser, 
  S_WHATSAPP_NET 
} = require("../WABinary")

const {
  buildMergedTcTokenIndexWrite,
  isTcTokenExpired,
  readTcTokenIndex,
  resolveIssuanceJid,
  resolveTcTokenJid,
  storeTcTokensFromIqResult,
  TC_TOKEN_INDEX_KEY
} = require('../Utils/tc-token-utils.js')

const { extractGroupMetadata } = require("./groups")
const { makeMutex } = require("../Utils/make-mutex")
const { makeMessagesSocket } = require("./messages-send")

const makeMessagesRecvSocket = (config) => {
    const { 
        logger, 
        retryRequestDelayMs,
        maxMsgRetryCount, 
        getMessage, 
        shouldIgnoreJid, 
        enableAutoSessionRecreation 
    } = config
    
    const suki = makeMessagesSocket(config)
    
    const {
        ev, 
        authState, 
        ws, 
        messageMutex, 
        notificationMutex, 
        receiptMutex, 
        signalRepository, 
        query, 
        upsertMessage, 
        resyncAppState, 
        onUnexpectedError, 
        assertSessions,
        sendNode, 
        relayMessage, 
        sendReceipt, 
        uploadPreKeys, 
        groupMetadata, 
        getUSyncDevices,
        createParticipantNodes,
        messageRetryManager, 
        sendPeerDataOperationMessage,
        issuePrivacyTokens,
        userDevicesCache,
        devicesMutex
     } = suki
    
    const getLIDForPN = signalRepository?.lidMapping?.getLIDForPN?.bind(signalRepository.lidMapping)
    
    const retryMutex = makeMutex()
    
    const msgRetryCache = config.msgRetryCounterCache || new NodeCache({
        stdTTL: DEFAULT_CACHE_TTLS.MSG_RETRY,
        useClones: false
    })
    
    const callOfferCache = config.callOfferCache || new NodeCache({
        stdTTL: DEFAULT_CACHE_TTLS.CALL_OFFER,
        useClones: false
    })
    
    const placeholderResendCache = config.placeholderResendCache || new NodeCache({
        stdTTL: DEFAULT_CACHE_TTLS.MSG_RETRY,
        useClones: false
    })
    
    const identityAssertDebounce = new NodeCache({
        stdTTL: 5,
        useClones: false
    })
    
    let sendActiveReceipts = false
    const inFlightPreKeyLow = new Set()
    const tcTokenKnownJids = new Set()

    const tcTokenIndexLoaded = (async () => {
        try {
            const jids = await readTcTokenIndex(authState.keys)
            for (const jid of jids) tcTokenKnownJids.add(jid)
            logger.debug({ count: tcTokenKnownJids.size }, 'loaded tctoken index')
        } catch (err) {
            logger.warn({ err: err?.message }, 'failed to load tctoken index')
        }
    })()

    let tcTokenIndexTimer = null

    async function flushTcTokenIndex() {
        if (tcTokenIndexTimer) {
            clearTimeout(tcTokenIndexTimer)
            tcTokenIndexTimer = null
        }
        const write = await buildMergedTcTokenIndexWrite(authState.keys, tcTokenKnownJids)
        return authState.keys.set({ tctoken: write })
    }

    function scheduleTcTokenIndexSave() {
        if (tcTokenIndexTimer) {
            clearTimeout(tcTokenIndexTimer)
        }
        tcTokenIndexTimer = setTimeout(() => {
            tcTokenIndexTimer = null
            flushTcTokenIndex().catch(err => {
                logger.warn({ err: err?.message }, 'failed to save tctoken index')
            })
        }, 5000)
    }

    function trackTcTokenJid(jid) {
        if (jid && jid !== TC_TOKEN_INDEX_KEY && !tcTokenKnownJids.has(jid)) {
            tcTokenKnownJids.add(jid)
            scheduleTcTokenIndexSave()
        }
    }

    const fetchMessageHistory = async (count, oldestMsgKey, oldestMsgTimestamp) => {
        if (!authState.creds.me?.id) {
            throw new Boom('Not authenticated')
        }
        
        const pdoMessage = {
            historySyncOnDemandRequest: {
                chatJid: oldestMsgKey.remoteJid,
                oldestMsgFromMe: oldestMsgKey.fromMe,
                oldestMsgId: oldestMsgKey.id,
                oldestMsgTimestampMs: oldestMsgTimestamp,
                onDemandMsgCount: count
            },
            peerDataOperationRequestType: proto.Message.PeerDataOperationRequestType.HISTORY_SYNC_ON_DEMAND
        }
        
        return sendPeerDataOperationMessage(pdoMessage)
    }
    
    const requestPlaceholderResend = async (messageKey, msgData) => {
        if (!authState.creds.me?.id) {
            throw new Boom('Not authenticated')
        }
        
        if (await placeholderResendCache.get(messageKey?.id)) {
            logger.debug({ messageKey }, 'already requested resend')
            return
        }
        
        else {
            await placeholderResendCache.set(messageKey?.id, msgData || true)
        }
        
        await delay(2000)
        
        if (!(await placeholderResendCache.get(messageKey?.id))) {
            logger.debug({ messageKey }, 'message received while resend requested')
            return 'RESOLVED'
        }
        
        const pdoMessage = {
            placeholderMessageResendRequest: [
                {
                    messageKey
                }
            ],
            peerDataOperationRequestType: proto.Message.PeerDataOperationRequestType.PLACEHOLDER_MESSAGE_RESEND
        }
        
        setTimeout(async () => {
            if (await placeholderResendCache.get(messageKey?.id)) {
                logger.debug({ messageKey }, 'PDO message without response after 8 seconds. Phone possibly offline')
                await placeholderResendCache.del(messageKey?.id)
            }
        }, 8000)
        
        return sendPeerDataOperationMessage(pdoMessage)
    }
    
    const buildAckStanza = (node, errorCode, meId) => {
        const { tag, attrs } = node
        const stanza = {
            tag: 'ack',
            attrs: {
                id: attrs.id,
                to: attrs.from,
                class: tag
            }
        }
        if (errorCode) {
            stanza.attrs.error = errorCode.toString()
        }
        if (attrs.participant) {
            stanza.attrs.participant = attrs.participant
        }
        if (attrs.recipient) {
            stanza.attrs.recipient = attrs.recipient
        }
        if (attrs.type) {
            stanza.attrs.type = attrs.type
        }
        if (tag === 'message' && meId) {
            stanza.attrs.from = meId
        }
        return stanza
    }

    const sendMessageAck = async ({ tag, attrs, content }, errorCode) => {
        const node = { tag, attrs, content }
        const stanza = buildAckStanza(node, errorCode, authState?.creds?.me?.id)
        logger.debug({ recv: { tag, attrs }, sent: stanza.attrs }, 'sent ack')
        await sendNode(stanza)
    }
    
    const offerCall = async (toJid, isVideo = false) => {
        const callId = randomBytes(16).toString('hex').toUpperCase().substring(0, 64)
        const offerContent = []
        offerContent.push({ tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined })
        offerContent.push({ tag: 'audio', attrs: { enc: 'opus', rate: '8000' }, content: undefined })
        
        if (isVideo) {
            offerContent.push({
                tag: 'video',
                attrs: { enc: 'vp8', dec: 'vp8', orientation: '0', 'screen_width': '1920', 'screen_height': '1080', 'device_orientation': '0' },
                content: undefined
            })
        }
        offerContent.push({ tag: 'net', attrs: { medium: '3' }, content: undefined })
        offerContent.push({ tag: 'capability', attrs: { ver: '1' }, content: new Uint8Array([1, 4, 255, 131, 207, 4]) })
        offerContent.push({ tag: 'encopt', attrs: { keygen: '2' }, content: undefined })
        
        const encKey = randomBytes(32)
        const devices = (await getUSyncDevices([toJid], true, false)).map(({ user, device }) => jidEncode(user, 's.whatsapp.net', device))
        await assertSessions(devices, true)
        
        const { nodes: destinations, shouldIncludeDeviceIdentity } = await createParticipantNodes(devices, {
            call: {
                callKey: new Uint8Array(encKey)
            }
        }, { count: '0' })
        offerContent.push({ tag: 'destination', attrs: {}, content: destinations })
        
        if (shouldIncludeDeviceIdentity) {
            offerContent.push({
                tag: 'device-identity',
                attrs: {},
                content: encodeSignedDeviceIdentity(authState.creds.account, true)
            })
        }
        
        const stanza = ({
            tag: 'call',
            attrs: {
                id: generateMessageID(),
                to: toJid,
            },
            content: [{
                    tag: 'offer',
                    attrs: {
                        'call-id': callId,
                        'call-creator': authState.creds.me.id,
                    },
                    content: offerContent,
                }],
        })
        
        await query(stanza)
        
        return {
            id: callId,
            to: toJid
        }
    }
    
    const rejectCall = async (callId, callFrom) => {
        const stanza = ({
            tag: 'call',
            attrs: {
                from: authState.creds.me.id,
                to: callFrom,
            },
            content: [{
                    tag: 'reject',
                    attrs: {
                        'call-id': callId,
                        'call-creator': callFrom,
                        count: '0',
                    },
                    content: undefined,
                }],
        })
        
        await query(stanza)
    }
    
    const sendRetryRequest = async (node, forceIncludeKeys = false) => {
        const { fullMessage } = decodeMessageNode(node, authState.creds.me.id, authState.creds.me.lid || '')
        const { key: msgKey } = fullMessage
        const msgId = msgKey.id
        
        if (messageRetryManager) {
            if (messageRetryManager.hasExceededMaxRetries(msgId)) {
                logger.debug({ msgId }, 'reached retry limit with new retry manager, clearing')
                messageRetryManager.markRetryFailed(msgId)
                return
            }
            
            const retryCount = messageRetryManager.incrementRetryCount(msgId)
            const key = `${msgId}:${msgKey?.participant}`
            await msgRetryCache.set(key, retryCount)
        }
        
        else {
            const key = `${msgId}:${msgKey?.participant}`
            let retryCount = (await msgRetryCache.get(key)) || 0
            
            if (retryCount >= maxMsgRetryCount) {
                logger.debug({ retryCount, msgId }, 'reached retry limit, clearing')
                await msgRetryCache.del(key)
                return
            }
            
            retryCount += 1
            await msgRetryCache.set(key, retryCount)
        }
        
        const key = `${msgId}:${msgKey?.participant}`
        const retryCount = (await msgRetryCache.get(key)) || 1
        const { account, signedPreKey, signedIdentityKey: identityKey } = authState.creds
        const fromJid = node.attrs.from
        
        let shouldRecreateSession = false
        let recreateReason = ''
        
        if (enableAutoSessionRecreation && messageRetryManager) {
            try {
                const sessionId = signalRepository.jidToSignalProtocolAddress(fromJid)
                const hasSession = await signalRepository.validateSession(fromJid)
                const result = messageRetryManager.shouldRecreateSession(fromJid, retryCount, hasSession.exists)
                
                shouldRecreateSession = result.recreate
                recreateReason = result.reason
                
                if (shouldRecreateSession) {
                    logger.debug({ fromJid, retryCount, reason: recreateReason }, 'recreating session for retry')
                    await authState.keys.set({ session: { [sessionId]: null } })
                    forceIncludeKeys = true
                }
            }
            catch (error) {
                logger.warn({ error, fromJid }, 'failed to check session recreation')
            }
        }
        
        if (retryCount <= 2) {
            if (messageRetryManager) {
                messageRetryManager.schedulePhoneRequest(msgId, async () => {
                    try {
                        const requestId = await requestPlaceholderResend(msgKey, fullMessage)
                        logger.debug(`sendRetryRequest: requested placeholder resend (${requestId}) for message ${msgId} (scheduled)`)
                    }
                    catch (error) {
                        logger.warn({ error, msgId }, 'failed to send scheduled phone request')
                    }
                })
            }
            else {
                const requestId = await requestPlaceholderResend(msgKey, fullMessage)
                logger.debug(`sendRetryRequest: requested placeholder resend for message ${msgId}`)
            }
        }
        
        const deviceIdentity = encodeSignedDeviceIdentity(account, true)
        
        await authState.keys.transaction(async () => {
            const receipt = {
                tag: 'receipt',
                attrs: {
                    id: msgId,
                    type: 'retry',
                    to: node.attrs.from
                },
                content: [
                    {
                        tag: 'retry',
                        attrs: {
                            count: retryCount.toString(),
                            id: node.attrs.id,
                            t: node.attrs.t,
                            v: '1',
                            error: '0'
                        }
                    },
                    {
                        tag: 'registration',
                        attrs: {},
                        content: encodeBigEndian(authState.creds.registrationId)
                    }
                ]
            }
            
            if (node.attrs.recipient) {
                receipt.attrs.recipient = node.attrs.recipient
            }
            
            if (node.attrs.participant) {
                receipt.attrs.participant = node.attrs.participant
            }
            
            if (retryCount > 1 || forceIncludeKeys || shouldRecreateSession) {
                const { update, preKeys } = await getNextPreKeys(authState, 1)
                const [keyId] = Object.keys(preKeys)
                const key = preKeys[+keyId]
                const content = receipt.content
                
                content.push({
                    tag: 'keys',
                    attrs: {},
                    content: [
                        { tag: 'type', attrs: {}, content: Buffer.from(KEY_BUNDLE_TYPE) },
                        { tag: 'identity', attrs: {}, content: identityKey.public },
                        xmppPreKey(key, +keyId),
                        xmppSignedPreKey(signedPreKey),
                        { tag: 'device-identity', attrs: {}, content: deviceIdentity }
                    ]
                })
                
                ev.emit('creds.update', update)
            }
            
            await sendNode(receipt)
            logger.info({ msgAttrs: node.attrs, retryCount }, 'sent retry receipt')
        }, authState?.creds?.me?.id || 'sendRetryRequest')
    }

    const reissueTcTokenAfterIdentityChange = (from) => {
        (async () => {
            const normalizedJid = jidNormalizedUser(from)
            const tcJid = await resolveTcTokenJid(normalizedJid, getLIDForPN)
            const tcTokenData = await authState.keys.get('tctoken', [tcJid])
            const senderTs = tcTokenData?.[tcJid]?.senderTimestamp

            if (senderTs === null || senderTs === undefined || isTcTokenExpired(senderTs)) {
                return
            }

            logger.debug({ jid: normalizedJid, senderTimestamp: senderTs }, 'identity changed, re-issuing tctoken')
            const getPNForLID = signalRepository?.lidMapping?.getPNForLID?.bind(signalRepository.lidMapping)
            const issueJid = await resolveIssuanceJid(
                normalizedJid,
                suki.serverProps?.lidTrustedTokenIssueToLid,
                getLIDForPN,
                getPNForLID
            )
            const result = await issuePrivacyTokens([issueJid], senderTs)
            await storeTcTokensFromIqResult({
                result,
                fallbackJid: tcJid,
                keys: authState.keys,
                getLIDForPN,
                onNewJidStored: trackTcTokenJid
            })
        })().catch(err => {
            logger.debug({ jid: from, err: err?.message }, 'failed to re-issue tctoken after identity change')
        })
    }
    
    const handleEncryptNotification = async (node) => {
        const from = node.attrs.from
        
        if (from === S_WHATSAPP_NET) {
            const stanzaId = node.attrs.id
            if (stanzaId && inFlightPreKeyLow.has(stanzaId)) {
                return
            }

            const countChild = getBinaryNodeChild(node, 'count')
            const count = +countChild.attrs.value
            const shouldUploadMorePreKeys = count < MIN_PREKEY_COUNT
            
            logger.debug({ count, shouldUploadMorePreKeys }, 'recv pre-key count')
            
            if (shouldUploadMorePreKeys) {
                if (stanzaId) inFlightPreKeyLow.add(stanzaId)
                try {
                    await uploadPreKeys()
                } finally {
                    if (stanzaId) inFlightPreKeyLow.delete(stanzaId)
                }
            }
        } 
        else {
            const result = await handleIdentityChange(node, {
                meId: authState.creds.me?.id,
                meLid: authState.creds.me?.lid,
                validateSession: signalRepository.validateSession,
                assertSessions,
                debounceCache: identityAssertDebounce,
                logger,
                onBeforeSessionRefresh: reissueTcTokenAfterIdentityChange
            })

            if (result.action === 'no_identity_node') {
                logger.info({ node }, 'unknown encrypt notification')
            }
        }
    }
    
    const handleGroupNotification = (fullNode, child, msg) => {
        const actingParticipantLid = fullNode.attrs.participant
        const actingParticipantPn = fullNode.attrs.participant_pn
        const affectedParticipantLid = getBinaryNodeChild(child, 'participant')?.attrs?.jid || actingParticipantLid
        const affectedParticipantPn = getBinaryNodeChild(child, 'participant')?.attrs?.phone_number || actingParticipantPn
        
        switch (child?.tag) {
            case 'create':
                const metadata = extractGroupMetadata(child)
                msg.messageStubType = WAMessageStubType.GROUP_CREATE
                msg.messageStubParameters = [metadata.subject]
                msg.key = { participant: metadata.owner, participantAlt: metadata.ownerPn }
                
                ev.emit('chats.upsert', [{
                    id: metadata.id,
                    name: metadata.subject,
                    conversationTimestamp: metadata.creation
                }])
                
                ev.emit('groups.upsert', [{
                    ...metadata,
                    author: actingParticipantLid,
                    authorPn: actingParticipantPn
                }])
                break
            case 'ephemeral':
            case 'not_ephemeral':
                msg.message = {
                    protocolMessage: {
                        type: proto.Message.ProtocolMessage.Type.EPHEMERAL_SETTING,
                        ephemeralExpiration: +(child.attrs.expiration || 0)
                    }
                }
                break
            case 'modify':
                const oldNumber = getBinaryNodeChildren(child, 'participant').map(p => p.attrs.jid)
                msg.messageStubParameters = oldNumber || []
                msg.messageStubType = WAMessageStubType.GROUP_PARTICIPANT_CHANGE_NUMBER
                break
            case 'promote':
            case 'demote':
            case 'remove':
            case 'add':
            case 'leave':
                const stubType = `GROUP_PARTICIPANT_${child.tag.toUpperCase()}`
                msg.messageStubType = WAMessageStubType[stubType]
                const participants = getBinaryNodeChildren(child, 'participant').map(({ attrs }) => {
                    return {
                        id: attrs.jid,
                        phoneNumber: isLidUser(attrs.jid) && isPnUser(attrs.phone_number) ? attrs.phone_number : undefined,
                        lid: isPnUser(attrs.jid) && isLidUser(attrs.lid) ? attrs.lid : undefined,
                        admin: (attrs.type || null)
                    }
                })
                
                if (participants.length === 1 &&
                    (areJidsSameUser(participants[0].id, actingParticipantLid) ||
                        areJidsSameUser(participants[0].id, actingParticipantPn)) &&
                    child.tag === 'remove') {
                    msg.messageStubType = WAMessageStubType.GROUP_PARTICIPANT_LEAVE
                }
                
                msg.messageStubParameters = participants.map(a => JSON.stringify(a))
                break
            case 'subject':
                msg.messageStubType = WAMessageStubType.GROUP_CHANGE_SUBJECT
                msg.messageStubParameters = [child.attrs.subject]
                break
            case 'description':
                const description = getBinaryNodeChild(child, 'body')?.content?.toString()
                msg.messageStubType = WAMessageStubType.GROUP_CHANGE_DESCRIPTION
                msg.messageStubParameters = description ? [description] : undefined
                break
            case 'announcement':
            case 'not_announcement':
                msg.messageStubType = WAMessageStubType.GROUP_CHANGE_ANNOUNCE
                msg.messageStubParameters = [child.tag === 'announcement' ? 'on' : 'off']
                break
            case 'locked':
            case 'unlocked':
                msg.messageStubType = WAMessageStubType.GROUP_CHANGE_RESTRICT
                msg.messageStubParameters = [child.tag === 'locked' ? 'on' : 'off']
                break
            case 'invite':
                msg.messageStubType = WAMessageStubType.GROUP_CHANGE_INVITE_LINK
                msg.messageStubParameters = [child.attrs.code]
                break
            case 'member_add_mode':
                const addMode = child.content;
                if (addMode) {
                    msg.messageStubType = WAMessageStubType.GROUP_MEMBER_ADD_MODE
                    msg.messageStubParameters = [addMode.toString()]
                }
                break
            case 'membership_approval_mode':
                const approvalMode = getBinaryNodeChild(child, 'group_join')
                if (approvalMode) {
                    msg.messageStubType = WAMessageStubType.GROUP_MEMBERSHIP_JOIN_APPROVAL_MODE
                    msg.messageStubParameters = [approvalMode.attrs.state]
                }
                break
            case 'created_membership_requests':
                msg.messageStubType = WAMessageStubType.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD
                msg.messageStubParameters = [
                    JSON.stringify({ lid: affectedParticipantLid, pn: affectedParticipantPn }),
                    'created',
                    child.attrs.request_method
                ]
                break
            case 'revoked_membership_requests':
                const isDenied = areJidsSameUser(affectedParticipantLid, actingParticipantLid)
                msg.messageStubType = WAMessageStubType.GROUP_MEMBERSHIP_JOIN_APPROVAL_REQUEST_NON_ADMIN_ADD
                msg.messageStubParameters = [
                    JSON.stringify({ lid: affectedParticipantLid, pn: affectedParticipantPn }),
                    isDenied ? 'revoked' : 'rejected'
                ]
                break
        }
    }
    
    const handleNewsletterNotification = (id, node) => {
        const serverId = node.attrs.server_id
        const reactionsList = getBinaryNodeChild(node, 'reactions')
        const viewsList = getBinaryNodeChild(node, 'views_count')

        if (reactionsList) {
            const reactions = getBinaryNodeChild(reactionsList, 'reaction')

            if (reactions && reactions.length === 0) {
                ev.emit('newsletter.reaction', {
                    id,
                    newsletter_server_id: serverId,
                    reaction: { removed: true }
                })
            }

            if (reactions && reactions.forEach) {
                reactions.forEach(item => {
                    ev.emit('newsletter.reaction', {
                        id,
                        newsletter_server_id: serverId,
                        reaction: {
                            code: item.attrs?.code,
                            count: +item.attrs.count
                        }
                    })
                })
            }
        }

        if (viewsList && viewsList.length) {
            viewsList.forEach(item => {
                ev.emit('newsletter.view', {
                    id,
                    newsletter_server_id: serverId,
                    count: +item.attrs.count
                })
            })
        }
    }
    
    const handleMexNotification = (id, node) => {
        try {
            const operation = node?.attrs?.op_name
            if (!operation) return

            let content = {}
            try {
                content = typeof node?.content === 'string'
                    ? JSON.parse(node.content)
                    : node?.content || {}
            } catch (err) {
                logger?.warn?.({ err, node }, 'Failed to parse mex content')
                return
            }

            let contentPath
            let action

            if (operation === MexOperations.UPDATE) {
                contentPath = content?.data?.[XWAPaths.METADATA_UPDATE]
                if (!contentPath?.thread_metadata?.settings) return
                ev.emit('newsletter-settings.update', {
                    id,
                    update: contentPath.thread_metadata.settings
                })
                return
            }

            if (operation === MexUpdatesOperations.GROUP_MEMBER_LINK) {
                contentPath = content?.data?.[XWAPathsMexUpdates.GROUP_SHARING_CHANGE]
                if (!contentPath?.properties) return
                ev.emit('groups.update', [{
                    id,
                    author: contentPath?.updated_by?.id,
                    member_link_mode: contentPath?.properties?.member_link_mode
                }])
                return
            }

            if (operation === MexUpdatesOperations.GROUP_LIMIT_SHARING) {
                contentPath = content?.data?.[XWAPathsMexUpdates.GROUP_SHARING_CHANGE]
                const limitSharing = contentPath?.properties?.limit_sharing
                if (!limitSharing) return
                ev.emit('limit-sharing.update', {
                    id,
                    author: contentPath?.updated_by?.pn || contentPath?.updated_by?.id,
                    action: limitSharing?.limit_sharing_enabled ? 'on' : 'off',
                    trigger: limitSharing?.limit_sharing_trigger,
                    update_time: contentPath?.update_time
                })
                return
            }

            if (operation === MexUpdatesOperations.OWNER_COMMUNITY) {
                contentPath = content?.data?.[XWAPathsMexUpdates.COMMUNITY_OWNER_CHANGE]
                const roleUpdate = contentPath?.role_updates?.[0]
                if (!roleUpdate) return
                ev.emit('community-owner.update', {
                    id,
                    author: contentPath?.updated_by?.pn || contentPath?.updated_by?.id,
                    user: roleUpdate?.user?.pn || roleUpdate?.user?.jid,
                    new_role: roleUpdate?.new_role,
                    update_time: contentPath?.update_time
                })
                return
            }

            if (operation === MexOperations.PROMOTE) {
                action = 'promote'
                contentPath = content?.data?.[XWAPaths.PROMOTE]
            } else if (operation === MexOperations.DEMOTE) {
                action = 'demote'
                contentPath = content?.data?.[XWAPaths.DEMOTE]
            } else {
                return
            }

            if (!contentPath?.actor || !contentPath?.user) {
                logger?.debug?.({ operation, content }, 'Missing promote/demote contentPath')
                return
            }

            ev.emit('newsletter-participants.update', {
                id,
                author: contentPath?.actor?.pn || contentPath?.actor?.id,
                user: contentPath?.user?.pn || contentPath?.user?.id,
                new_role: contentPath?.user_new_role,
                action
            })

        } catch (err) {
            logger?.error?.({ err, node, id }, 'handleMexNotification crashed')
        }
    }

    const processNotification = async (node) => {
        const result = {}
        const [child] = getAllBinaryNodeChildren(node)
        const nodeType = node.attrs.type
        const from = jidNormalizedUser(node.attrs.from)
        
        switch (nodeType) {
            case 'w:gp2':
                handleGroupNotification(node, child, result)
                break
            case 'newsletter':
                handleNewsletterNotification(node.attrs.from, child) 
                break
            case 'mex':
                handleMexNotification(node.attrs.from, child, result) 
                break
            case 'mediaretry':
                const event = decodeMediaRetryNode(node)
                ev.emit('messages.media-update', [event])
                break
            case 'encrypt':
                await handleEncryptNotification(node)
                break
            case 'devices':
                const devices = getBinaryNodeChildren(child, 'device')
                if (areJidsSameUser(child.attrs.jid, authState.creds.me.id) ||
                    areJidsSameUser(child.attrs.lid, authState.creds.me.lid)) {
                    const deviceData = devices.map(d => ({ id: d.attrs.jid, lid: d.attrs.lid }))
                    logger.info({ deviceData }, 'my own devices changed')
                }
                break
            case 'server_sync':
                const update = getBinaryNodeChild(node, 'collection')
                if (update) {
                    const name = update.attrs.name
                    await resyncAppState([name], false)
                }
                break
            case 'picture':
                const setPicture = getBinaryNodeChild(node, 'set')
                const delPicture = getBinaryNodeChild(node, 'delete')
                
                ev.emit('contacts.update', [{
                    id: jidNormalizedUser(node?.attrs?.from) || (setPicture || delPicture)?.attrs?.hash || '',
                    imgUrl: setPicture ? 'changed' : 'removed'
                }])
                
                if (isJidGroup(from)) {
                    const picNode = setPicture || delPicture
                    result.messageStubType = WAMessageStubType.GROUP_CHANGE_ICON
                    if (setPicture) {
                        result.messageStubParameters = [setPicture.attrs.id]
                    }
                    result.participant = picNode?.attrs.author
                    result.key = {
                        ...(result.key || {}),
                        participant: setPicture?.attrs.author
                    }
                }
                break
            case 'account_sync':
                if (child.tag === 'disappearing_mode') {
                    const newDuration = +child.attrs.duration
                    const timestamp = +child.attrs.t
                    logger.info({ newDuration }, 'updated account disappearing mode')
                    ev.emit('creds.update', {
                        accountSettings: {
                            ...authState.creds.accountSettings,
                            defaultDisappearingMode: {
                                ephemeralExpiration: newDuration,
                                ephemeralSettingTimestamp: timestamp
                            }
                        }
                    })
                }
                else if (child.tag === 'blocklist') {
                    const blocklists = getBinaryNodeChildren(child, 'item')
                    for (const { attrs } of blocklists) {
                        const blocklist = [attrs.jid]
                        const type = attrs.action === 'block' ? 'add' : 'remove'
                        ev.emit('blocklist.update', { blocklist, type })
                    }
                }
                break
            case 'link_code_companion_reg':
                const linkCodeCompanionReg = getBinaryNodeChild(node, 'link_code_companion_reg')
                const ref = toRequiredBuffer(getBinaryNodeChildBuffer(linkCodeCompanionReg, 'link_code_pairing_ref'))
                const primaryIdentityPublicKey = toRequiredBuffer(getBinaryNodeChildBuffer(linkCodeCompanionReg, 'primary_identity_pub'))
                const primaryEphemeralPublicKeyWrapped = toRequiredBuffer(getBinaryNodeChildBuffer(linkCodeCompanionReg, 'link_code_pairing_wrapped_primary_ephemeral_pub'))
                const codePairingPublicKey = await decipherLinkPublicKey(primaryEphemeralPublicKeyWrapped)
                const companionSharedKey = Curve.sharedKey(authState.creds.pairingEphemeralKeyPair.private, codePairingPublicKey)
                const random = randomBytes(32)
                const linkCodeSalt = randomBytes(32)
                const linkCodePairingExpanded = await hkdf(companionSharedKey, 32, {
                    salt: linkCodeSalt,
                    info: 'link_code_pairing_key_bundle_encryption_key'
                })
                const encryptPayload = Buffer.concat([
                    Buffer.from(authState.creds.signedIdentityKey.public),
                    primaryIdentityPublicKey,
                    random
                ])
                const encryptIv = randomBytes(12)
                const encrypted = aesEncryptGCM(encryptPayload, linkCodePairingExpanded, encryptIv, Buffer.alloc(0))
                const encryptedPayload = Buffer.concat([linkCodeSalt, encryptIv, encrypted])
                const identitySharedKey = Curve.sharedKey(authState.creds.signedIdentityKey.private, primaryIdentityPublicKey)
                const identityPayload = Buffer.concat([companionSharedKey, identitySharedKey, random])
                
                authState.creds.advSecretKey = (await hkdf(identityPayload, 32, { info: 'adv_secret' })).toString('base64')
                
                await query({
                    tag: 'iq',
                    attrs: {
                        to: S_WHATSAPP_NET,
                        type: 'set',
                        id: suki.generateMessageTag(),
                        xmlns: 'md'
                    },
                    content: [
                        {
                            tag: 'link_code_companion_reg',
                            attrs: {
                                jid: authState.creds.me.id,
                                stage: 'companion_finish'
                            },
                            content: [
                                { tag: 'link_code_pairing_wrapped_key_bundle', attrs: {}, content: encryptedPayload },
                                { tag: 'companion_identity_public', attrs: {}, content: authState.creds.signedIdentityKey.public },
                                { tag: 'link_code_pairing_ref', attrs: {}, content: ref }
                            ]
                        }
                    ]
                })
                
                authState.creds.registered = true
                ev.emit('creds.update', authState.creds)
                break
            case 'privacy_token':
                await handlePrivacyTokenNotification(node)
                break
        }
        
        if (Object.keys(result).length) {
            return result
        }
    }
   
    const handlePrivacyTokenNotification = async (node) => {
    try {
        logger.trace({ node }, 'privacy token notification received')

        const tokensNode = getBinaryNodeChild(node, 'tokens')

        if (!tokensNode) {
            logger.warn(
                { attrs: node?.attrs },
                'privacy token notification ignored: missing tokens node'
            )
            return
        }

        const from = jidNormalizedUser(node.attrs.from)

        logger.trace({ from }, 'normalized sender jid resolved')

        const rawSenderLid = node.attrs.sender_lid
        const normalizedSenderLid =
            rawSenderLid ? jidNormalizedUser(rawSenderLid) : undefined

        const senderLid =
            normalizedSenderLid && isLidUser(normalizedSenderLid)
                ? normalizedSenderLid
                : undefined

        logger.debug(
            {
                from,
                rawSenderLid,
                normalizedSenderLid,
                senderLid
            },
            'sender LID resolution result'
        )

        const fallbackJid = senderLid || (await resolveTcTokenJid(from, getLIDForPN))

        logger.debug(
            {
                from,
                senderLid,
                fallbackJid
            },
            'resolved fallback JID for TC token storage'
        )

        if (!fallbackJid) {
            logger.error(
                { from, senderLid },
                'failed to resolve fallbackJid for privacy token notification'
            )
            return
        }

        logger.trace(
            {
                hasTokensNode: !!tokensNode,
                tokensCount: tokensNode?.content?.length || 0
            },
            'tokens node inspection'
        )

        await storeTcTokensFromIqResult({
            result: node,
            fallbackJid,
            keys: authState.keys,
            getLIDForPN,
            onNewJidStored: trackTcTokenJid
        })

        logger.info(
            {
                from,
                fallbackJid
            },
            'privacy token notification processed successfully'
        )
    } catch (err) {
        logger.error(
            {
                err,
                nodeAttrs: node?.attrs
            },
            'error while handling privacy token notification'
        )
    }
}
    
    async function decipherLinkPublicKey(data) {
        const buffer = toRequiredBuffer(data)
        const salt = buffer.slice(0, 32)
        const secretKey = await derivePairingCodeKey(authState.creds.pairingCode, salt)
        const iv = buffer.slice(32, 48)
        const payload = buffer.slice(48, 80)
        return aesDecryptCTR(payload, secretKey, iv)
    }
    
    function toRequiredBuffer(data) {
        if (data === undefined) {
            throw new Boom('Invalid buffer', { statusCode: 400 })
        }
        return data instanceof Buffer ? data : Buffer.from(data)
    }
    
    const willSendMessageAgain = async (id, participant) => {
        const key = `${id}:${participant}`
        const retryCount = (await msgRetryCache.get(key)) || 0
        return retryCount < maxMsgRetryCount
    }
    
    const updateSendMessageAgainCount = async (id, participant) => {
        const key = `${id}:${participant}`
        const newValue = ((await msgRetryCache.get(key)) || 0) + 1
        await msgRetryCache.set(key, newValue)
    }
    
    const sendMessagesAgain = async (key, ids, retryNode, receiptNode) => {
        const remoteJid = key.remoteJid
        const participant = key.participant || remoteJid
        const retryCount = +retryNode.attrs.count || 1
        const msgId = ids[0]
        
        const msgs = []
        
        for (const id of ids) {
            let msg
            
            if (messageRetryManager) {
                const cachedMsg = messageRetryManager.getRecentMessage(remoteJid, id)
                if (cachedMsg) {
                    msg = cachedMsg.message
                    logger.debug({ jid: remoteJid, id }, 'found message in retry cache')
                    messageRetryManager.markRetrySuccess(id)
                }
            }
            
            if (!msg) {
                msg = await getMessage({ ...key, id })
                if (msg) {
                    logger.debug({ jid: remoteJid, id }, 'found message via getMessage')
                    if (messageRetryManager) {
                        messageRetryManager.markRetrySuccess(id)
                    }
                }
            }
            msgs.push(msg)
        }
        
        const sendToAll = !jidDecode(participant)?.device

        const sessionId = signalRepository.jidToSignalProtocolAddress(participant)
        let injectedFromBundle = false

        const bundle = extractE2ESessionFromRetryReceipt(receiptNode)
        if (bundle) {
            try {
                await signalRepository.injectE2ESession({ jid: participant, session: bundle })
                injectedFromBundle = true
                logger.debug({ participant, retryCount }, 'injected session from retry receipt key bundle')
            } catch (error) {
                logger.warn({ error, participant }, 'failed to inject session from retry receipt')
            }
        }

        if (!injectedFromBundle) {
            const receivedRegId = getBinaryNodeChildUInt(receiptNode, 'registration', 4)
            if (typeof receivedRegId === 'number' && Number.isInteger(receivedRegId)) {
                const info = await signalRepository.getSessionInfo(participant)
                if (info && info.registrationId !== 0 && info.registrationId !== receivedRegId) {
                    logger.info(
                        { participant, stored: info.registrationId, received: receivedRegId },
                        'reg id mismatch on retry without bundle, deleting session'
                    )
                    await authState.keys.set({ session: { [sessionId]: null } })
                }
            }
        }

        const BASE_KEY_CHECK_RETRY = 2
        if (msgId && messageRetryManager) {
            const info = await signalRepository.getSessionInfo(participant)
            if (info) {
                if (retryCount === BASE_KEY_CHECK_RETRY) {
                    messageRetryManager.saveBaseKey(sessionId, msgId, info.baseKey)
                } else if (retryCount > BASE_KEY_CHECK_RETRY) {
                    if (messageRetryManager.hasSameBaseKey(sessionId, msgId, info.baseKey)) {
                        logger.warn({ participant, retryCount }, 'base key collision on retry, forcing fresh session')
                        await authState.keys.set({ session: { [sessionId]: null } })
                    }
                    messageRetryManager.deleteBaseKey(sessionId, msgId)
                }
            }
        }
        
        let shouldRecreateSession = false
        let recreateReason = ''
        
        if (enableAutoSessionRecreation && messageRetryManager && retryCount > 1 && !injectedFromBundle) {
            try {
                const hasSession = await signalRepository.validateSession(participant)
                const result = messageRetryManager.shouldRecreateSession(participant, hasSession.exists)
                shouldRecreateSession = result.recreate
                recreateReason = result.reason
                
                if (shouldRecreateSession) {
                    logger.debug({ participant, retryCount, reason: recreateReason }, 'recreating session for outgoing retry')
                    await authState.keys.set({ session: { [sessionId]: null } })
                }
            }
            catch (error) {
                logger.warn({ error, participant }, 'failed to check session recreation for outgoing retry')
            }
        }

        if (!injectedFromBundle) {
            await assertSessions([participant], true)
        }
        
        if (isJidGroup(remoteJid)) {
            await authState.keys.set({ 'sender-key-memory': { [remoteJid]: null } })
        }
        
        logger.debug({ participant, sendToAll, shouldRecreateSession, recreateReason, injectedFromBundle }, 'prepared session for retry resend')
        
        for (const [i, msg] of msgs.entries()) {
            if (!ids[i]) continue
            
            if (msg && (await willSendMessageAgain(ids[i], participant))) {
                await updateSendMessageAgainCount(ids[i], participant)
                const msgRelayOpts = { messageId: ids[i] }
                
                if (sendToAll) {
                    msgRelayOpts.useUserDevicesCache = false
                }
                else {
                    msgRelayOpts.participant = {
                        jid: participant,
                        count: +retryNode.attrs.count
                    }
                }
                
                await relayMessage(key.remoteJid, msg, msgRelayOpts)
            }
            else {
                logger.debug({ jid: key.remoteJid, id: ids[i] }, 'recv retry request, but message not available')
            }
        }
    }
    
    const handleReceipt = async (node) => {
        const { attrs, content } = node
        const isLid = attrs.from.includes('lid')
        const isNodeFromMe = areJidsSameUser(attrs.participant || attrs.from, isLid ? authState.creds.me?.lid : authState.creds.me?.id)
        const remoteJid = !isNodeFromMe || isJidGroup(attrs.from) ? attrs.from : attrs.recipient
        const fromMe = !attrs.recipient || ((attrs.type === 'retry' || attrs.type === 'sender') && isNodeFromMe)
        const key = {
            remoteJid,
            id: '',
            fromMe,
            participant: attrs.participant
        }
        
        if (shouldIgnoreJid(remoteJid) && remoteJid !== S_WHATSAPP_NET) {
            logger.debug({ remoteJid }, 'ignoring receipt from jid')
            await sendMessageAck(node)
            return
        }
        
        const ids = [attrs.id]
        
        if (Array.isArray(content)) {
            const items = getBinaryNodeChildren(content[0], 'item')
            ids.push(...items.map(i => i.attrs.id))
        }
        
        try {
            await Promise.all([
                receiptMutex.mutex(async () => {
                    const status = getStatusFromReceiptType(attrs.type)
                    
                    if (typeof status !== 'undefined' &&
                        (status >= proto.WebMessageInfo.Status.SERVER_ACK || !isNodeFromMe)) {
                        if (isJidGroup(remoteJid) || isJidStatusBroadcast(remoteJid)) {
                            if (attrs.participant) {
                                const updateKey = status === proto.WebMessageInfo.Status.DELIVERY_ACK ? 'receiptTimestamp' : 'readTimestamp'
                                
                                ev.emit('message-receipt.update', ids.map(id => ({
                                    key: { ...key, id },
                                    receipt: {
                                        userJid: jidNormalizedUser(attrs.participant),
                                        [updateKey]: +attrs.t
                                    }
                                })))
                            }
                        }
                        else {
                            ev.emit('messages.update', ids.map(id => ({
                                key: { ...key, id },
                                update: { status }
                            })))
                        }
                    }
                    
                    if (attrs.type === 'retry') {
                        key.participant = key.participant || attrs.from
                        const retryNode = getBinaryNodeChild(node, 'retry')
                        
                        if (ids[0] && key.participant && (await willSendMessageAgain(ids[0], key.participant))) {
                            if (key.fromMe) {
                                try {
                                    await updateSendMessageAgainCount(ids[0], key.participant)
                                    logger.debug({ attrs, key }, 'recv retry request')
                                    
                                    await sendMessagesAgain(key, ids, retryNode, node)
                                }
                                catch (error) {
                                    logger.error({ key, ids, trace: error instanceof Error ? error.stack : 'Unknown error' }, 'error in sending message again')
                                }
                            }
                            else {
                                logger.info({ attrs, key }, 'recv retry for not fromMe message')
                            }
                        }
                        else {
                            logger.info({ attrs, key }, 'will not send message again, as sent too many times')
                        }
                    }
                })
            ])
        }
        finally {
            await sendMessageAck(node)
        }
    }
    
    const handleNotification = async (node) => {
        const remoteJid = node.attrs.from
        if (shouldIgnoreJid(remoteJid) && remoteJid !== S_WHATSAPP_NET) {
            logger.debug({ remoteJid, id: node.attrs.id }, 'ignored notification')
            await sendMessageAck(node)
            return
        }
        
        try {
            await Promise.all([
                notificationMutex.mutex(async () => {
                   logger.info({
                      tag: node.tag,
                      type: node.attrs.type,
                      from: node.attrs.from,
                      id: node.attrs.id,
                      attrs: node.attrs
                   }, 'incoming notification')
                    const msg = await processNotification(node)
                    
                    if (msg) {
                        const fromMe = areJidsSameUser(node.attrs.participant || remoteJid, authState.creds.me.id)
                        const { senderAlt: participantAlt, addressingMode } = extractAddressingContext(node)
                        
                        msg.key = {
                            remoteJid,
                            fromMe,
                            participant: node.attrs.participant,
                            participantAlt,
                            addressingMode,
                            id: node.attrs.id,
                            ...(msg.key || {})
                        }
                        
                        msg.participant ?? (msg.participant = node.attrs.participant)
                        msg.messageTimestamp = +node.attrs.t

                        const fullMsg = proto.WebMessageInfo.fromObject(msg)
                        await upsertMessage(fullMsg, 'append')
                    }
                })
            ])
        }
        finally {
            await sendMessageAck(node)
        }
    }

    const handleMessage = async (node) => {
	const encNode = getBinaryNodeChild(node, 'enc')

	if (encNode?.attrs?.type === 'msmsg') {
		logger.debug({ key: node.attrs.key }, 'ignored msmsg')
		await sendMessageAck(node, NACK_REASONS.MissingMessageSecret)
		return
	}

	let acked = false

	try {
		const {
			fullMessage: msg,
			category,
			author,
			decrypt
		} = decryptMessageNode(
			node,
			authState.creds.me.id,
			authState.creds.me.lid || '',
			signalRepository,
			logger
		)

		const alt = msg.key.participantAlt || msg.key.remoteJidAlt

		if (alt) {
			const altServer = jidDecode(alt)?.server
			const primaryJid = msg.key.participant || msg.key.remoteJid

			if (altServer === 'lid') {
				if (!(await signalRepository.lidMapping.getPNForLID(alt))) {
					await signalRepository.lidMapping.storeLIDPNMappings([
						{ lid: alt, pn: primaryJid }
					])
					await signalRepository.migrateSession(primaryJid, alt)
				}
			} else {
				await signalRepository.lidMapping.storeLIDPNMappings([
					{ lid: primaryJid, pn: alt }
				])
				await signalRepository.migrateSession(alt, primaryJid)
			}
		}

		await messageMutex.mutex(async () => {
			await decrypt()

			if (
				msg.key?.remoteJid &&
				msg.key?.id &&
				msg.message &&
				messageRetryManager
			) {
				messageRetryManager.addRecentMessage(
					msg.key.remoteJid,
					msg.key.id,
					msg.message
				)
			}

			if (
				msg.messageStubType === proto.WebMessageInfo.StubType.CIPHERTEXT &&
				msg.category !== 'peer'
			) {
				if (msg?.messageStubParameters?.[0] === MISSING_KEYS_ERROR_TEXT) {
					acked = true
					return sendMessageAck(node, NACK_REASONS.ParsingError)
				}

				if (msg.messageStubParameters?.[0] === NO_MESSAGE_FOUND_ERROR_TEXT) {
					const unavailableNode = getBinaryNodeChild(node, 'unavailable')
					const unavailableType = unavailableNode?.attrs?.type

					if (
						unavailableType === 'bot_unavailable_fanout' ||
						unavailableType === 'hosted_unavailable_fanout' ||
						unavailableType === 'view_once_unavailable_fanout'
					) {
						acked = true
						return sendMessageAck(node)
					}

					const messageAge =
						unixTimestampSeconds() - toNumber(msg.messageTimestamp)

					if (messageAge > PLACEHOLDER_MAX_AGE_SECONDS) {
						acked = true
						return sendMessageAck(node)
					}

					const cleanKey = {
						remoteJid: msg.key.remoteJid,
						fromMe: msg.key.fromMe,
						id: msg.key.id,
						participant: msg.key.participant
					}

					const msgData = {
						key: msg.key,
						messageTimestamp: msg.messageTimestamp,
						pushName: msg.pushName,
						participant: msg.participant,
						verifiedBizName: msg.verifiedBizName
					}

					requestPlaceholderResend(cleanKey, msgData)
						.then((requestId) => {
							if (requestId && requestId !== 'RESOLVED') {
								ev.emit('messages.update', [
									{
										key: msg.key,
										update: {
											messageStubParameters: [
												NO_MESSAGE_FOUND_ERROR_TEXT,
												requestId
											]
										}
									}
								])
							}
						})
						.catch(() => {})

					acked = true
					await sendMessageAck(node)
				} else {
					if (isJidStatusBroadcast(msg.key.remoteJid)) {
						const messageAge =
							unixTimestampSeconds() -
							toNumber(msg.messageTimestamp)

						if (messageAge > STATUS_EXPIRY_SECONDS) {
							acked = true
							return sendMessageAck(node)
						}
					}

					await retryMutex.mutex(async () => {
						try {
							if (!ws.isOpen) return

							const encNode = getBinaryNodeChild(node, 'enc')
							await sendRetryRequest(node, !encNode)

							if (retryRequestDelayMs) {
								await delay(retryRequestDelayMs)
							}
						} catch (err) {
							logger.error({ err }, 'Failed to send retry')
						}

						acked = true
						await sendMessageAck(node, NACK_REASONS.UnhandledError)
					})
				}
			} else {
				if (messageRetryManager && msg.key.id) {
					messageRetryManager.cancelPendingPhoneRequest(msg.key.id)
				}

				const isNewsletter = isJidNewsletter(msg.key.remoteJid)

				if (!isNewsletter) {
					let type = undefined
					let participant = msg.key.participant

					if (category === 'peer') {
						type = 'peer_msg'
					} else if (msg.key.fromMe) {
						type = 'sender'
						if (
							isLidUser(msg.key.remoteJid) ||
							isLidUser(msg.key.remoteJidAlt)
						) {
							participant = author
						}
					} else if (!sendActiveReceipts) {
						type = 'inactive'
					}

					acked = true

					await sendReceipt(
						msg.key.remoteJid,
						participant,
						[msg.key.id],
						type
					)

					const isAnyHistoryMsg = getHistoryMsg(msg.message)

					if (isAnyHistoryMsg) {
						const jid = jidNormalizedUser(msg.key.remoteJid)
						await sendReceipt(jid, undefined, [msg.key.id], 'hist_sync')
					}
				} else {
					acked = true
					await sendMessageAck(node)
				}
			}

			cleanMessage(msg, authState.creds.me.id, authState.creds.me.lid)

			await upsertMessage(msg, node.attrs.offline ? 'append' : 'notify')
		})
	} catch (error) {
		logger.error(
			{ error, node: binaryNodeToString(node) },
			'error in handling message'
		)

		if (!acked) {
			await sendMessageAck(node, NACK_REASONS.UnhandledError).catch(() => {})
		}
	}
}

    const handleCall = async (node) => {
        const { attrs } = node
        const [infoChild] = getAllBinaryNodeChildren(node)
        const status = getCallStatusFromNode(infoChild)
        
        if (!infoChild) {
            throw new Boom('Missing call info in call node')
        }
        
        const callId = infoChild.attrs['call-id']
        const from = infoChild.attrs.from || infoChild.attrs['call-creator']
        const call = {
            chatId: attrs.from,
            from,
            id: callId,
            date: new Date(+attrs.t * 1000),
            offline: !!attrs.offline,
            status
        }
        
        if (status === 'offer') {
            call.isVideo = !!getBinaryNodeChild(infoChild, 'video')
            call.isGroup = infoChild.attrs.type === 'group' || !!infoChild.attrs['group-jid']
            call.groupJid = infoChild.attrs['group-jid']
            
            await callOfferCache.set(call.id, call)
        }
        
        const existingCall = await callOfferCache.get(call.id)
        
        if (existingCall) {
            call.isVideo = existingCall.isVideo
            call.isGroup = existingCall.isGroup
        }
        
        if (status === 'reject' || status === 'accept' || status === 'timeout' || status === 'terminate') {
            await callOfferCache.del(call.id)
        }
        
        ev.emit('call', [call])
        
        await sendMessageAck(node)
    }
    
    const handleBadAck = async ({ attrs }) => {
	const key = { remoteJid: attrs.from, fromMe: true, id: attrs.id }

	// error in acknowledgement,
	// device could not display the message
	if (attrs.error) {
		const isReachoutTimelocked =
			attrs.error === String(NACK_REASONS.SenderReachoutTimelocked)

		if (attrs.error === "463") {
			logger.warn(
				{ msgId: attrs.id, from: attrs.from },
				'error 463: account restricted or missing tctoken for contact'
			)

			const ackFrom = attrs.from
			if (ackFrom && !inFlight463Recoveries.has(ackFrom)) {
				inFlight463Recoveries.add(ackFrom)

				void (async () => {
					try {
						const getPNForLID =
							signalRepository.lidMapping.getPNForLID.bind(
								signalRepository.lidMapping
							)

						const tcStorageJid = await resolveTcTokenJid(
							ackFrom,
							getLIDForPN
						)

						const issueJid = await resolveIssuanceJid(
							ackFrom,
							suki.serverProps.lidTrustedTokenIssueToLid,
							getLIDForPN,
							getPNForLID
						)

						const result = await issuePrivacyTokens(
							[issueJid],
							unixTimestampSeconds()
						)

						await storeTcTokensFromIqResult({
							result,
							fallbackJid: tcStorageJid,
							keys: authState.keys,
							getLIDForPN,
							onNewJidStored: trackTcTokenJid
						})

						logger.debug(
							{ from: ackFrom },
							'completed 463 token recovery issuance'
						)
					} catch (err) {
						logger.debug(
							{ from: ackFrom, err: err && err.message },
							'failed 463 token recovery issuance'
						)
					} finally {
						inFlight463Recoveries.delete(ackFrom)
					}
				})()
			}
		} else if (attrs.error === "479") {
			logger.warn(
				{ msgId: attrs.id, from: attrs.from },
				'smax-invalid (479): stanza rejected by server — likely stale device session or malformed addressing'
			)
		} else if (isReachoutTimelocked) {
			await fetchAccountReachoutTimelock().catch(err =>
				logger.warn({ err }, 'failed to fetch reachout timelock')
			)
			logger.warn({ attrs }, 'received error in ack')
		} else {
			logger.warn({ attrs }, 'received error in ack')
		}

		ev.emit('messages.update', [
			{
				key,
				update: {
					status: WAMessageStatus.ERROR,
					messageStubParameters: isReachoutTimelocked
						? [attrs.error, ACCOUNT_RESTRICTED_TEXT]
						: [attrs.error]
				}
			}
		])
	}
}
    
    const processNodeWithBuffer = async (node, identifier, exec) => {
        ev.buffer()
        await execTask()
        ev.flush()
        
        function execTask() {
            return exec(node, false).catch(err => onUnexpectedError(err, identifier))
        }
    }
    
    /** Yields control to the event loop to prevent blocking */
    const yieldToEventLoop = () => {
        return new Promise(resolve => setImmediate(resolve))
    }
    
    const makeOfflineNodeProcessor = () => {
        const nodeProcessorMap = new Map([
            ['message', handleMessage],
            ['call', handleCall],
            ['receipt', handleReceipt],
            ['notification', handleNotification]
        ])
        
        const nodes = []
        
        let isProcessing = false
       
        const BATCH_SIZE = 10
        
        const enqueue = (type, node) => {
            nodes.push({ type, node })
            
            if (isProcessing) {
                return
            }
            
            isProcessing = true
            
            const promise = async () => {
                let processedInBatch = 0
                
                while (nodes.length && ws.isOpen) {
                    const { type, node } = nodes.shift()
                    const nodeProcessor = nodeProcessorMap.get(type)
                    
                    if (!nodeProcessor) {
                        onUnexpectedError(new Error(`unknown offline node type: ${type}`), 'processing offline node')
                        continue
                    }
                    
                    await nodeProcessor(node)
                    
                    processedInBatch++
                    
                    if (processedInBatch >= BATCH_SIZE) {
                        processedInBatch = 0
                        await yieldToEventLoop()
                    }
                }
                
                isProcessing = false
            }
            
            promise().catch(error => onUnexpectedError(error, 'processing offline nodes'))
        }
        
        return { enqueue }
    }
    
    const offlineNodeProcessor = makeOfflineNodeProcessor()
    
    const processNode = async (type, node, identifier, exec) => {
        const isOffline = !!node.attrs.offline
        
        if (isOffline) {
            offlineNodeProcessor.enqueue(type, node)
        }
        
        else {
            await processNodeWithBuffer(node, identifier, exec)
        }
    }
    
    ws.on('CB:message', async (node) => {
        await processNode('message', node, 'processing message', handleMessage)
    })
    
    ws.on('CB:call', async (node) => {
        await processNode('call', node, 'handling call', handleCall)
    })
    
    ws.on('CB:receipt', async (node) => {
        await processNode('receipt', node, 'handling receipt', handleReceipt)
    })
    
    ws.on('CB:notification', async (node) => {
        await processNode('notification', node, 'handling notification', handleNotification)
    })
    
    ws.on('CB:ack,class:message', (node) => {
        handleBadAck(node).catch(error => onUnexpectedError(error, 'handling bad ack'))
    })
    
   let lastTcTokenPruneTs = 0
   const inFlight463Recoveries = new Set()
    
    ev.on('call', async ([call]) => {
        if (!call) {
            return;
        }
        
        if (call.status === 'timeout' || (call.status === 'offer' && call.isGroup)) {
            const msg = {
                key: {
                    remoteJid: call.chatId,
                    id: call.id,
                    fromMe: false
                },
                messageTimestamp: unixTimestampSeconds(call.date)
            }
            
            if (call.status === 'timeout') {
                if (call.isGroup) {
                    msg.messageStubType = call.isVideo
                        ? WAMessageStubType.CALL_MISSED_GROUP_VIDEO
                        : WAMessageStubType.CALL_MISSED_GROUP_VOICE
                }
                
                else {
                    msg.messageStubType = call.isVideo ? WAMessageStubType.CALL_MISSED_VIDEO : WAMessageStubType.CALL_MISSED_VOICE
                }
            }
            
            else {
                msg.message = { call: { callKey: Buffer.from(call.id) } };
            }
            
            const protoMsg = proto.WebMessageInfo.fromObject(msg)
            
            await upsertMessage(protoMsg, call.offline ? 'append' : 'notify')
        }
    })
    
    ev.on('connection.update', ({ isOnline, connection }) => {
	if (typeof isOnline !== 'undefined') {
		sendActiveReceipts = isOnline
		logger.trace(`sendActiveReceipts set to "${sendActiveReceipts}"`)
	}

	if (connection === 'close' && tcTokenIndexTimer) {
		clearTimeout(tcTokenIndexTimer)
		tcTokenIndexTimer = undefined

		try {
			void Promise.resolve(flushTcTokenIndex()).catch(() => {})
		} catch {
		}
	}

	if (isOnline) {
		const now = Date.now()
		const DAY_MS = 24 * 60 * 60 * 1000

		if (now - lastTcTokenPruneTs >= DAY_MS) {
			lastTcTokenPruneTs = now
			void pruneExpiredTcTokens()
		}
	}
})

async function pruneExpiredTcTokens() {
	try {
		await tcTokenIndexLoaded

		const persisted = await readTcTokenIndex(authState.keys)
		const allJids = new Set(tcTokenKnownJids)

		for (const jid of persisted) {
			allJids.add(jid)
		}

		if (!allJids.size) return

		const jids = [...allJids]
		const allTokens = await authState.keys.get('tctoken', jids)

		const writes = {}
		const survivors = new Set()
		let mutated = 0

		for (const jid of jids) {
			const entry = allTokens[jid]

			if (!entry) {
				mutated++
				continue
			}

			const hasPeerToken = !!entry.token?.length
			const peerTokenExpired = hasPeerToken && isTcTokenExpired(entry.timestamp)
			const hasSenderTs = entry.senderTimestamp !== undefined
			const senderTsExpired = hasSenderTs && isTcTokenExpired(entry.senderTimestamp)
			const keepPeerToken = hasPeerToken && !peerTokenExpired
			const keepSenderTs = hasSenderTs && !senderTsExpired

			if (!keepPeerToken && !keepSenderTs) {
				writes[jid] = null
				mutated++
			} else if (peerTokenExpired && keepSenderTs) {
				writes[jid] = {
					token: Buffer.alloc(0),
					senderTimestamp: entry.senderTimestamp
				}
				survivors.add(jid)
				mutated++
			} else {
				survivors.add(jid)
			}
		}

		if (mutated === 0) return

		await authState.keys.set({
			tctoken: {
				...writes,
				[TC_TOKEN_INDEX_KEY]: {
					token: Buffer.from(JSON.stringify([...survivors]))
				}
			}
		})

		tcTokenKnownJids.clear()

		for (const jid of survivors) {
			tcTokenKnownJids.add(jid)
		}

		logger.debug(
			{ mutated, remaining: survivors.size },
			'pruned expired tctokens'
		)
	} catch (err) {
		logger.warn(
			{ err: err?.message },
			'failed to prune expired tctokens'
		)
	}
}
    
    return {
        ...suki,
        sendMessageAck,
        sendRetryRequest,
        offerCall, 
        rejectCall,
        fetchMessageHistory,
        requestPlaceholderResend,
        messageRetryManager
    }
}

module.exports = {
  makeMessagesRecvSocket
}