import L from './leaflet';
import '../styles/bus-marker.css';
import { predictedOffsetMinutes, scheduleStatus } from '../utils/busStatus';
import { formatReportAge, reportAgeLevel } from '../utils/reportAge';

const BUS_PIN_SHAPE = '<polygon points="18,1.5 11.5,10 24.5,10" /><circle cx="18" cy="18" r="11" />';

/** @param {string} text */
const escapeHtml = (text) =>
    text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const isElectric = (bus) => bus.bus >= 8000;

/**
 * Keeps every age badge inside an element counting up
 * @param {HTMLElement} element
 */
export const refreshReportAges = (element) => {
    for (const badge of element.querySelectorAll(".bus-age-badge")) {
        const timestamp = Number(badge.dataset.timestamp);
        badge.textContent = formatReportAge(timestamp);
        badge.dataset.level = reportAgeLevel(timestamp);
    }
};

/**
 * Pin pointing in the bus's direction of travel, with an upright glyph on top
 * @param {import("../api").Bus} bus
 * @param {{showAge?: boolean, label?: string, history?: boolean, selected?: boolean, status?: boolean}} [options]
 *   showAge: label the pin with how old its position is, kept current by refreshReportAges.
 *   status: colour the pin by how late the bus is running (its `delay`), grey when unknown.
 *   label: a fixed badge instead, e.g. the time of a recorded position. history: a smaller
 *   pin for a past position. selected: the one picked from a list
 */
export const createBusIcon = (bus, { showAge = false, label = "", history = false, selected = false, status = false } = {}) => {
    const level = showAge && bus.timestamp ? reportAgeLevel(bus.timestamp) : "fresh";
    const offset = status ? predictedOffsetMinutes(bus) : null;
    return L.divIcon({
        className: [
            "bus-marker-icon",
            isElectric(bus) && "bus-marker-icon--electric",
            // success, warning or info like the status chips. The glyph still marks electric buses
            status && `bus-marker-icon--status-${offset === null ? "unknown" : scheduleStatus(offset).color}`,
            // greyed out so an hours-old position doesn't pass for a live one
            level === "old" && "bus-marker-icon--old",
            history && "bus-marker-icon--history",
            selected && "bus-marker-icon--selected",
        ].filter(Boolean).join(" "),
        html: `<div class="bus-icon-wrapper">
            <svg class="bus-icon-pin" viewBox="0 0 36 36" style="transform: rotate(${Number(bus.bearing) || 0}deg)">
                <g class="bus-icon-outline">${BUS_PIN_SHAPE}</g>
                <g class="bus-icon-fill">${BUS_PIN_SHAPE}</g>
            </svg>
            <i class="bus-icon-glyph mdi ${isElectric(bus) ? "mdi-lightning-bolt" : "mdi-bus"}"></i>
            ${showAge && bus.timestamp ? `<span class="bus-age-badge" data-level="${level}" data-timestamp="${Number(bus.timestamp)}">${formatReportAge(bus.timestamp)}</span>` : ""}
            ${label ? `<span class="bus-time-badge">${escapeHtml(label)}</span>` : ""}
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    });
};
