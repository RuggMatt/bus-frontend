<script setup>
// @ts-check
import { useQuery } from '@tanstack/vue-query';
import { getRecentTripData, getTrip, getBusStopTimes, getStopRoutes } from '../api';
import { useStops } from '../composables/useStops';
import { useRoutes } from '../composables/useRoutes';
import { edmontonNow, scheduledSecondsNear } from '../utils/serviceTime';
import { LOCAL_AGENCY, routeNumber } from '../utils/routes';
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
const { keyedroutes } = useRoutes();

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
    // schedules are in Edmonton time, so show estimates the same way wherever the viewer is
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'America/Edmonton' });
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
    if (!stop.arrival_time) return null;
    // compare in Edmonton time, as the viewer's midnight can be hours off the schedule's
    const estimatedSeconds = edmontonNow(new Date(estimatedEpoch * 1000)).secondsSinceMidnight;
    const scheduledSeconds = scheduledSecondsNear(stop.arrival_time, estimatedSeconds);
    return Math.round((estimatedSeconds - scheduledSeconds) / 60);
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

// a loop can visit the same stop twice, so rows are told apart by their sequence
/** @type {import('vue').Ref<string | null>} */
const expandedSequence = ref(null);

const expandedStopId = computed(
    () => routeData.value?.find((stop) => stop.stop_sequence === expandedSequence.value)?.stop_id ?? null,
);

/** @param {BusStopTime} stop */
function toggleStop(stop) {
    expandedSequence.value = expandedSequence.value === stop.stop_sequence ? null : stop.stop_sequence;
}

const { data: stopRoutes, isLoading: stopRoutesLoading, isError: stopRoutesError } = useQuery({
    queryKey: computed(() => ['stop-routes', expandedStopId.value]),
    queryFn: () => getStopRoutes(/** @type {string} */ (expandedStopId.value)),
    enabled: () => !!expandedStopId.value,
    staleTime: Infinity,
});

const otherRoutes = computed(() =>
    (stopRoutes.value ?? []).filter((route) => route.route_id !== tripData.value?.route_id),
);

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
      <v-btn
        v-if="tripData?.route_id"
        :to="`/routes/${tripData.route_id}`"
        variant="tonal"
        color="primary"
        prepend-icon="mdi-bus"
        append-icon="mdi-chevron-right"
        class="route-link mt-2"
      >
        <span class="text-truncate">
          Route {{ routeNumber(tripData.route_id) }}<template v-if="keyedroutes[tripData.route_id]">&nbsp;&middot; {{ keyedroutes[tripData.route_id].route_long_name }}</template>
        </span>
      </v-btn>
      <div ref="tripMapEl" class="trip-map mt-3" />
      <v-list class="mt-3">
        <v-list-item
          v-for="stop in routeData"
          :key="stop.stop_sequence"
          :title="keyedStops[stop.stop_id]?.stop_name || stop.stop_id"
          :active="expandedSequence === stop.stop_sequence"
          prepend-icon="mdi-bus-stop"
          @click="toggleStop(stop)"
        >
          <template #subtitle>
            {{ formatSubtitle(stop) }}
            <template v-if="hasTimeDiff(stop)">
              <span v-if="getTimeDiffValue(stop) < 0" class="text-success ml-1">{{ Math.abs(getTimeDiffValue(stop)) }} min early</span>
              <span v-else-if="getTimeDiffValue(stop) > 0" class="text-error ml-1">{{ getTimeDiffValue(stop) }} min late</span>
              <span v-else class="text-info ml-1">On Time</span>
            </template>
          </template>
          <template #append>
            <v-icon :icon="expandedSequence === stop.stop_sequence ? 'mdi-chevron-up' : 'mdi-chevron-down'" />
          </template>
          <v-expand-transition>
            <div v-if="expandedSequence === stop.stop_sequence" class="text-body-medium pt-2" @click.stop>
              <div class="text-medium-emphasis">
                Stop {{ keyedStops[stop.stop_id]?.stop_code || stop.stop_id }}
              </div>
              <div class="mt-2">
                Also served by
              </div>
              <v-progress-circular
                v-if="stopRoutesLoading"
                indeterminate
                size="20"
                width="2"
                class="mt-1"
              />
              <div v-else-if="stopRoutesError" class="text-error">
                Routes for this stop could not be loaded.
              </div>
              <div v-else-if="!otherRoutes.length" class="text-medium-emphasis">
                No other routes
              </div>
              <div v-else class="mt-1">
                <v-chip
                  v-for="route in otherRoutes"
                  :key="route.route_id"
                  :to="`/routes/${route.route_id}`"
                  size="small"
                  class="mr-2 mb-2"
                >
                  <b class="mr-1">{{ routeNumber(route.route_id) }}</b>
                  {{ route.route_long_name }}
                  <span v-if="route.agency_name && route.agency_name !== LOCAL_AGENCY" class="text-medium-emphasis ml-1">
                    &middot; {{ route.agency_name }}
                  </span>
                </v-chip>
              </div>
              <v-btn
                :to="`/stops/${encodeURIComponent(stop.stop_id)}`"
                block
                variant="tonal"
                color="primary"
                class="mt-2"
              >
                Stop details
              </v-btn>
            </div>
          </v-expand-transition>
        </v-list-item>
      </v-list>
    </div>
  </v-container>
</template>

<style scoped>
/* long route names truncate instead of pushing past the screen edge */
.route-link {
    max-width: 100%;
}

.route-link :deep(.v-btn__content) {
    min-width: 0;
}

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