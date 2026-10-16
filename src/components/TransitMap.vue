<script setup>
import L from '../plugins/leaflet';
import { createBusIcon, refreshReportAges } from '../plugins/busIcon';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { attachSharedMap, detachSharedMap, ROUTE_PANE } from '../plugins/sharedMap';
import { prefersReducedMotion } from '../utils/viewTransition';
import { thinPositions } from '../utils/positions';
import { DISRUPTION_RING_STYLE } from '../utils/serviceAlerts';

/**
 * @typedef {Object} MapStop
 * @property {string} stop_id
 * @property {string} stop_name
 * @property {number} lat
 * @property {number} lon
 * @property {string} [color] Outline and fill, e.g. how late the bus was there
 * @property {string} [tooltip] Defaults to the stop name
 * @property {string | null} [disruption] e.g. "Detour", when a service alert names the stop. Drawn as a ring
 */

/**
 * A recorded position, drawn as a small pin with a time badge
 * @typedef {import('../api').Bus & {key: string, label: string}} MapPosition
 */

const props = defineProps({
    /** @type {import('vue').PropType<MapStop[]>} */
    stops: {
        type: Array,
        default: () => [],
    },
    /** @type {import('vue').PropType<import('../api').Bus[]>} */
    buses: {
        type: Array,
        default: () => [],
    },
    /** @type {import('vue').PropType<[number, number][][]>} route lines, as [lat, lon] points */
    paths: {
        type: Array,
        default: () => [],
    },
    // the map fits its stops once per key, so refreshes don't undo the user's panning
    fitKey: {
        type: [String, Number],
        default: null,
    },
    // label bus pins with how old their positions are
    showAge: {
        type: Boolean,
        default: false,
    },
    // keep the map centred on the first bus instead of fitting the stops
    followBus: {
        type: Boolean,
        default: false,
    },
    /** @type {import('vue').PropType<MapPosition[]>} past positions, thinned out to fit the zoom */
    positions: {
        type: Array,
        default: () => [],
    },
    /** @type {import('vue').PropType<MapPosition | null>} always drawn, and flown to when picked */
    selectedPosition: {
        type: Object,
        default: null,
    },
    /** @type {import('vue').PropType<[number, number] | null>} the viewer, as a blue dot, once they've asked to be located */
    userLocation: {
        type: Array,
        default: null,
    },
});

const emit = defineEmits(['select-position']);

const STOP_STYLE = {
    radius: 5,
    color: "#3f51b5",
    fillColor: "#ffffff",
    fillOpacity: 1,
    weight: 2,
};
const USER_STYLE = {
    radius: 8,
    color: "#ffffff",
    fillColor: "#1a73e8",
    fillOpacity: 1,
    weight: 3,
    interactive: false,
};
const PATH_STYLE = {
    color: "#3f51b5",
    opacity: 0.6,
    weight: 4,
};
// long enough to follow the zoom between pages, short enough not to hold the page up
const FLY_DURATION_SECONDS = 0.8;
// close enough to see which street the bus is on
const FOLLOW_ZOOM = 16;
// about a time badge's width, so zoomed out pins and badges don't pile up
const POSITION_SPACING_PX = 64;

const router = useRouter();
const mapElement = ref(null);

let map = null;
/** @type {object | null} the shared map's owner token */
let mapToken = null;
// the map came from another page, so the first fit flies there instead of jumping
let flyIn = false;
let stopRenderer = null;
let stopLayer = null;
let pathLayer = null;
let busLayer = null;
let positionLayer = null;
let selectedLayer = null;
let userLayer = null;
/** @type {Map<number | string, {marker: import('leaflet').Marker, bus: import('../api').Bus}>} */
const busMarkers = new Map();
let fitted = false;
/** @type {[number, number] | null} where the map last centred on the followed bus */
let followed = null;
let reportAgeInterval = null;

const fit = () => {
    if (props.followBus || fitted || !props.stops.length) {
        return;
    }
    const points = [
        ...props.stops.map((stop) => [stop.lat, stop.lon]),
        ...props.paths.flat(),
    ];
    if (flyIn) {
        map.flyToBounds(points, { padding: [24, 24], duration: FLY_DURATION_SECONDS });
    } else {
        map.fitBounds(points, { padding: [24, 24] });
    }
    flyIn = false;
    fitted = true;
}

const drawStops = () => {
    if (!map) {
        return;
    }
    stopLayer.clearLayers();
    for (const stop of props.stops) {
        if (stop.disruption) {
            L.circleMarker([stop.lat, stop.lon], { ...DISRUPTION_RING_STYLE, radius: STOP_STYLE.radius + 4, renderer: stopRenderer })
                .addTo(stopLayer);
        }
        const color = stop.color ? { color: stop.color, fillColor: stop.color, fillOpacity: 0.95 } : {};
        L.circleMarker([stop.lat, stop.lon], { ...STOP_STYLE, ...color, renderer: stopRenderer })
            .bindTooltip(stop.tooltip ?? stop.stop_name)
            .on("click", () => router.push(`/stops/${encodeURIComponent(stop.stop_id)}`))
            .addTo(stopLayer);
    }
    fit();
}

const drawPaths = () => {
    if (!map) {
        return;
    }
    pathLayer.clearLayers();
    for (const path of props.paths) {
        if (path.length > 1) {
            L.polyline(path, { ...PATH_STYLE, pane: ROUTE_PANE, interactive: false }).addTo(pathLayer);
        }
    }
}

const drawBuses = () => {
    if (!map) {
        return;
    }
    const current = new Set();
    for (const bus of props.buses) {
        // buses handed over from another page have no position yet
        if (!Number.isFinite(Number(bus.lat)) || !Number.isFinite(Number(bus.long))) {
            continue;
        }
        current.add(bus.bus);
        let entry = busMarkers.get(bus.bus);
        if (!entry) {
            const marker = L.marker([bus.lat, bus.long], {
                title: `Bus ${bus.bus}`,
                // no age badges by default, as a route's worth of them clutters the map
                icon: createBusIcon(bus, { showAge: props.showAge }),
            }).addTo(busLayer);
            entry = { marker, bus };
            const created = entry;
            marker.on("click", () => {
                // a bus out of service has no trip to open
                if (created.bus.trip) {
                    router.push(`/trips/${created.bus.trip}`);
                }
            });
            busMarkers.set(bus.bus, entry);
        } else {
            entry.marker.setLatLng([bus.lat, bus.long]);
            // picks up the new bearing
            entry.marker.setIcon(createBusIcon(bus, { showAge: props.showAge }));
        }
        entry.bus = bus;
    }
    for (const [id, entry] of [...busMarkers]) {
        if (!current.has(id)) {
            entry.marker.remove();
            busMarkers.delete(id);
        }
    }
    follow();
}

const follow = () => {
    const bus = props.buses[0];
    if (!props.followBus || !bus) {
        return;
    }
    const position = /** @type {[number, number]} */ ([Number(bus.lat), Number(bus.long)]);
    if (!position.every(Number.isFinite)) {
        return;
    }
    if (!followed && !flyIn) {
        map.setView(position, FOLLOW_ZOOM);
    } else if (!followed || followed[0] !== position[0] || followed[1] !== position[1]) {
        map.flyTo(position, FOLLOW_ZOOM, {
            animate: !prefersReducedMotion(),
            duration: flyIn ? FLY_DURATION_SECONDS : undefined,
        });
    }
    flyIn = false;
    followed = position;
}

const positionMarker = (position, options) =>
    L.marker([position.lat, position.long], {
        title: position.label,
        icon: createBusIcon(position, { label: position.label, history: true, ...options }),
        zIndexOffset: options?.selected ? 1000 : 0,
    }).on("click", () => emit("select-position", position.key));

// only the positions far enough apart at this zoom, and in view, so zooming in shows more
const drawPositions = () => {
    if (!map) {
        return;
    }
    positionLayer.clearLayers();
    if (!props.positions.length) {
        return;
    }
    const zoom = map.getZoom();
    const points = props.positions.map((position) => map.project([position.lat, position.long], zoom));
    const view = map.getPixelBounds().pad(0.2);
    for (const index of thinPositions(points, POSITION_SPACING_PX)) {
        const position = props.positions[index];
        if (position.key !== props.selectedPosition?.key && view.contains(points[index])) {
            positionMarker(position).addTo(positionLayer);
        }
    }
}

const drawSelectedPosition = () => {
    if (!map) {
        return;
    }
    selectedLayer.clearLayers();
    const position = props.selectedPosition;
    if (position) {
        positionMarker(position, { selected: true }).addTo(selectedLayer);
    }
}

const drawUserLocation = () => {
    if (!map) {
        return;
    }
    userLayer.clearLayers();
    if (props.userLocation) {
        L.circleMarker(props.userLocation, USER_STYLE).addTo(userLayer);
    }
}

const flyToSelectedPosition = () => {
    const position = props.selectedPosition;
    if (!map || !position) {
        return;
    }
    map.flyTo([position.lat, position.long], Math.max(map.getZoom(), FOLLOW_ZOOM), {
        animate: !prefersReducedMotion(),
    });
}

const removeLayers = () => {
    map?.off("zoomend moveend", drawPositions);
    for (const layer of [pathLayer, stopLayer, userLayer, busLayer, positionLayer, selectedLayer, stopRenderer]) {
        layer?.remove();
    }
    busMarkers.clear();
    map = null;
}

const createMap = () => {
    const attached = attachSharedMap(mapElement.value, removeLayers);
    map = attached.map;
    mapToken = attached.token;
    flyIn = attached.handedOver && !prefersReducedMotion();
    // a long route has a few hundred stops, which are quicker on a canvas
    stopRenderer = L.canvas({ padding: 0.2, tolerance: 6 }).addTo(map);
    pathLayer = L.layerGroup().addTo(map);
    stopLayer = L.layerGroup().addTo(map);
    userLayer = L.layerGroup().addTo(map);
    positionLayer = L.layerGroup().addTo(map);
    busLayer = L.layerGroup().addTo(map);
    selectedLayer = L.layerGroup().addTo(map);
    map.on("zoomend moveend", drawPositions);
}

// registered first, so a new key's stops are fitted when they're drawn below, not the old ones
watch(() => props.fitKey, () => {
    fitted = false;
});
// switching between following the bus and showing a whole trip
watch(() => props.followBus, (following) => {
    if (!map) {
        return;
    }
    if (following) {
        followed = null;
        follow();
    } else {
        fitted = false;
        fit();
    }
});
watch(() => props.stops, drawStops);
watch(() => props.paths, drawPaths);
watch(() => props.buses, drawBuses);
watch(() => props.positions, drawPositions);
watch(() => props.userLocation, drawUserLocation);
watch(() => props.selectedPosition, () => {
    drawSelectedPosition();
    drawPositions();
});
// a refetch hands over a new object for the same position, which shouldn't move the map
watch(() => props.selectedPosition?.key, flyToSelectedPosition);

onMounted(() => {
    createMap();
    drawPaths();
    drawStops();
    drawBuses();
    drawPositions();
    drawSelectedPosition();
    drawUserLocation();
    if (props.showAge) {
        reportAgeInterval = setInterval(() => refreshReportAges(mapElement.value), 1000);
    }
})

onBeforeUnmount(() => {
    clearInterval(reportAgeInterval);
    removeLayers();
    detachSharedMap(mapToken);
})
</script>

<template>
  <div ref="mapElement" class="transit-map" />
</template>

<style scoped>
.transit-map {
    border-radius: 12px;
    overflow: hidden;
    position: relative;
    /* pages can set their own height */
    height: var(--transit-map-height, 360px);
    width: 100%;
    /* keeps leaflet's panes underneath the app bar and navigation drawer */
    z-index: 0;
}

.transit-map :deep(.shared-map) {
    height: 100%;
    width: 100%;
}

@media (max-width: 599px) {
    .transit-map {
        height: var(--transit-map-height, 280px);
    }
}
</style>
