export const SITE_NAME = "Edmonton Bus Tracker";

/**
 * A tab title, most specific part first so it survives the tab cutting it short,
 * e.g. "Bus 4699 · Edmonton Bus Tracker". Empty parts are left out, so a page can
 * pass a name that hasn't loaded yet.
 * @param {...(string | null | undefined | false)} parts
 * @returns {string}
 */
export const pageTitle = (...parts) => [...parts.filter(Boolean), SITE_NAME].join(" · ");
