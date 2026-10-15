<script setup>
import L from '../plugins/leaflet';
import { createBusIcon, refreshReportAges } from '../plugins/busIcon';
import { alongRouteMetres, distanceMetres, pathBetween } from '../utils/geo';
import { DISRUPTION_RING_STYLE, effectLabel } from '../utils/serviceAlerts';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
    stops: {
        type: Array,
        default: () => [],
    },
    selectedStopId: {
        type: String,
        default: null,
    },
    buses: {
        type: Array,
        default: () => [],
    },
    userLocation: {
        type: Object,
        default: null,
    },
    locating: {
        type: Boolean,
        default: false,
    },
    selectedBusId: {
        type: [Number, String],
        default: null,
    },
    // keeps the selected bus in view as its position updates
    following: {
        type: Boolean,
        default: false,
    },
    /** @type {import('vue').PropType<Map<string, string>>} stop id to the effect of a service alert in effect there */
    disruptedStops: {
        type: Map,
        default: () => new Map(),
    },
    /** @type {import('vue').PropType<{path: [number, number][], stops: {stop: object, lat: number, lon: number, label: string}[]} | null>} */
    tripRoute: {
        type: Object,
        default: null,
    },
});

const emits = defineEmits(["stop-click", "bus-click", "map-click", "move", "user-move", "stop-following", "locate"]);

// below this zoom there are too many stops on screen to tell apart
const MIN_STOP_ZOOM = 14;
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

const TRIP_STOP_STYLE = {
    radius: 5,
    color: "#3f51b5",
    fillColor: "#ffffff",
    fillOpacity: 1,
    weight: 3,
};
const ROUTE_LINE_STYLE = {
    color: "#3f51b5",
    opacity: 0.85,
    weight: 5,
};
const ROUTE_PANE_Z_INDEX = 350;

// how long a bus takes to glide to its newly reported position
const BUS_MOVE_DURATION_MS = 1500;
// further than this, a glide across the map would be more confusing than a jump
const MAX_ANIMATED_MOVE_METRES = 2000;
// how far a reported position can be from the route line and still count as on it
const MAX_ROUTE_OFFSET_METRES = 100;
// a route much longer than the straight line means the projection picked the wrong pass of a loop
const MAX_ROUTE_DETOUR = 3;

const mapElement = ref(null);
const showZoomHint = ref(false);

let map = null;
let stopRenderer = null;
let stopLayer = null;
let busLayer = null;
/** @type {Map<number | string, {marker: import('leaflet').Marker, bus: object, animationFrame: number | null}>} */
const busMarkers = new Map();
let routeLine = null;
let userMarker = null;
let resizeObserver = null;
let reportAgeInterval = null;
// leaflet's default scales with distance and runs well over a second across the city
const FLY_DURATION_SECONDS = 0.8;
// longer than any flight across the city takes
const PROGRAMMATIC_MOVE_TIMEOUT = 5000;
// set while the map is being moved by code rather than by the user
let movingProgrammatically = false;
let programmaticMoveTimeout = null;

const endProgrammaticMove = () => {
    movingProgrammatically = false;
    clearTimeout(programmaticMoveTimeout);
}

/**
 * Moves the map without it counting as the user panning or zooming
 * @param {() => void} move
 */
const moveProgrammatically = (move) => {
    // ending a move still in progress fires moveend, which would clear the flag below
    map.stop();
    movingProgrammatically = true;
    clearTimeout(programmaticMoveTimeout);
    // leaflet doesn't fire moveend when the move turns out to be a no-op
    programmaticMoveTimeout = setTimeout(endProgrammaticMove, PROGRAMMATIC_MOVE_TIMEOUT);
    move();
}

const handleMoveStart = () => {
    if (!movingProgrammatically) {
        emits("user-move");
    }
}

const stopPoints = computed(() =>
    props.stops
        .filter((stop) => !stop.location_type || stop.location_type === "0")
        .map((stop) => ({ stop, lat: Number(stop.stop_lat), lon: Number(stop.stop_lon) }))
        .filter(({ lat, lon }) => Number.isFinite(lat) && Number.isFinite(lon)),
);

/**
 * A ring around a stop a service alert names, drawn under the stop
 * @param {{lat: number, lon: number}} point
 * @param {string} stopId
 * @param {number} radius the stop's
 */
const addDisruptionRing = (point, stopId, radius) => {
    if (!props.disruptedStops.has(stopId)) return;
    stopLayer.addLayer(L.circleMarker([point.lat, point.lon], { ...DISRUPTION_RING_STYLE, radius: radius + 4, renderer: stopRenderer }));
};

/**
 * @param {string} name
 * @param {string} stopId
 */
const stopTooltip = (name, stopId) => {
    const effect = props.disruptedStops.get(stopId);
    return effect ? `${name} • ${effectLabel(effect)}` : name;
};

const drawStops = () => {
    if (!map) {
        return;
    }
    stopLayer.clearLayers();
    const zoomedIn = map.getZoom() >= MIN_STOP_ZOOM;
    showZoomHint.value = !zoomedIn;
    const bounds = map.getBounds().pad(0.2);
    const tripStops = props.tripRoute?.stops ?? [];
    const tripStopIds = new Set(tripStops.map(({ stop }) => stop.stop_id));
    let selected = null;
    for (const point of stopPoints.value) {
        if (point.stop.stop_id === props.selectedStopId) {
            selected = point;
            continue;
        }
        // drawn on the route line instead
        if (tripStopIds.has(point.stop.stop_id)) {
            continue;
        }
        if (!zoomedIn || !bounds.contains([point.lat, point.lon])) {
            continue;
        }
        addDisruptionRing(point, point.stop.stop_id, STOP_STYLE.radius);
        const marker = L.circleMarker([point.lat, point.lon], { ...STOP_STYLE, renderer: stopRenderer });
        marker.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            emits("stop-click", point.stop);
        });
        marker.bindTooltip(stopTooltip(point.stop.stop_name, point.stop.stop_id));
        stopLayer.addLayer(marker);
    }
    // the selected bus's stops are shown at every zoom, sitting on its route line
    for (const tripStop of tripStops) {
        if (tripStop.stop.stop_id === props.selectedStopId) {
            continue;
        }
        addDisruptionRing(tripStop, tripStop.stop.stop_id, TRIP_STOP_STYLE.radius);
        const marker = L.circleMarker([tripStop.lat, tripStop.lon], { ...TRIP_STOP_STYLE, renderer: stopRenderer });
        marker.on("click", (event) => {
            L.DomEvent.stopPropagation(event);
            emits("stop-click", tripStop.stop);
        });
        marker.bindTooltip(stopTooltip(tripStop.label, tripStop.stop.stop_id));
        stopLayer.addLayer(marker);
    }
    // drawn last so it sits on top of its neighbours
    if (selected) {
        addDisruptionRing(selected, selected.stop.stop_id, SELECTED_STOP_STYLE.radius);
        L.circleMarker([selected.lat, selected.lon], { ...SELECTED_STOP_STYLE, renderer: stopRenderer })
            .bindTooltip(stopTooltip(selected.stop.stop_name, selected.stop.stop_id))
            .addTo(stopLayer);
    }
}

const drawRoute = () => {
    if (!map) {
        return;
    }
    routeLine?.remove();
    routeLine = null;
    if (props.tripRoute?.path.length) {
        routeLine = L.polyline(props.tripRoute.path, { ...ROUTE_LINE_STYLE, pane: "routePane", interactive: false }).addTo(map);
    }
    drawStops();
}

/**
 * The way a bus got from one position to the next: along its route line when the
 * positions can be placed on it with confidence, otherwise straight across
 * @param {object} previousBus
 * @param {object} bus
 * @param {[number, number]} from
 * @param {[number, number]} to
 * @returns {[number, number][]}
 */
const routeTravelled = (previousBus, bus, from, to) => {
    const straight = [from, to];
    if (!bus.path?.length || previousBus.trip_id !== bus.trip_id) {
        return straight;
    }
    const start = alongRouteMetres(bus.path, from);
    const end = alongRouteMetres(bus.path, to);
    if (
        !start || !end ||
        start.offset > MAX_ROUTE_OFFSET_METRES || end.offset > MAX_ROUTE_OFFSET_METRES ||
        end.along <= start.along ||
        end.along - start.along > MAX_ROUTE_DETOUR * distanceMetres(from, to)
    ) {
        return straight;
    }
    const points = pathBetween(bus.path, start.along, end.along);
    return points.length >= 2 ? [from, ...points, to] : straight;
}

/**
 * Glides a marker along a line at a constant speed
 * @param {{marker: import('leaflet').Marker, animationFrame: number | null}} entry
 * @param {[number, number][]} points
 */
const animateAlong = (entry, points) => {
    const travelled = [0];
    for (let i = 1; i < points.length; i++) {
        travelled.push(travelled[i - 1] + distanceMetres(points[i - 1], points[i]));
    }
    const total = travelled[travelled.length - 1];
    const startedAt = performance.now();
    let segment = 1;
    const step = (time) => {
        const progress = Math.min(1, (time - startedAt) / BUS_MOVE_DURATION_MS);
        const distance = progress * total;
        while (segment < points.length - 1 && travelled[segment] < distance) {
            segment++;
        }
        const length = travelled[segment] - travelled[segment - 1];
        const t = length ? (distance - travelled[segment - 1]) / length : 1;
        const [fromLat, fromLon] = points[segment - 1];
        const [toLat, toLon] = points[segment];
        entry.marker.setLatLng([fromLat + t * (toLat - fromLat), fromLon + t * (toLon - fromLon)]);
        entry.animationFrame = progress < 1 ? requestAnimationFrame(step) : null;
    };
    entry.animationFrame = requestAnimationFrame(step);
}

/**
 * @param {{marker: import('leaflet').Marker, bus: object, animationFrame: number | null}} entry
 * @param {object} bus The bus's newly reported position
 */
const moveBusMarker = (entry, bus) => {
    cancelAnimationFrame(entry.animationFrame);
    entry.animationFrame = null;
    const current = entry.marker.getLatLng();
    const from = [current.lat, current.lng];
    const to = [bus.lat, bus.long];
    if (prefersReducedMotion() || distanceMetres(from, to) > MAX_ANIMATED_MOVE_METRES) {
        entry.marker.setLatLng(to);
        return;
    }
    animateAlong(entry, routeTravelled(entry.bus, bus, from, to));
}

/**
 * Keeps the followed bus in the middle of the map as it glides to a new position
 * @param {object} bus
 */
const centreOnMovingBus = (bus) => {
    if (prefersReducedMotion()) {
        moveProgrammatically(() => map.setView([bus.lat, bus.long], map.getZoom(), { animate: false }));
        return;
    }
    // a linear pan over the same time as the marker keeps the two in step
    moveProgrammatically(() => map.panTo([bus.lat, bus.long], {
        // leaflet otherwise jumps instead when the move is bigger than the map, e.g. on mobile
        animate: true,
        duration: BUS_MOVE_DURATION_MS / 1000,
        easeLinearity: 1,
    }));
}

const removeBusMarker = (id) => {
    const entry = busMarkers.get(id);
    cancelAnimationFrame(entry.animationFrame);
    entry.marker.remove();
    busMarkers.delete(id);
}

const drawBuses = () => {
    if (!map) {
        return;
    }
    const current = new Set();
    let movedSelected = null;
    for (const bus of props.buses) {
        current.add(bus.bus);
        const isSelected = bus.bus === props.selectedBusId;
        let entry = busMarkers.get(bus.bus);
        if (!entry) {
            const marker = L.marker([bus.lat, bus.long], {
                title: bus.bus,
                icon: createBusIcon(bus, { showAge: true }),
            }).addTo(busLayer);
            entry = { marker, bus, animationFrame: null };
            const created = entry;
            marker.on("click", (event) => {
                L.DomEvent.stopPropagation(event);
                emits("bus-click", created.bus);
            });
            busMarkers.set(bus.bus, entry);
        } else {
            if (entry.bus.lat !== bus.lat || entry.bus.long !== bus.long) {
                moveBusMarker(entry, bus);
                if (isSelected) {
                    movedSelected = bus;
                }
            }
            // picks up the new bearing and report time
            entry.marker.setIcon(createBusIcon(bus, { showAge: true }));
        }
        entry.bus = bus;
        entry.marker.setZIndexOffset(isSelected ? 1000 : 0);
        entry.marker.getElement()?.classList.toggle("bus-marker-icon--selected", isSelected);
    }
    for (const id of [...busMarkers.keys()]) {
        if (!current.has(id)) {
            removeBusMarker(id);
        }
    }
    // unless the map is still flying to the bus after it was picked
    if (props.following && movedSelected && !movingProgrammatically) {
        centreOnMovingBus(movedSelected);
    }
}

const drawUserLocation = () => {
    if (!map) {
        return;
    }
    userMarker?.remove();
    userMarker = null;
    if (!props.userLocation) {
        return;
    }
    userMarker = L.circleMarker([props.userLocation.lat, props.userLocation.lng], {
        radius: 8,
        color: "#ffffff",
        fillColor: "#1a73e8",
        fillOpacity: 1,
        weight: 3,
        interactive: false,
    }).addTo(map);
}

const emitMove = () => {
    const center = map.getCenter();
    emits("move", { lat: center.lat, lng: center.lng });
}

const createMap = () => {
    map = L.map(mapElement.value, {
        center: [53.5444, -113.4909],
        zoom: 15,
        // resizes are handled below, so they don't count as the user moving the map
        trackResize: false,
    });
    // thousands of stops are too slow as individual svg elements
    stopRenderer = L.canvas({ padding: 0.2, tolerance: 6 });
    map.createPane("routePane");
    map.getPane("routePane").style.zIndex = ROUTE_PANE_Z_INDEX;
    stopLayer = L.layerGroup().addTo(map);
    busLayer = L.layerGroup().addTo(map);
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
    map.on("click", () => emits("map-click"));
    map.on("movestart zoomstart", handleMoveStart);
    // a drag is always the user, even when it interrupts a move made by code
    map.on("dragstart", () => emits("user-move"));
    map.on("moveend", endProgrammaticMove);
    map.on("moveend", drawStops);
    map.on("moveend", emitMove);
}

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * @param {number} lat
 * @param {number} lng
 * @param {number} [minZoom] Zooms in to this level when the map is further out
 * @param {{animate?: boolean}} [options] animate: glide to the point rather than jumping
 */
const centerOn = (lat, lng, minZoom = MIN_STOP_ZOOM, { animate = true } = {}) => {
    if (!map) {
        return;
    }
    const zoom = Math.max(map.getZoom(), minZoom);
    moveProgrammatically(() => {
        if (animate && !prefersReducedMotion()) {
            map.flyTo([lat, lng], zoom, { duration: FLY_DURATION_SECONDS });
        } else {
            map.setView([lat, lng], zoom, { animate: false });
        }
    });
}

defineExpose({
    centerOn,
})

watch([stopPoints, () => props.selectedStopId, () => props.disruptedStops], drawStops);
watch([() => props.buses, () => props.selectedBusId, () => props.following], drawBuses);
watch(() => props.tripRoute, drawRoute);
watch(() => props.userLocation, drawUserLocation);

onMounted(() => {
    createMap();
    drawRoute();
    drawBuses();
    drawUserLocation();
    emitMove();
    // the map changes size when the details panel opens or the layout switches
    resizeObserver = new ResizeObserver(() => {
        if (map) {
            moveProgrammatically(() => map.invalidateSize());
        }
    });
    resizeObserver.observe(mapElement.value);
    reportAgeInterval = setInterval(() => refreshReportAges(mapElement.value), 1000);
})

onBeforeUnmount(() => {
    resizeObserver?.disconnect();
    for (const id of [...busMarkers.keys()]) {
        removeBusMarker(id);
    }
    clearInterval(reportAgeInterval);
    clearTimeout(programmaticMoveTimeout);
    map?.remove();
    map = null;
})
</script>
<template>
  <div class="stops-map">
    <div ref="mapElement" class="map" />
    <v-chip
      v-if="showZoomHint"
      class="zoom-hint"
      color="surface"
      variant="elevated"
      size="small"
    >
      Zoom in to see stops
    </v-chip>
    <v-chip
      v-if="following && selectedBusId !== null"
      class="follow-chip"
      color="primary"
      variant="elevated"
      prepend-icon="mdi-crosshairs-gps"
      closable
      @click:close="emits('stop-following')"
    >
      Following bus {{ selectedBusId }}
    </v-chip>
    <v-btn
      class="locate-button"
      icon="mdi-crosshairs-gps"
      size="small"
      elevation="2"
      aria-label="Show my location"
      :loading="locating"
      @click="emits('locate')"
    />
  </div>
</template>
<style scoped>
.stops-map {
    height: 100%;
    position: relative;
    width: 100%;
}

.map {
    height: 100%;
    width: 100%;
    /* keeps leaflet's panes underneath the app bar and navigation drawer */
    z-index: 0;
}

.zoom-hint,
.follow-chip {
    bottom: 24px;
    left: 50%;
    position: absolute;
    transform: translateX(-50%);
    z-index: 1;
}

.locate-button {
    bottom: 24px;
    position: absolute;
    right: 12px;
    z-index: 1;
}
</style>
