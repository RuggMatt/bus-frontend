// @ts-check

// Alberta stopped changing its clocks after springing forward on 8 March 2026 and stays on
// UTC-6 all year (IANA tzdata 2026c). Browsers and phones whose time zone data predates that
// still move America/Edmonton back to UTC-7 on 1 November 2026, which puts every Edmonton
// time an hour behind. So from the switch on, Edmonton times use a fixed UTC-6 zone, which is
// right with old or new data alike, and only earlier times rely on the browser's rules.
const PERMANENT_UTC_MINUS_6_FROM = Date.UTC(2026, 2, 8, 9); // 2 AM MST, 8 March 2026
// IANA's Etc zones have the sign flipped: Etc/GMT+6 is UTC-6
const PERMANENT_ZONE = "Etc/GMT+6";
const RULES_ZONE = "America/Edmonton";

/**
 * The time zone to show an instant in Edmonton time with
 * @param {Date|number} date A Date or epoch milliseconds
 * @returns {string}
 */
export const edmontonTimeZone = (date) =>
  Number(date) >= PERMANENT_UTC_MINUS_6_FROM ? PERMANENT_ZONE : RULES_ZONE;

/**
 * An Intl.DateTimeFormat in Edmonton time, for `format` and `formatToParts`
 * @param {string} locale
 * @param {Intl.DateTimeFormatOptions} options Without timeZone
 * @returns {{format: (date: Date) => string, formatToParts: (date: Date) => Intl.DateTimeFormatPart[]}}
 */
export const edmontonDateTimeFormat = (locale, options) => {
  const permanent = new Intl.DateTimeFormat(locale, { ...options, timeZone: PERMANENT_ZONE });
  const rules = new Intl.DateTimeFormat(locale, { ...options, timeZone: RULES_ZONE });
  const pick = (/** @type {Date} */ date) =>
    edmontonTimeZone(date) === PERMANENT_ZONE ? permanent : rules;
  return {
    format: (date) => pick(date).format(date),
    formatToParts: (date) => pick(date).formatToParts(date),
  };
};
