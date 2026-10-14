import L from './leaflet';
import '../styles/bus-marker.css';

const BUS_PIN_SHAPE = '<polygon points="18,1.5 11.5,10 24.5,10" /><circle cx="18" cy="18" r="11" />';

const isElectric = (bus) => bus.bus >= 8000;

/**
 * How long ago a bus reported its position, e.g. "52s ago"
 * @param {number} timestamp Unix epoch seconds
 * @returns {string}
 */
export const formatReportAge = (timestamp) => {
    const seconds = Math.max(0, Math.floor(Date.now() / 1000 - timestamp));
    if (seconds < 60) {
        return `${seconds}s ago`;
    }
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s ago`;
};

/**
 * Keeps every age badge inside an element counting up
 * @param {HTMLElement} element
 */
export const refreshReportAges = (element) => {
    for (const badge of element.querySelectorAll(".bus-age-badge")) {
        badge.textContent = formatReportAge(Number(badge.dataset.timestamp));
    }
};

/**
 * Pin pointing in the bus's direction of travel, with an upright glyph on top
 * @param {import("../api").Bus} bus
 * @param {{showAge?: boolean}} [options] showAge: label the pin with how old its position
 *   is, kept current by refreshReportAges
 */
export const createBusIcon = (bus, { showAge = false } = {}) => L.divIcon({
    className: `bus-marker-icon${isElectric(bus) ? " bus-marker-icon--electric" : ""}`,
    html: `<div class="bus-icon-wrapper">
        <svg class="bus-icon-pin" viewBox="0 0 36 36" style="transform: rotate(${Number(bus.bearing) || 0}deg)">
            <g class="bus-icon-outline">${BUS_PIN_SHAPE}</g>
            <g class="bus-icon-fill">${BUS_PIN_SHAPE}</g>
        </svg>
        <i class="bus-icon-glyph mdi ${isElectric(bus) ? "mdi-lightning-bolt" : "mdi-bus"}"></i>
        ${showAge && bus.timestamp ? `<span class="bus-age-badge" data-timestamp="${Number(bus.timestamp)}">${formatReportAge(bus.timestamp)}</span>` : ""}
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
});
