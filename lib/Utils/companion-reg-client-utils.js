const CompanionWebClientType = {
    UNKNOWN: 0,
    CHROME: 1,
    EDGE: 2,
    FIREFOX: 3,
    IE: 4,
    OPERA: 5,
    SAFARI: 6,
    ELECTRON: 7,
    UWP: 8,
    OTHER_WEB_CLIENT: 9
}

const BROWSER_TO_COMPANION_WEB_CLIENT = {
    Chrome: CompanionWebClientType.CHROME,
    Edge: CompanionWebClientType.EDGE,
    Firefox: CompanionWebClientType.FIREFOX,
    IE: CompanionWebClientType.IE,
    Opera: CompanionWebClientType.OPERA,
    Safari: CompanionWebClientType.SAFARI
}

const getCompanionWebClientType = ([os, browserName]) => {
    if (browserName === 'Desktop') {
        return os === 'Windows'
            ? CompanionWebClientType.UWP
            : CompanionWebClientType.ELECTRON
    }

    return (
        BROWSER_TO_COMPANION_WEB_CLIENT[browserName] ||
        CompanionWebClientType.OTHER_WEB_CLIENT
    )
}

const getCompanionPlatformId = (browser) => {
    return getCompanionWebClientType(browser).toString()
}

const buildPairingQRData = (
    ref,
    noiseKeyB64,
    identityKeyB64,
    advB64,
    browser
) => {
    return (
        'https://wa.me/settings/linked_devices#' +
        [
            ref,
            noiseKeyB64,
            identityKeyB64,
            advB64,
            getCompanionPlatformId(browser)
        ].join(',')
    )
}

module.exports = {
    CompanionWebClientType,
    getCompanionWebClientType,
    getCompanionPlatformId,
    buildPairingQRData
}