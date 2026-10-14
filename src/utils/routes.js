// route numbers are zero-padded in the feed, e.g. "002"
/** @param {string} routeId */
export const routeNumber = (routeId) => routeId.replace(/^0+(?=.)/, "");

// regional buses share stops with ETS, so say whose bus it is
export const LOCAL_AGENCY = "Edmonton Transit Service";
