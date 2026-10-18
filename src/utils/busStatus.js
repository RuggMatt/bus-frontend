/** @param {string} time HH:MM:SS, where HH may be 24 or more */
export const formatScheduledTime = (time) => {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  const hour = hours % 24;
  return `${hour % 12 || 12}:${String(minutes).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
};

/** @param {number} offsetMinutes */
export const scheduleStatus = (offsetMinutes) => {
  if (offsetMinutes >= 2) return { label: `${offsetMinutes} min late`, color: "warning" };
  if (offsetMinutes <= -2) return { label: `${-offsetMinutes} min early`, color: "info" };
  return { label: "On time", color: "success" };
};

/**
 * Minutes behind (positive) or ahead of (negative) schedule from the agency's predicted
 * delay that /bus/now gives each bus, rounded like the other chips. Null when unknown
 * @param {{delay?: number|null} | null | undefined} bus
 * @returns {number|null}
 */
export const predictedOffsetMinutes = (bus) =>
  typeof bus?.delay === "number" && Number.isFinite(bus.delay) ? Math.round(bus.delay / 60) : null;

// map canvases need hex, so these mirror the theme colours scheduleStatus picks
/** @type {Record<string, string>} */
export const STATUS_HEX = { success: "#4caf50", warning: "#fb8c00", info: "#2196f3" };
export const NO_TIMES_HEX = "#999999";
