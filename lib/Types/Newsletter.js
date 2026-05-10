"use strict"

Object.defineProperty(exports, "__esModule", { value: true })


const XWAPaths = {
    CREATE: 'xwa2_newsletter_create',
    SUBSCRIBERS: 'xwa2_newsletter_subscribers',
    VIEW: 'xwa2_newsletter_view',
    METADATA: 'xwa2_newsletter',
    UPDATE: 'xwa2_newsletter_update', 
    ADMIN_COUNT: 'xwa2_newsletter_admin',
    MUTE_V2: 'xwa2_newsletter_mute_v2',
    UNMUTE_V2: 'xwa2_newsletter_unmute_v2',
    FOLLOW: 'xwa2_newsletter_follow',
    UNFOLLOW: 'xwa2_newsletter_unfollow',
    CHANGE_OWNER: 'xwa2_newsletter_change_owner',
    DEMOTE: 'xwa2_newsletter_demote',
    DELETE_V2: 'xwa2_newsletter_delete_v2'
}

const QueryIds = {
    CREATE: '8823471724422422',
    UPDATE_METADATA: '24250201037901610',
    METADATA: '6563316087068696',
    SUBSCRIBERS: '9783111038412085',
    FOLLOW: '7871414976211147',
    UNFOLLOW: '7238632346214362',
    MUTE: '29766401636284406',
    UNMUTE: '9864994326891137',
    ADMIN_COUNT: '7130823597031706',
    CHANGE_OWNER: '7341777602580933',
    DEMOTE: '6551828931592903',
    DELETE: '30062808666639665',
    REACHOUT_TIMELOCK: '23983697327930364',
    MESSAGE_CAPPING_INFO: '24503548349331633'
}

const MexOperations = {
    PROMOTE: "NotificationNewsletterAdminPromote",
    DEMOTE: "NotificationNewsletterAdminDemote",
    UPDATE: "NotificationNewsletterUpdate"
}

module.exports = {
  MexOperations,
  XWAPaths,
  QueryIds
}