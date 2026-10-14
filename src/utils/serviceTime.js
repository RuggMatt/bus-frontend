const DAY_SECONDS = 24 * 60 * 60;
// GTFS times run past 24:00:00 for trips that started on the previous service day
const MAX_SERVICE_SECONDS = 30 * 60 * 60;

const EDMONTON_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Edmonton",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

/**
 * The date and time in Edmonton, regardless of the viewer's time zone
 * @param {Date} [date]
 * @returns {{dateString: string, secondsSinceMidnight: number}} dateString is YYYY-MM-DD
 */
export const edmontonNow = (date = new Date()) => {
  /** @type {Record<string, string>} */
  const parts = {};
  for (const part of EDMONTON_FORMAT.formatToParts(date)) {
    parts[part.type] = part.value;
  }
  return {
    dateString: `${parts.year}-${parts.month}-${parts.day}`,
    secondsSinceMidnight:
      Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
};

/**
 * @param {string} time HH:MM:SS, where HH may be 24 or more
 * @returns {number}
 */
export const timeToSeconds = (time) => {
  const [h = 0, m = 0, s = 0] = time.split(":").map(Number);
  return h * 3600 + m * 60 + s;
};

/**
 * @param {number} seconds
 * @returns {string} HH:MM:SS, where HH may be 24 or more
 */
export const secondsToTime = (seconds) => {
  const pad = (value) => String(value).padStart(2, "0");
  const whole = Math.max(0, Math.floor(seconds));
  return `${pad(Math.floor(whole / 3600))}:${pad(Math.floor((whole % 3600) / 60))}:${pad(whole % 60)}`;
};

/**
 * The scheduled time ranges covering a window around a time of day. Includes the
 * range for the previous service day, whose trips are scheduled past 24:00:00.
 * @param {number} seconds Seconds since midnight
 * @param {number} before Seconds before to include
 * @param {number} after Seconds after to include
 * @returns {[string, string][]} Pairs of HH:MM:SS bounds
 */
export const scheduleWindow = (seconds, before, after) => {
  const start = seconds - before;
  const end = seconds + after;
  const ranges = [[Math.max(start, 0), Math.min(end, MAX_SERVICE_SECONDS)]];
  if (start + DAY_SECONDS <= MAX_SERVICE_SECONDS) {
    ranges.push([start + DAY_SECONDS, Math.min(end + DAY_SECONDS, MAX_SERVICE_SECONDS)]);
  }
  return ranges.map(([from, to]) => [secondsToTime(from), secondsToTime(to)]);
};

/**
 * A scheduled time as seconds relative to today's midnight, picking whichever of
 * today's or yesterday's service day puts it closest to the reference time.
 * @param {string} time HH:MM:SS
 * @param {number} referenceSeconds Seconds since midnight
 * @returns {number}
 */
export const scheduledSecondsNear = (time, referenceSeconds) => {
  const today = timeToSeconds(time);
  const yesterday = today - DAY_SECONDS;
  return Math.abs(today - referenceSeconds) <= Math.abs(yesterday - referenceSeconds)
    ? today
    : yesterday;
};

/** @typedef {'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday'} Weekday */

/** @type {Weekday[]} indexed like Date.getDay() */
export const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// service_ids end in 7 digits for Monday to Sunday, 1 where the service runs
const DAY_TO_SERVICE_ID_INDEX = {
  monday: 0,
  tuesday: 1,
  wednesday: 2,
  thursday: 3,
  friday: 4,
  saturday: 5,
  sunday: 6,
};

/**
 * Whether a service runs on a day, from its service_id, e.g. DX-008-Weekday-1-26-09-1111100.
 * Services whose days can't be read are assumed to run.
 * @param {string} serviceId
 * @param {Weekday} day
 */
export const serviceRunsOnDay = (serviceId, day) => {
  const index = DAY_TO_SERVICE_ID_INDEX[day];
  if (index === undefined || serviceId.length < 7) return true;
  return serviceId[serviceId.length - 7 + index] === "1";
};

/**
 * @param {string} dateString YYYY-MM-DD
 * @param {number} [days] Days to move forward, or back when negative
 * @returns {Weekday}
 */
export const weekdayOf = (dateString, days = 0) => {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return WEEKDAYS[date.getUTCDay()];
};
