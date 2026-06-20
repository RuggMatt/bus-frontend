<script setup>
// @ts-check
import { useQuery } from '@tanstack/vue-query';
import { getRecentTripData, getTrip, getBusStopTimes } from '../api';
import { useStops } from '../composables/useStops';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import 'leaflet/dist/leaflet';
import 'leaflet';

/** @typedef {import('../api/index').BusStopTime} BusStopTime */


const mapboxAccessToken = `access_token=${import.meta.env.VITE_APP_MAPBOX_ACCESS_TOKEN}`;
const ACTIVE_TRIP_STALE_SECONDS = 300;

/**
 * @param {Array<{timestamp:number}> | undefined} tripPoints
 * @returns {boolean}
 */
function isTripCurrentlyActive(tripPoints) {
    if (!tripPoints || tripPoints.length === 0) return false;
    const latestTimestamp = tripPoints.reduce(
        (max, point) => Math.max(max, point.timestamp),
        0,
    );
    const nowSeconds = Date.now() / 1000;
    return nowSeconds - latestTimestamp <= ACTIVE_TRIP_STALE_SECONDS;
}

const props = defineProps({
    tripId: {
        type: [String, Number],
        required: true,
    }
})

const { keyedStops } = useStops();

const { data, error, isLoading } = useQuery({
    queryKey: ['trip', props.tripId],
    queryFn: () => getRecentTripData(props.tripId),
    enabled: !!props.tripId,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
        const tripPoints = /** @type {Array<{timestamp:number}> | undefined} */ (query.state.data);
        return isTripCurrentlyActive(tripPoints) ? 60000 : false;
    },
    refetchIntervalInBackground: true,
})

const { data: tripData } = useQuery({
    queryKey: ['trip-data', props.tripId],
    queryFn: () => getTrip(props.tripId),
    enabled: !!props.tripId,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
})

// route data is a list of stops along this trip
const { data: routeData } = useQuery({
    queryKey: ['route-data', props.tripId],
    queryFn: () => getBusStopTimes(props.tripId),
    enabled: () => !!props.tripId,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
})

const groupedTripData = computed(() => {
    if (!data.value) return [];
    /** @type {typeof data.value[number][][]} */
    const groups = [];
    // Group data points by 30-minute gaps in timestamp
    /** @type {Array<typeof data.value[number]>} */
    let currentGroup = [];
    let lastTimestamp = null;
    for (const datum of data.value) {
        if (
            lastTimestamp === null ||
            Math.abs(datum.timestamp - lastTimestamp) > 1800 // 30 minutes in seconds
        ) {
            if (currentGroup.length > 0) {
                groups.push(currentGroup);
            }
            currentGroup = [datum];
        } else {
            currentGroup.push(datum);
        }
        lastTimestamp = datum.timestamp;
    }
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    return groups;
})

const latestTripPoint = computed(() => {
    if (!data.value || data.value.length === 0) return null;
    return data.value.reduce((latest, datum) => {
        if (!latest) return datum;
        return datum.timestamp >= latest.timestamp ? datum : latest;
    }, /** @type {typeof data.value[number] | null} */ (null));
})

/**
 * Converts a HH:MM:SS 24-hour time string to a readable 12-hour format (e.g. "7:32 PM")
 * @param {string} time
 * @returns {string}
 */
function formatTime(time) {
    if (!time) return ''
    const [hourStr, minuteStr] = time.split(':')
    let hour = parseInt(hourStr ?? '0', 10)
    const minute = minuteStr ?? '00'
    const ampm = hour >= 12 ? 'PM' : 'AM'
    hour = hour % 12 || 12
    return `${hour}:${minute} ${ampm}`
}

/**
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 */
const distance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
}

/**
 * Estimates the actual arrival time for a given stop.
 * @param {string} stopId
 * @returns {number | null} Unix epoch time in seconds
 */
function estimatedActualArrivalTime(stopId) {
    const stop = keyedStops.value?.[stopId];
    if (!stop) {
        return null;
    }
    if (!data.value || data.value.length === 0) {
        return null;
    }
    const groupedData = groupedTripData.value?.slice(-1)[0];
    if (!groupedData || groupedData.length === 0) {
        return null;
    }
    const stopLat = Number(stop.stop_lat);
    const stopLon = Number(stop.stop_lon);
    if (!Number.isFinite(stopLat) || !Number.isFinite(stopLon)) {
        return null;
    }
    const firstDatum = groupedData[0];
    if (!firstDatum) {
        return null;
    }
    const maxEstimateDistance = 1000; // meters
    let nearestData = firstDatum;
    let nearestDistance = distance(stopLat, stopLon, Number(nearestData.lat), Number(nearestData.long));
    for (const datum of groupedData) {
        const datumLat = Number(datum.lat);
        const datumLon = Number(datum.long);
        if (!Number.isFinite(datumLat) || !Number.isFinite(datumLon)) {
            continue;
        }
        const datumDistance = distance(stopLat, stopLon, datumLat, datumLon);
        if (datumDistance < nearestDistance) {
            nearestData = datum;
            nearestDistance = datumDistance;
        }
    }
    if (nearestDistance > maxEstimateDistance) {
        return null;
    }
    return nearestData.timestamp;
}

/**
 * @param {BusStopTime} stop
 * @returns {string}
 */
function formatSubtitle(stop) {
    const scheduledTime = formatTime(stop.arrival_time_fixed);
    const estimatedActualTime = convertUnixEpochToTime(estimatedActualArrivalTime(stop.stop_id));
    if (estimatedActualTime === null) {
        return scheduledTime;
    }
    return `${scheduledTime} (Estimated Actual: ${estimatedActualTime || 'N/A'})`;
}

/**
 * @param {number|null} unixEpoch
 * @returns {string|null}
 */
function convertUnixEpochToTime(unixEpoch) {
    if (!unixEpoch) return null;
    const date = new Date(unixEpoch * 1000);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

const startTime = computed(() => {
    const stops = routeData.value ?? [];
    return formatTime(stops[0]?.arrival_time_fixed ?? '');
});
const endTime = computed(() => {
    const stops = routeData.value ?? [];
    return formatTime(stops.length > 0 ? (stops[stops.length - 1]?.arrival_time_fixed ?? '') : '');
});

const weekdayLabel = computed(() => {
    const id = tripData.value?.service_id ?? '';
    if (/\b(weekday|mon(day)?|tue(s(day)?)?|wed(nesday)?|thu(rs(day)?)?|fri(day)?|wd)\b/i.test(id)) return 'Weekday';
    if (/\b(sat(urday)?)\b/i.test(id)) return 'Saturday';
    if (/\b(sun(day)?)\b/i.test(id)) return 'Sunday';
    return id;
});

/**
 * Returns the difference in minutes between estimated and scheduled arrival.
 * Negative = early, positive = late, 0 = on time.
 * @param {BusStopTime} stop
 * @returns {number|null}
 */
function getTimeDiffMinutes(stop) {
    const estimatedEpoch = estimatedActualArrivalTime(stop.stop_id);
    if (estimatedEpoch === null) return null;
    if (!stop.arrival_time_fixed) return null;
    const parts = stop.arrival_time_fixed.split(':');
    const scheduledSecondsFromMidnight =
        parseInt(parts[0] || '0', 10) * 3600 +
        parseInt(parts[1] || '0', 10) * 60 +
        parseInt(parts[2] || '0', 10);
    const estimatedDate = new Date(estimatedEpoch * 1000);
    const midnight = new Date(estimatedDate);
    midnight.setHours(0, 0, 0, 0);
    const scheduledEpoch = midnight.getTime() / 1000 + scheduledSecondsFromMidnight;
    return Math.round((estimatedEpoch - scheduledEpoch) / 60);
}

/**
 * @param {BusStopTime} stop
 * @returns {boolean}
 */
function hasTimeDiff(stop) {
    return getTimeDiffMinutes(stop) !== null;
}

/**
 * @param {BusStopTime} stop
 * @returns {number}
 */
function getTimeDiffValue(stop) {
    return getTimeDiffMinutes(stop) ?? 0;
}

/** @type {import('leaflet').Map | null} */
let map = null;
/** @type {import('leaflet').CircleMarker[]} */
let stopMarkers = [];
/** @type {import('leaflet').Polyline | null} */
let routePolyline = null;
/** @type {import('leaflet').Marker | null} */
let busMarker = null;
const tripMapEl = ref(null);

const busMarkerIcon = L.divIcon({
    className: 'trip-bus-marker-icon',
    html: '<div class="trip-bus-marker-badge">🚌</div>',
    iconSize: [28, 28],
    iconAnchor: [14, 14],
});

/**
 * @param {BusStopTime} stop
 * @returns {string}
 */
function getStopMarkerColor(stop) {
    const diff = getTimeDiffMinutes(stop);
    if (diff === null) return '#999999';
    if (diff === 0) return '#0000f2';
    if (diff > 0) return '#f20000'; // late
    return '#19d276'; // early
}

/**
 * @param {BusStopTime} stop
 * @returns {string}
 */
function getStopStatusLabel(stop) {
    const diff = getTimeDiffMinutes(stop);
    if (diff === null) return 'No live estimate';
    if (diff > 0) return `${diff} min late`;
    if (diff < 0) return `${Math.abs(diff)} min early`;
    return 'On time';
}

function clearTripMapLayers() {
    for (const marker of stopMarkers) {
        marker.remove();
    }
    stopMarkers = [];
    routePolyline?.remove();
    routePolyline = null;
    busMarker?.remove();
    busMarker = null;
}

function drawTripMap() {
    const activeMap = map;
    if (!activeMap) return;
    clearTripMapLayers();

    /** @type {[number, number][]} */
    const boundsPoints = [];
    const coordinates = tripData.value?.geometry_line?.coordinates || [];
    const routePathPoints = coordinates.flatMap((segment) =>
        segment.map(([lon, lat]) => /** @type {[number, number]} */ ([lat, lon])),
    );
    if (routePathPoints.length > 1) {
        routePolyline = L.polyline(routePathPoints, {
            color: '#263238',
            opacity: 0.85,
            weight: 4,
        }).addTo(activeMap);
        boundsPoints.push(...routePathPoints);
    }

    if (routeData.value && keyedStops.value) {
        for (const stop of routeData.value) {
            const stopInfo = keyedStops.value?.[stop.stop_id];
            const lat = Number(stopInfo?.stop_lat);
            const lon = Number(stopInfo?.stop_lon);
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
                continue;
            }
            const color = getStopMarkerColor(stop);
            const marker = L.circleMarker([lat, lon], {
                radius: 6,
                color,
                fillColor: color,
                fillOpacity: 0.95,
                weight: 2,
            }).addTo(activeMap);
            marker.bindTooltip(
                `${stopInfo?.stop_name || stop.stop_id} • ${formatTime(stop.arrival_time_fixed)} • ${getStopStatusLabel(stop)}`,
            );
            stopMarkers.push(marker);
            boundsPoints.push([lat, lon]);
        }
    }

    const currentPoint = latestTripPoint.value;
    if (currentPoint) {
        const currentLat = Number(currentPoint.lat);
        const currentLon = Number(currentPoint.long);
        if (Number.isFinite(currentLat) && Number.isFinite(currentLon)) {
            busMarker = L.marker([currentLat, currentLon], {
                icon: busMarkerIcon,
                title: `Bus ${currentPoint.bus}`,
            }).addTo(activeMap);
            busMarker.bindTooltip(`Current position: Bus ${currentPoint.bus}`);
            boundsPoints.push([currentLat, currentLon]);
        }
    }

    if (boundsPoints.length > 0) {
        activeMap.fitBounds(boundsPoints, { padding: [20, 20] });
    }
}

onMounted(() => {
    maybeInitializeMap();
});

function maybeInitializeMap() {
    if (map || !tripMapEl.value) {
        return;
    }
    if (!mapboxAccessToken) {
        console.error('Missing Mapbox access token. Set VITE_APP_MAPBOX_ACCESS_TOKEN in .env');
    }
    const createdMap = L.map(tripMapEl.value, {
        center: [53.5150, -113.4757],
        zoom: 12,
    });
    map = createdMap;
    L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?{accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        minZoom: 10,
        bounds: [[53.6, -113.7], [53.33, -113.3]],
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: mapboxAccessToken,
    }).addTo(createdMap);
}

watch([isLoading, error], async () => {
    if (isLoading.value || error.value) {
        return;
    }
    await nextTick();
    maybeInitializeMap();
    map?.invalidateSize();
    drawTripMap();
}, { immediate: true });

watch([routeData, keyedStops, tripData, data], () => {
    drawTripMap();
});

onBeforeUnmount(() => {
    clearTripMapLayers();
    map?.remove();
    map = null;
});


</script>
<template>
  <v-container>
    <div v-if="isLoading">
      Loading...
    </div>
    <div v-else-if="error">
      Error: {{ error.message }}
    </div>
    <div v-else>
      <h1>{{ tripData?.trip_headsign }} &mdash; {{ weekdayLabel }}<span v-if="startTime && endTime">, {{ startTime }} &ndash; {{ endTime }}</span></h1>
      <div ref="tripMapEl" class="trip-map mt-3" />
      <v-list class="mt-3">
        <v-list-item
          v-for="stop in routeData"
          :key="stop.stop_id"
          :title="keyedStops[stop.stop_id]?.stop_name || stop.stop_id"
          prepend-icon="mdi-bus-stop"
        >
          <template #subtitle>
            {{ formatSubtitle(stop) }}
            <template v-if="hasTimeDiff(stop)">
              <span v-if="getTimeDiffValue(stop) < 0" class="text-success ml-1">{{ Math.abs(getTimeDiffValue(stop)) }} min early</span>
              <span v-else-if="getTimeDiffValue(stop) > 0" class="text-error ml-1">{{ getTimeDiffValue(stop) }} min late</span>
              <span v-else class="text-info ml-1">On Time</span>
            </template>
          </template>
        </v-list-item>
      </v-list>
    </div>
  </v-container>
</template>

<style scoped>
.trip-map {
    width: 100%;
    height: 45vh;
    min-height: 300px;
    border-radius: 8px;
    overflow: hidden;
}

:deep(.trip-bus-marker-icon) {
    background: transparent;
    border: 0;
}

:deep(.trip-bus-marker-badge) {
    align-items: center;
    background: #ffffff;
    border: 2px solid #000000;
    border-radius: 9999px;
    display: flex;
    font-size: 18px;
    height: 28px;
    justify-content: center;
    width: 28px;
}
</style>