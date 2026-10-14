<script setup>
import L from '../plugins/leaflet';
import { createBusIcon, refreshReportAges } from '../plugins/busIcon';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({
    /** @type {import('vue').PropType<{stop_id: string, stop_name: string, lat: number, lon: number}[]>} */
    stops: {
        type: Array,
        default: () => [],
    },
    /** @type {import('vue').PropType<import('../api').Bus[]>} */
    buses: {
        type: Array,
        default: () => [],
    },
});

const STOP_STYLE = {
    radius: 5,
    color: "#3f51b5",
    fillColor: "#ffffff",
    fillOpacity: 1,
    weight: 2,
};

const router = useRouter();
const mapElement = ref(null);

let map = null;
let stopRenderer = null;
let stopLayer = null;
let busLayer = null;
/** @type {Map<number | string, {marker: import('leaflet').Marker, bus: import('../api').Bus}>} */
const busMarkers = new Map();
let reportAgeInterval = null;
// the map is only fitted to the stops once, so refreshes don't undo the user's panning
let fitted = false;

const drawStops = () => {
    if (!map) {
        return;
    }
    stopLayer.clearLayers();
    for (const stop of props.stops) {
        L.circleMarker([stop.lat, stop.lon], { ...STOP_STYLE, renderer: stopRenderer })
            .bindTooltip(stop.stop_name)
            .on("click", () => router.push(`/stops/${encodeURIComponent(stop.stop_id)}`))
            .addTo(stopLayer);
    }
    if (!fitted && props.stops.length) {
        map.fitBounds(props.stops.map((stop) => [stop.lat, stop.lon]), { padding: [24, 24] });
        fitted = true;
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
                icon: createBusIcon(bus, { showAge: true }),
            }).addTo(busLayer);
            entry = { marker, bus };
            const created = entry;
            marker.on("click", () => router.push(`/trips/${created.bus.trip}`));
            busMarkers.set(bus.bus, entry);
        } else {
            entry.marker.setLatLng([bus.lat, bus.long]);
            // picks up the new bearing and report time
            entry.marker.setIcon(createBusIcon(bus, { showAge: true }));
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

watch(() => props.stops, drawStops);
watch(() => props.buses, drawBuses);

onMounted(() => {
    createMap();
    drawStops();
    drawBuses();
    reportAgeInterval = setInterval(() => refreshReportAges(mapElement.value), 1000);
})

onBeforeUnmount(() => {
    clearInterval(reportAgeInterval);
    busMarkers.clear();
    map?.remove();
    map = null;
})
</script>

<template>
  <div ref="mapElement" class="route-map" />
</template>

<style scoped>
.route-map {
    border-radius: 12px;
    height: 360px;
    width: 100%;
    /* keeps leaflet's panes underneath the app bar and navigation drawer */
    z-index: 0;
}

@media (max-width: 599px) {
    .route-map {
        height: 280px;
    }
}
</style>
