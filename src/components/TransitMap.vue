<script setup>
import L from '../plugins/leaflet';
import { createBusIcon } from '../plugins/busIcon';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

/**
 * @typedef {Object} MapStop
 * @property {string} stop_id
 * @property {string} stop_name
 * @property {number} lat
 * @property {number} lon
 * @property {string} [color] Outline and fill, e.g. how late the bus was there
 * @property {string} [tooltip] Defaults to the stop name
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
});

const STOP_STYLE = {
    radius: 5,
    color: "#3f51b5",
    fillColor: "#ffffff",
    fillOpacity: 1,
    weight: 2,
};
const PATH_STYLE = {
    color: "#3f51b5",
    opacity: 0.6,
    weight: 4,
};
// under the stops and buses
const PATH_PANE_Z_INDEX = 350;

const router = useRouter();
const mapElement = ref(null);

let map = null;
let stopRenderer = null;
let stopLayer = null;
let pathLayer = null;
let busLayer = null;
/** @type {Map<number | string, {marker: import('leaflet').Marker, bus: import('../api').Bus}>} */
const busMarkers = new Map();
let fitted = false;

const fit = () => {
    if (fitted || !props.stops.length) {
        return;
    }
    const points = [
        ...props.stops.map((stop) => [stop.lat, stop.lon]),
        ...props.paths.flat(),
    ];
    map.fitBounds(points, { padding: [24, 24] });
    fitted = true;
}

const drawStops = () => {
    if (!map) {
        return;
    }
    stopLayer.clearLayers();
    for (const stop of props.stops) {
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
            L.polyline(path, { ...PATH_STYLE, pane: "pathPane", interactive: false }).addTo(pathLayer);
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
                // no age badges, as a route's worth of them clutters the map
                icon: createBusIcon(bus),
            }).addTo(busLayer);
            entry = { marker, bus };
            const created = entry;
            marker.on("click", () => router.push(`/trips/${created.bus.trip}`));
            busMarkers.set(bus.bus, entry);
        } else {
            entry.marker.setLatLng([bus.lat, bus.long]);
            // picks up the new bearing
            entry.marker.setIcon(createBusIcon(bus));
        }
        entry.bus = bus;
    }
    for (const [id, entry] of [...busMarkers]) {
        if (!current.has(id)) {
            entry.marker.remove();
            busMarkers.delete(id);
        }
    }
}

const createMap = () => {
    map = L.map(mapElement.value, {
        center: [53.5444, -113.4909],
        zoom: 12,
    });
    // a long route has a few hundred stops, which are quicker on a canvas
    stopRenderer = L.canvas({ padding: 0.2, tolerance: 6 });
    map.createPane("pathPane");
    map.getPane("pathPane").style.zIndex = PATH_PANE_Z_INDEX;
    pathLayer = L.layerGroup().addTo(map);
    stopLayer = L.layerGroup().addTo(map);
    busLayer = L.layerGroup().addTo(map);
    L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}/?{accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        minZoom: 9,
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: `access_token=${import.meta.env.VITE_APP_MAPBOX_ACCESS_TOKEN}`
    }).addTo(map)
}

// registered first, so a new key's stops are fitted when they're drawn below, not the old ones
watch(() => props.fitKey, () => {
    fitted = false;
});
watch(() => props.stops, drawStops);
watch(() => props.paths, drawPaths);
watch(() => props.buses, drawBuses);

onMounted(() => {
    createMap();
    drawPaths();
    drawStops();
    drawBuses();
})

onBeforeUnmount(() => {
    busMarkers.clear();
    map?.remove();
    map = null;
})
</script>

<template>
  <div ref="mapElement" class="transit-map" />
</template>

<style scoped>
.transit-map {
    border-radius: 12px;
    /* pages can set their own height */
    height: var(--transit-map-height, 360px);
    width: 100%;
    /* keeps leaflet's panes underneath the app bar and navigation drawer */
    z-index: 0;
}

@media (max-width: 599px) {
    .transit-map {
        height: var(--transit-map-height, 280px);
    }
}
</style>
