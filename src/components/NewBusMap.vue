<script setup>
import L from '../plugins/leaflet';
import '../plugins/AnimatedMarker';
import { createBusIcon } from '../plugins/busIcon';
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { getTrip, getBusStopTimes } from '../api';
import { useStops } from '../composables/useStops';
import { useBuses } from '../composables/useBuses';
// import 'leaflet/dist/leaflet.css'
let map = null
/** @type {import('leaflet').CircleMarker | null} */
let userMarker = null;
const ROUTE_PANE_Z_INDEX = 350;

/**
 * @type {Record<string, import("../api/index").Bus>}
 */
const buses = {};

/** @type {import("vue").Ref<{bus: string, lat: string, long: string, trip: string}|null>} */
const selectedBus = ref(null);

const emits = defineEmits(["bus-details"]);

/**
 * Given a list of new buses, removes the buses from the map that are no longer 
 * returned by the API
 * 
 * @param {{bus: string}[]} newBuses 
 */
const removeOldBuses = (newBuses) => {
    // create hash map for faster searching
    const newBusHashMap = newBuses.reduce((acc, bus) => {
        acc[bus.bus] = true;
        return acc;
    }, /** @type {Record<string, true>} */ ({}));
    // remove old buses
    for (const index in buses) {
        if (!(index in newBusHashMap)) {
            buses[index].remove();
            delete buses[index];
        }
    }
}

/**
 * Moves the markers to the latest snapshot, adding and removing buses as needed
 * @param {import("../api/index").Bus[] | undefined} newBuses
 */
const renderBuses = (newBuses) => {
    if (!map || !newBuses) {
        return;
    }
    removeOldBuses(newBuses);
    for (let bus of newBuses) {
        // add new ones
        if (buses[bus.bus]) {
            // bus already in list
            let prev = buses[bus.bus];
            let line = L.polyline([prev.getLatLng(), [bus.lat, bus.long]])
            prev.remove();
            let newMarker = L.animatedMarker(line.getLatLngs(), {title: bus.bus, icon: createBusIcon(bus), route_id: bus.route_id}).addTo(map)
            newMarker.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
                handleBusClick(bus);
            });
            buses[bus.bus] = newMarker;
        } else {
            // bus not in list
            let marker = L.animatedMarker([[bus.lat, bus.long], [bus.lat, bus.long]], {title: bus.bus, icon: createBusIcon(bus), route_id: bus.route_id}).addTo(map)
            marker.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
                handleBusClick(bus);
            })
            buses[bus.bus] = marker;
        }
    }
    applyRouteHighlighting();
}

// shared with the other pages, and refetched when the backend's next snapshot should be ready
const { buses: liveBuses } = useBuses();
watch(liveBuses, renderBuses);

const { data: trip } = useQuery({
    queryKey: ['bus', selectedBus],
    queryFn: () => selectedBus.value ?  getTrip(selectedBus.value.trip) : null
});

const { data: tripStops } = useQuery({
    queryKey: ['trip-stops', selectedBus],
    queryFn: () => selectedBus.value ? getBusStopTimes(selectedBus.value.trip) : []
});

const { stops } = useStops();

/** @type {import("vue").ComputedRef<Record<string, import("../api/index").BusStop>>} */
const stopsHashMap = computed(() => {
    if (!stops.value) {
        return {};
    }
    return stops.value.reduce((acc, stop) => {
        acc[stop.stop_id] = {...stop};
        return acc;
    }, /** @type {Record<string, import("../api/index").BusStop>} */ ({}));
});

const handleBusClick = (bus) => {
    emits("bus-details", bus);
    selectedBus.value = bus;
}

const clearRouteSelection = () => {
    selectedBus.value = null;
    routePathPoints.length = 0;
    previousPolyline?.remove();
    previousPolyline = null;
    for (const marker of stopMarkers) {
        marker?.remove();
    }
    stopMarkers.length = 0;
    emits("bus-details", null);
    applyRouteHighlighting();
}

/** @type {import('leaflet').Polyline | null} */
let previousPolyline = null;
/** @type {[number, number][]} */
let routePathPoints = [];

const getClosestRoutePoint = (lat, lon) => {
    if (!routePathPoints.length) {
        return [lat, lon];
    }
    let nearestPoint = routePathPoints[0];
    let nearestDistance = Infinity;
    const target = L.latLng(lat, lon);
    for (const point of routePathPoints) {
        const distance = target.distanceTo(L.latLng(point[0], point[1]));
        if (distance < nearestDistance) {
            nearestDistance = distance;
            nearestPoint = point;
        }
    }
    return nearestPoint;
}

const applySelectedStyling = () => {
    for (const marker of Object.values(buses)) {
        marker.getElement()?.classList.toggle(
            "bus-marker-icon--selected",
            marker.options.title === selectedBus.value?.bus,
        );
    }
}

// the trip watcher doesn't fire when the trip lookup fails or returns the same value
watch(selectedBus, applySelectedStyling);

const applyRouteHighlighting = () => {
    const selectedRouteId = selectedBus.value ? trip.value?.route_id : null;
    for (const marker of Object.values(buses)) {
        marker.setOpacity(1);
        marker.setZIndexOffset(0);
    }
    applySelectedStyling();
    if (!selectedRouteId) {
        return;
    }
    for (const markerBus of Object.values(buses)) {
        if (markerBus.options.title === selectedBus.value?.bus) {
            markerBus.setOpacity(1);
            markerBus.setZIndexOffset(2000);
            continue;
        }
        const markerRouteId = markerBus.options?.route_id;
        if (markerRouteId === selectedRouteId) {
            markerBus.setOpacity(1);
            markerBus.setZIndexOffset(1000);
        } else {
            markerBus.setOpacity(0.35);
            markerBus.setZIndexOffset(0);
        }
    }
}

watch(trip, () => {
    if (!trip.value) {
        routePathPoints.length = 0;
        previousPolyline?.remove();
        previousPolyline = null;
        applyRouteHighlighting();
        return;
    }
    previousPolyline?.remove();
    const coordinates = trip.value.geometry_line?.coordinates || [];
    routePathPoints = coordinates.flatMap((segment) => segment.map(([a, b]) => [b, a]));
    if (!routePathPoints.length) {
        applyRouteHighlighting();
        return;
    }
    previousPolyline = L.polyline(routePathPoints, { pane: "routePane" }).addTo(map);
    previousPolyline.on("click", (event) => L.DomEvent.stopPropagation(event));
    map.fitBounds(previousPolyline.getBounds());
    applyRouteHighlighting();
})

/** @type {import("leaflet").Marker[]} */
let stopMarkers = [];

watch(tripStops, () => {
    if (!tripStops.value) {
        return;
    }
    for (const marker of stopMarkers) {
        marker?.remove();
    }
    stopMarkers = [];
    for (const stop of tripStops.value) {
        const stopDetails = stopsHashMap.value?.[stop.stop_id];
        if (!stopDetails) {
            continue;
        }
        if (!stopDetails.stop_lat || !stopDetails.stop_lon) {
            console.error("No location details for ", stopDetails);
            continue;
        }
        const [pathLat, pathLon] = getClosestRoutePoint(stopDetails.stop_lat, stopDetails.stop_lon);
        const marker = L.circleMarker(
            [pathLat, pathLon], 
            {
                title: `${stopDetails.stop_name} ${stop.arrival_time_fixed}`,
                radius: 4,
                color: "#000000",
                fillColor: "#ffffff",
                fillOpacity: 1,
                opacity: 0.95,
                weight: 2
            }
        ).addTo(map);
        marker.on("click", (event) => L.DomEvent.stopPropagation(event));
        marker.bindTooltip(`${stopDetails.stop_name} ${stop.arrival_time_fixed}`);
        stopMarkers.push(marker);
    }
})

const locating = ref(false);
const showLocationError = ref(false);

const locate = () => {
    if (!navigator.geolocation) {
        showLocationError.value = true;
        return;
    }
    locating.value = true;
    navigator.geolocation.getCurrentPosition(
        (position) => {
            locating.value = false;
            if (!map) {
                return;
            }
            const latlng = [position.coords.latitude, position.coords.longitude];
            userMarker?.remove();
            userMarker = L.circleMarker(latlng, {
                radius: 8,
                color: "#ffffff",
                fillColor: "#1a73e8",
                fillOpacity: 1,
                weight: 3,
                interactive: false,
            }).addTo(map);
            map.setView(latlng, 16);
        },
        () => {
            showLocationError.value = true;
            locating.value = false;
        },
    );
}

const createMap = () => {
    map = L.map('test', {
        center: [53.5150, -113.4757],
        zoom: 12,
    });
    map.createPane("routePane");
    map.getPane("routePane").style.zIndex = ROUTE_PANE_Z_INDEX;
    map.on("click", clearRouteSelection);
    L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}/?{accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        minZoom: 10,
        bounds: [[53.65, -113.7], [53.23, -113.3]],
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: `access_token=${import.meta.env.VITE_APP_MAPBOX_ACCESS_TOKEN}`
    }).addTo(map)
}

onMounted(() => {
    createMap();
    // a cached snapshot from an earlier visit shows straight away
    renderBuses(liveBuses.value);
})

onBeforeUnmount(() => {
    map?.off("click", clearRouteSelection);
    userMarker?.remove();
    userMarker = null;
})
</script>
<template>
  <div class="map-wrapper">
    <div id="test" class="map" />
    <v-btn
      class="locate-button"
      icon="mdi-crosshairs-gps"
      size="small"
      elevation="2"
      aria-label="Show my location"
      :loading="locating"
      @click="locate"
    />
    <v-snackbar v-model="showLocationError" location="bottom" :timeout="3000" color="error">
      Your location could not be determined
    </v-snackbar>
  </div>
</template>
<style scoped>
.map-wrapper {
    height: 100%;
    position: relative;
    width: 100%;
}

.map {
    width: 100%;
    height: 100%;
    /* keeps leaflet's panes underneath the app bar and navigation drawer */
    z-index: 0;
}

.locate-button {
    bottom: 24px;
    position: absolute;
    right: 12px;
    z-index: 1;
}
</style>
