import L from './leaflet';
import '../styles/bus-marker.css';
import { formatReportAge, reportAgeLevel } from '../utils/reportAge';

const BUS_PIN_SHAPE = '<polygon points="18,1.5 11.5,10 24.5,10" /><circle cx="18" cy="18" r="11" />';

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
 * @param {{showAge?: boolean}} [options] showAge: label the pin with how old its position
 *   is, kept current by refreshReportAges
 */
export const createBusIcon = (bus, { showAge = false } = {}) => {
    const level = showAge && bus.timestamp ? reportAgeLevel(bus.timestamp) : "fresh";
    return L.divIcon({
        className: [
            "bus-marker-icon",
            isElectric(bus) && "bus-marker-icon--electric",
            // greyed out so an hours-old position doesn't pass for a live one
            level === "old" && "bus-marker-icon--old",
        ].filter(Boolean).join(" "),
        html: `<div class="bus-icon-wrapper">
            <svg class="bus-icon-pin" viewBox="0 0 36 36" style="transform: rotate(${Number(bus.bearing) || 0}deg)">
                <g class="bus-icon-outline">${BUS_PIN_SHAPE}</g>
                <g class="bus-icon-fill">${BUS_PIN_SHAPE}</g>
            </svg>
            <i class="bus-icon-glyph mdi ${isElectric(bus) ? "mdi-lightning-bolt" : "mdi-bus"}"></i>
            ${showAge && bus.timestamp ? `<span class="bus-age-badge" data-level="${level}" data-timestamp="${Number(bus.timestamp)}">${formatReportAge(bus.timestamp)}</span>` : ""}
        </div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
    });
};
