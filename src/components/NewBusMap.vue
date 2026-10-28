<script setup>
import L from '../plugins/leaflet';
import '../plugins/AnimatedMarker';
import { createBusIcon } from '../plugins/busIcon';
import { ref, onMounted, onBeforeUnmount, watch, computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { getTrip, getBusStopTimes } from '../api';
import { useStops } from '../composables/useStops';
import { useMapBuses } from '../composables/useBuses';
import { attachSharedMap, detachSharedMap, navigatingByHistory, rememberedHomeView, rememberHomeView, ROUTE_PANE } from '../plugins/sharedMap';
import { prefersReducedMotion } from '../utils/viewTransition';
import { routeNumber } from '../utils/routes';
import { useNowLocal, useServiceAlerts } from '../composables/useServiceAlerts';
import { DISRUPTION_RING_STYLE, disruptedStops as stopsWithAlerts, effectLabel } from '../utils/serviceAlerts';
/** @type {import('leaflet').Map | null} */
let map = null
/** @type {object | null} the shared map's owner token */
let mapToken = null;
// everything this page draws, so it can all come off the shared map when leaving
/** @type {import('leaflet').LayerGroup | null} */
let homeLayer = null;
/** @type {import('leaflet').CircleMarker | null} */
let userMarker = null;
const HOME_CENTER = /** @type {[number, number]} */ ([53.5150, -113.4757]);
const HOME_ZOOM = 12;
// matches TransitMap's, so the zoom back feels like the zoom in undone
const FLY_DURATION_SECONDS = 0.8;
/** @type {{ center: import('leaflet').LatLngExpression, zoom: number } | null} where the map is flying back to */
let flyingHome = null;

const props = defineProps({
    // a bus selected when the user left the page, reselected if it's still in the snapshot
    restoreBusId: {
        type: [String, Number],
        default: null,
    },
    // px of the screen's bottom the page covers (the phone's bus sheet), kept clear of the route
    bottomInset: {
        type: Number,
        default: 0,
    },
    // a time travel time (YYYY-MM-DDTHH:MM, Edmonton) to show the buses at, or null for live ones
    at: {
        type: String,
        default: null,
    },
    // the stop open in the page's panel, drawn larger and centred on
    stopId: {
        type: String,
        default: null,
    },
    // with a stop open, the buses on their way to it. The rest are hidden, like other routes' are with a bus picked
    /** @type {import('vue').PropType<(string | number)[] | null>} */
    stopBusIds: {
        type: Array,
        default: null,
    },
    // a bus picked in the stop's panel, outlined like a selected one
    highlightBusId: {
        type: [String, Number],
        default: null,
    },
});
let pendingRestore = props.restoreBusId;
// a restored selection keeps the remembered view rather than fitting its route
let fitSelection = true;

/**
 * @type {Record<string, import("../api/index").Bus>}
 */
const buses = {};

/** @type {import("vue").Ref<{bus: string, lat: string, long: string, trip: string}|null>} */
const selectedBus = ref(null);

const emits = defineEmits(["bus-details", "stop-click", "map-click"]);

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
    // a backend without predicted delays would leave every bus grey, so keep the plain colours
    const status = newBuses.some((bus) => "delay" in bus);
    const iconFor = (bus) => createBusIcon(bus, { status, route: bus.route_id ? routeNumber(String(bus.route_id)) : "" });
    for (let bus of newBuses) {
        // add new ones
        if (buses[bus.bus]) {
            // bus already in list
            let prev = buses[bus.bus];
            let line = L.polyline([prev.getLatLng(), [bus.lat, bus.long]])
            prev.remove();
            let newMarker = L.animatedMarker(line.getLatLngs(), {title: bus.bus, icon: iconFor(bus), route_id: bus.route_id}).addTo(homeLayer)
            newMarker.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
                handleBusClick(bus);
            });
            buses[bus.bus] = newMarker;
        } else {
            // bus not in list
            let marker = L.animatedMarker([[bus.lat, bus.long], [bus.lat, bus.long]], {title: bus.bus, icon: iconFor(bus), route_id: bus.route_id}).addTo(homeLayer)
            marker.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
                handleBusClick(bus);
            })
            buses[bus.bus] = marker;
        }
    }
    applyRouteHighlighting();
    restoreSelection(newBuses);
    followSelection(newBuses);
}

// set when the time changes, so the selected bus moves with the map's buses once they load
let timeChanged = false;

/**
 * After a time change, keeps the selected bus selected at its new position, or lets go
 * of it when it wasn't out then
 * @param {import("../api/index").Bus[]} newBuses
 */
const followSelection = (newBuses) => {
    if (!timeChanged) {
        return;
    }
    timeChanged = false;
    if (!selectedBus.value) {
        return;
    }
    const bus = newBuses.find((candidate) => String(candidate.bus) === String(selectedBus.value.bus));
    if (bus) {
        handleBusClick(bus, false);
    } else {
        clearRouteSelection();
    }
}

/**
 * Reselects the bus the user had selected when they left, with its fresh position
 * @param {import("../api/index").Bus[]} newBuses
 */
const restoreSelection = (newBuses) => {
    if (pendingRestore === null) {
        return;
    }
    const bus = newBuses.find((candidate) => String(candidate.bus) === String(pendingRestore));
    pendingRestore = null;
    if (bus) {
        handleBusClick(bus, false);
    }
}

// live: shared with the other pages, and refetched when the backend's next snapshot should be
// ready. Time travel: the positions at the picked time
const { buses: mapBuses } = useMapBuses(() => props.at);
watch(() => props.at, () => { timeChanged = true; });
watch(mapBuses, renderBuses);

const selectedTripId = computed(() => selectedBus.value?.trip ?? null);

// the same keys as the bus card's, so the card and the map share one request
const { data: trip } = useQuery({
    queryKey: computed(() => ['trip-shape', selectedTripId.value]),
    queryFn: () => getTrip(selectedTripId.value),
    enabled: computed(() => Boolean(selectedTripId.value)),
    staleTime: Infinity,
});

const { data: tripStops } = useQuery({
    queryKey: computed(() => ['trip-stop-times', selectedTripId.value]),
    queryFn: () => getBusStopTimes(selectedTripId.value),
    enabled: computed(() => Boolean(selectedTripId.value)),
    staleTime: Infinity,
});

// below this zoom there are too many stops on screen to tell apart, and the buses matter more
const MIN_STOP_ZOOM = 15;
// the stops aren't loaded until something needs them: zooming in (or locating), a bus's route or an open stop
const stopsWanted = ref(false);
const { stops, keyedStops } = useStops({
    enabled: () => stopsWanted.value || Boolean(selectedTripId.value) || Boolean(props.stopId),
});

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

/**
 * @param {import("../api/index").Bus} bus
 * @param {boolean} [fit] zoom to the bus's route once it loads
 */
const handleBusClick = (bus, fit = true) => {
    fitSelection = fit;
    emits("bus-details", bus);
    selectedBus.value = bus;
}

const clearRouteSelection = () => {
    selectedBus.value = null;
    routeFitted = false;
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
    const picked = selectedBus.value?.bus ?? props.highlightBusId;
    for (const marker of Object.values(buses)) {
        marker.getElement()?.classList.toggle(
            "bus-marker-icon--selected",
            picked !== null && picked !== undefined && String(marker.options.title) === String(picked),
        );
    }
}

// the trip watcher doesn't fire when the trip lookup fails or returns the same value
watch(selectedBus, applySelectedStyling);

// with a bus picked, only its route's buses stay on the map
const applyRouteHighlighting = () => {
    // the live bus knows its route, so this doesn't wait for (and flash while) its trip loads
    const selectedRouteId = selectedBus.value ? selectedBus.value.route_id ?? trip.value?.route_id ?? null : null;
    // with a stop open (and no bus), only the buses on their way to it
    const stopBuses = !selectedBus.value && props.stopBusIds && !props.at ? new Set(props.stopBusIds.map(String)) : null;
    for (const marker of Object.values(buses)) {
        const isSelected = marker.options.title === selectedBus.value?.bus;
        const onRoute = stopBuses
            ? stopBuses.has(String(marker.options.title))
            : !selectedRouteId || marker.options?.route_id === selectedRouteId;
        // hidden rather than faded, so they can't be tapped or focused either
        marker.getElement()?.classList.toggle("bus-marker-icon--hidden", !isSelected && !onRoute);
        marker.setZIndexOffset(isSelected ? 2000 : (selectedRouteId || stopBuses) && onRoute ? 1000 : 0);
    }
    applySelectedStyling();
}

watch([() => props.stopBusIds, () => props.highlightBusId, () => props.at], applyRouteHighlighting);

watch(trip, () => {
    if (!map) {
        return;
    }
    if (!trip.value || !selectedBus.value) {
        routePathPoints.length = 0;
        previousPolyline?.remove();
        previousPolyline = null;
        routeFitted = false;
        applyRouteHighlighting();
        return;
    }
    previousPolyline?.remove();
    routeFitted = false;
    const coordinates = trip.value.geometry_line?.coordinates || [];
    routePathPoints = coordinates.flatMap((segment) => segment.map(([a, b]) => [b, a]));
    if (!routePathPoints.length) {
        applyRouteHighlighting();
        return;
    }
    previousPolyline = L.polyline(routePathPoints, { pane: ROUTE_PANE }).addTo(homeLayer);
    previousPolyline.on("click", (event) => L.DomEvent.stopPropagation(event));
    if (fitSelection) {
        fitRoute();
    }
    applyRouteHighlighting();
})

// set while the map still shows the fitted route, so the fit can follow the sheet
// as it opens and grows; touching the map leaves it where the user put it
let routeFitted = false;
// Leaflet drops a zoom asked for mid-animation, so a fit waits for the last to land
let fitMoving = false;
let refitQueued = false;

/** px of the map's bottom the page's sheet covers */
const coveredBottom = () => {
    if (!map) {
        return 0;
    }
    const mapBox = map.getContainer().getBoundingClientRect();
    // the sheet sits at the bottom of the window, which can be below the map's bottom
    const covered = Math.max(0, props.bottomInset - (window.innerHeight - mapBox.bottom));
    // a sheet that takes most of the map still leaves room for the route above it
    return Math.min(covered, mapBox.height / 2);
}

const fitRoute = () => {
    if (!map || !previousPolyline) {
        return;
    }
    routeFitted = true;
    if (fitMoving) {
        refitQueued = true;
        return;
    }
    const bottom = coveredBottom();
    fitMoving = true;
    // before the fit, as a fit that doesn't animate ends straight away
    map.once("moveend", fitLanded);
    map.fitBounds(previousPolyline.getBounds(), { paddingBottomRight: [0, bottom] });
}

const fitLanded = () => {
    fitMoving = false;
    if (refitQueued) {
        refitQueued = false;
        if (routeFitted) {
            fitRoute();
        }
    }
}

const stopFollowingSheet = () => {
    routeFitted = false;
    stopFocused = false;
}

watch(() => props.bottomInset, () => {
    if (routeFitted) {
        fitRoute();
    }
    if (stopFocused) {
        focusStop(false);
    }
});

// --- stops: drawn once zoomed in, and the open one at any zoom ---
const STOP_STYLE = {
    radius: 5,
    color: "#000000",
    fillColor: "#ffffff",
    fillOpacity: 1,
    weight: 2,
};
const SELECTED_STOP_STYLE = {
    radius: 8,
    color: "#ffffff",
    fillColor: "#3f51b5",
    fillOpacity: 1,
    weight: 3,
};
const STOP_FOCUS_ZOOM = 16;

// stops closed, moved or detoured around by an alert in effect, ringed on the map
const serviceAlerts = useServiceAlerts();
const nowLocal = useNowLocal();
const disruptedStops = computed(() => stopsWithAlerts(serviceAlerts.value, nowLocal.value));

/** @type {import('leaflet').LayerGroup | null} */
let stopLayer = null;
/** @type {import('leaflet').Canvas | null} thousands of stops are too slow as svg elements */
let stopRenderer = null;

const stopPoints = computed(() =>
    (stops.value ?? [])
        .filter((stop) => !stop.location_type || stop.location_type === "0")
        .map((stop) => ({ stop, lat: Number(stop.stop_lat), lon: Number(stop.stop_lon) }))
        .filter(({ lat, lon }) => Number.isFinite(lat) && Number.isFinite(lon)),
);

/**
 * @param {{lat: number, lon: number, stop: import("../api/index").BusStop}} point
 * @param {object} style
 */
const addStopMarker = (point, style) => {
    const effect = disruptedStops.value.get(point.stop.stop_id);
    if (effect) {
        stopLayer.addLayer(L.circleMarker([point.lat, point.lon], { ...DISRUPTION_RING_STYLE, radius: style.radius + 4, renderer: stopRenderer }));
    }
    const marker = L.circleMarker([point.lat, point.lon], { ...style, renderer: stopRenderer });
    marker.on("click", (event) => {
        L.DomEvent.stopPropagation(event);
        emits("stop-click", point.stop);
    });
    marker.bindTooltip(effect ? `${point.stop.stop_name} • ${effectLabel(effect)}` : point.stop.stop_name);
    stopLayer.addLayer(marker);
}

const drawStops = () => {
    if (!map || !stopLayer) {
        return;
    }
    stopLayer.clearLayers();
    const zoomedIn = map.getZoom() >= MIN_STOP_ZOOM;
    if (zoomedIn) {
        stopsWanted.value = true;
    }
    let selected = null;
    // a picked bus shows its own route's stops instead
    const showAll = zoomedIn && !selectedBus.value;
    const bounds = map.getBounds().pad(0.2);
    for (const point of stopPoints.value) {
        if (point.stop.stop_id === props.stopId) {
            selected = point;
        } else if (showAll && bounds.contains([point.lat, point.lon])) {
            addStopMarker(point, STOP_STYLE);
        }
    }
    // drawn last so it sits on top of its neighbours
    if (selected) {
        addStopMarker(selected, SELECTED_STOP_STYLE);
    }
}

watch([stopPoints, () => props.stopId, disruptedStops, selectedBus], drawStops);

const selectedStop = computed(() => (props.stopId ? keyedStops.value[props.stopId] ?? null : null));

// set while the map is still centred on the open stop, so it follows the sheet as it opens
let stopFocused = false;
/** @type {string | null} the stop or station the map last centred on */
let focusedKey = null;
// going back to a stop returns to the view the user left, rather than re-centring
let keepRememberedView = navigatingByHistory && Boolean(rememberedHomeView);
// the first centring jumps, so a stop opened from a link doesn't start with a flight across the city
let hasFocused = false;
let focusMoving = false;
let refocusQueued = false;

/**
 * Centres the map on a point, in the part above the page's sheet
 * @param {import('leaflet').LatLngExpression} latlng
 * @param {number} zoom
 * @param {boolean} animate
 */
const centreAboveSheet = (latlng, zoom, animate) => {
    const target = map.unproject(map.project(latlng, zoom).add([0, coveredBottom() / 2]), zoom);
    if (animate && !prefersReducedMotion()) {
        focusMoving = true;
        map.once("moveend", focusLanded);
        map.flyTo(target, zoom, { duration: FLY_DURATION_SECONDS });
    } else {
        map.setView(target, zoom);
    }
}

const focusLanded = () => {
    focusMoving = false;
    if (refocusQueued) {
        refocusQueued = false;
        if (stopFocused) {
            focusStop(false);
        }
    }
}

/**
 * Centres on the open stop, or the middle of its station, so switching between an
 * LRT station's platforms doesn't nudge the map
 * @param {boolean} animate
 */
const focusStop = (animate) => {
    const stop = selectedStop.value;
    if (!map || !stop) {
        return;
    }
    if (focusMoving) {
        refocusQueued = true;
        return;
    }
    const place = (stop.parent_station && keyedStops.value[stop.parent_station]) || stop;
    const lat = Number(place.stop_lat);
    const lon = Number(place.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        return;
    }
    stopFocused = true;
    centreAboveSheet([lat, lon], Math.max(map.getZoom(), STOP_FOCUS_ZOOM), animate);
}

const onStopChange = () => {
    const stop = selectedStop.value;
    if (!stop) {
        focusedKey = null;
        stopFocused = false;
        return;
    }
    const key = stop.parent_station ? `station:${stop.parent_station}` : `stop:${stop.stop_id}`;
    if (!map || key === focusedKey) {
        return;
    }
    focusedKey = key;
    if (keepRememberedView) {
        keepRememberedView = false;
        return;
    }
    focusStop(hasFocused);
    hasFocused = true;
}

watch(selectedStop, onStopChange);

/**
 * Brings a point into view above the sheet, e.g. a bus picked in the stop's panel
 * @param {number} lat
 * @param {number} lng
 */
const showPoint = (lat, lng) => {
    if (!map) {
        return;
    }
    stopFocused = false;
    centreAboveSheet([lat, lng], Math.max(map.getZoom(), STOP_FOCUS_ZOOM), true);
}

/** @type {import("leaflet").Marker[]} */
let stopMarkers = [];

watch(tripStops, () => {
    if (!map || !tripStops.value || !selectedBus.value) {
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
        ).addTo(homeLayer);
        marker.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            emits("stop-click", stopDetails);
        });
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
            }).addTo(homeLayer);
            stopFocused = false;
            map.setView(latlng, STOP_FOCUS_ZOOM);
        },
        () => {
            showLocationError.value = true;
            locating.value = false;
        },
    );
}

const onMapClick = () => {
    clearRouteSelection();
    emits("map-click");
}

const releaseMap = () => {
    map?.off("click", onMapClick);
    map?.off("moveend", landedHome);
    map?.off("moveend", fitLanded);
    map?.off("moveend", focusLanded);
    map?.off("moveend", drawStops);
    fitMoving = false;
    refitQueued = false;
    focusMoving = false;
    refocusQueued = false;
    stopRenderer?.remove();
    stopRenderer = null;
    stopLayer = null;
    map?.getContainer().removeEventListener("pointerdown", stopFollowingSheet);
    map?.getContainer().removeEventListener("wheel", stopFollowingSheet);
    homeLayer?.remove();
    homeLayer = null;
    userMarker = null;
    map = null;
}

const landedHome = () => {
    flyingHome = null;
}

const mapElement = ref(null);

const createMap = () => {
    const attached = attachSharedMap(mapElement.value, releaseMap);
    map = attached.map;
    mapToken = attached.token;
    // full screen, so one finger and the scroll wheel move the map (the route, trip and bus pages change this)
    map.twoFingerPan.disable();
    map.ctrlScrollZoom.disable();
    homeLayer = L.layerGroup().addTo(map);
    stopRenderer = L.canvas({ padding: 0.2, tolerance: 6 });
    stopLayer = L.layerGroup().addTo(homeLayer);
    map.on("click", onMapClick);
    map.on("moveend", drawStops);
    map.getContainer().addEventListener("pointerdown", stopFollowingSheet);
    map.getContainer().addEventListener("wheel", stopFollowingSheet, { passive: true });
    // back to where the user was, or the whole city the first time
    const center = rememberedHomeView?.center ?? HOME_CENTER;
    const zoom = rememberedHomeView?.zoom ?? HOME_ZOOM;
    if (attached.handedOver && !prefersReducedMotion()) {
        flyingHome = { center, zoom };
        map.flyTo(center, zoom, { duration: FLY_DURATION_SECONDS });
        map.once("moveend", landedHome);
    } else {
        map.setView(center, zoom);
    }
}

onMounted(() => {
    createMap();
    // a cached snapshot from an earlier visit shows straight away
    renderBuses(mapBuses.value);
    drawStops();
    onStopChange();
})

onBeforeUnmount(() => {
    if (map) {
        // leaving mid-flight keeps where it was heading, not where it got to
        rememberHomeView({
            center: flyingHome?.center ?? map.getCenter(),
            zoom: flyingHome?.zoom ?? map.getZoom(),
            busId: selectedBus.value?.bus ?? null,
        });
    }
    releaseMap();
    detachSharedMap(mapToken);
})

// so the page can close the selection too, e.g. when the bottom sheet is swiped away
defineExpose({ clearSelection: clearRouteSelection, showPoint });
</script>
<template>
  <div class="map-wrapper">
    <div ref="mapElement" class="map" />
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
    position: relative;
    /* keeps leaflet's panes underneath the app bar and navigation drawer */
    z-index: 0;
}

.map :deep(.shared-map) {
    height: 100%;
    width: 100%;
}

.locate-button {
    bottom: 24px;
    position: absolute;
    right: 12px;
    z-index: 1;
}
</style>
