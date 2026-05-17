<script setup>
import 'leaflet/dist/leaflet';
import 'leaflet';
import '../plugins/AnimatedMarker';
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import logo from '../assets/bus.png'
import electric from '../assets/elec.png'
import { useQuery } from '@tanstack/vue-query';
import { getTrip, getBusStopTimes, getTrips } from '../api';
import { useStops } from '../composables/useStops';
import { chunk } from '../utils/chunk';
// import 'leaflet/dist/leaflet.css'
let map = null
const ROUTE_PANE_Z_INDEX = 450;

let interval = null;

const createBusIcon = (iconUrl) => L.divIcon({
    className: "bus-marker-icon",
    html: `<div class="bus-icon-wrapper"><img class="bus-icon-image" src="${iconUrl}" /></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
});

const icon = createBusIcon(logo);
const elec = createBusIcon(electric);

/**
 * @type {Record<string, import("../api/index").Bus>}
 */
const buses = {};

const assignRouteToEachBus = async (newBuses) => {
    const tripIds = newBuses.map((bus) => bus.trip);
    const uniqueTrips = [...new Set(tripIds)];
    const tripBatches = chunk(uniqueTrips, 50);
    const routes = [];
    await Promise.allSettled(
        tripBatches.map((batch) =>
            getTrips(batch).then((batchTrips) => routes.push(...batchTrips)),
        ),
    );
    const routeMap = {};
    routes.forEach((route) => {
        routeMap[route.trip_id] = route.route_id;
    });
    newBuses.forEach((bus) => {
        bus.route_id = routeMap[bus.trip] || null;
    });
}

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

const updateBuses = async () => {
    if (document.visibilityState == "hidden") {
        return;
    }
    /** @type {{}[]} */
    let newBuses = await fetch(`${import.meta.env.VITE_APP_API_URL}/bus/now`).then(r => r.json());
    await assignRouteToEachBus(newBuses);
    removeOldBuses(newBuses);
    for (let bus of newBuses) {
        // add new ones
        if (buses[bus.bus]) {
            // bus already in list
            let prev = buses[bus.bus];
            let line = L.polyline([prev.getLatLng(), [bus.lat, bus.long]])
            prev.remove();
            let newMarker = L.animatedMarker(line.getLatLngs(), {title: bus.bus, icon: bus.bus >= 8000 ? elec : icon, route_id: bus.route_id}).addTo(map)
            newMarker.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
                handleBusClick(bus);
            });
            buses[bus.bus] = newMarker;
        } else {
            // bus not in list
            let marker = L.marker([bus.lat, bus.long], {title: bus.bus, icon: bus.bus >= 8000 ? elec : icon, route_id: bus.route_id}).addTo(map)
            marker.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
                handleBusClick(bus);
            })
            buses[bus.bus] = marker;
        }
    }
    applyRouteHighlighting();
}

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

const applyRouteHighlighting = () => {
    const selectedRouteId = selectedBus.value ? trip.value?.route_id : null;
    for (const marker of Object.values(buses)) {
        marker.setOpacity(1);
        marker.setZIndexOffset(0);
    }
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
        bounds: [[53.6, -113.7], [53.33, -113.3]],
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: `access_token=${import.meta.env.VITE_APP_MAPBOX_ACCESS_TOKEN}`
    }).addTo(map)
}

const setUpInterval = () => {
    interval = setInterval(() => updateBuses(), 1000 * 60);
}

onMounted(() => {
    createMap();
    updateBuses();
    setUpInterval()
})

onBeforeUnmount(() => {
    clearInterval(interval)
    map?.off("click", clearRouteSelection);
})
</script>
<template>
  <div>
    <div id="test" class="map" />
  </div>
</template>
<style scoped>
.map {
    width: 100vw;
    height: 50vh;
}

:deep(.bus-marker-icon) {
    background: transparent;
    border: 0;
}

:deep(.bus-icon-wrapper) {
    align-items: center;
    background: #ffffff;
    border: 2px solid #000000;
    border-radius: 9999px;
    display: flex;
    height: 30px;
    justify-content: center;
    width: 30px;
}

:deep(.bus-icon-image) {
    display: block;
    height: 20px;
    width: 20px;
}
</style>
