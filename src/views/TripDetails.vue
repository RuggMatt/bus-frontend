<script setup>
// @ts-check
import { useQuery } from '@tanstack/vue-query';
import { getRecentTripData, getTrip, getBusStopTimes, getStopRoutes } from '../api';
import { useStops } from '../composables/useStops';
import { useRoutes } from '../composables/useRoutes';
import { edmontonNow, scheduledSecondsNear } from '../utils/serviceTime';
import { LOCAL_AGENCY } from '../utils/routes';
import { formatScheduledTime, scheduleStatus } from '../utils/busStatus';
import RouteBadge from '../components/RouteBadge.vue';
import TransitMap from '../components/TransitMap.vue';
import { tripPath } from '../composables/useStopArrivals';
import { computed, ref } from 'vue';

/** @typedef {import('../api/index').BusStopTime} BusStopTime */


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
    return stops[0] ? formatScheduledTime(stops[0].arrival_time) : '';
});
const endTime = computed(() => {
    const stops = routeData.value ?? [];
    return stops.length > 0 ? formatScheduledTime(stops[stops.length - 1]?.arrival_time ?? '') : '';
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
 * @param {number | null} estimatedEpoch
 * @returns {number|null}
 */
function getTimeDiffMinutes(stop, estimatedEpoch) {
    if (estimatedEpoch === null) return null;
    if (!stop.arrival_time) return null;
    // compare in Edmonton time, as the viewer's midnight can be hours off the schedule's
    const estimatedSeconds = edmontonNow(new Date(estimatedEpoch * 1000)).secondsSinceMidnight;
    const scheduledSeconds = scheduledSecondsNear(stop.arrival_time, estimatedSeconds);
    return Math.round((estimatedSeconds - scheduledSeconds) / 60);
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

// the canvas needs hex, so these mirror the theme colours scheduleStatus picks
/** @type {Record<string, string>} */
const STATUS_HEX = { success: '#4caf50', warning: '#fb8c00', info: '#2196f3' };
const NO_ESTIMATE_HEX = '#999999';

// worked out once per stop, as the estimate scans the trip's recorded positions
const stopRows = computed(() =>
    (routeData.value ?? []).map((stop) => {
        const stopInfo = keyedStops.value?.[stop.stop_id];
        const estimatedEpoch = estimatedActualArrivalTime(stop.stop_id);
        const diff = getTimeDiffMinutes(stop, estimatedEpoch);
        return {
            stop,
            stopInfo,
            name: stopInfo?.stop_name || stop.stop_id,
            code: stopInfo?.stop_code || stop.stop_id,
            scheduled: formatScheduledTime(stop.arrival_time),
            estimated: convertUnixEpochToTime(estimatedEpoch),
            status: diff === null ? null : scheduleStatus(diff),
        };
    }),
);

const mapStops = computed(() =>
    stopRows.value.flatMap(({ stop, stopInfo, name, scheduled, status }) => {
        const lat = Number(stopInfo?.stop_lat);
        const lon = Number(stopInfo?.stop_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        return [{
            stop_id: stop.stop_id,
            stop_name: name,
            lat,
            lon,
            color: status ? STATUS_HEX[status.color] ?? NO_ESTIMATE_HEX : NO_ESTIMATE_HEX,
            tooltip: `${name} • ${scheduled} • ${status?.label ?? 'No live estimate'}`,
        }];
    }),
);

const mapBuses = computed(() => (latestTripPoint.value ? [latestTripPoint.value] : []));

const mapPaths = computed(() => {
    const path = tripPath(tripData.value);
    return path.length ? [path] : [];
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
      <router-link
        v-if="tripData?.route_id"
        :to="{ path: `/routes/${tripData.route_id}`, query: { direction: tripData.direction_id } }"
        class="route-header d-flex align-center pa-2"
      >
        <RouteBadge :route-id="tripData.route_id" size="large" />
        <h1 class="text-headline-small ml-3 min-width-0">
          {{ keyedroutes[tripData.route_id]?.route_long_name }}
        </h1>
        <v-icon icon="mdi-chevron-right" class="ml-auto pl-2" />
      </router-link>
      <div class="text-body-medium text-medium-emphasis px-2">
        <div>
          {{ tripData?.trip_headsign }}<span v-if="weekdayLabel"> &middot; {{ weekdayLabel }}</span><span v-if="startTime && endTime"> &middot; {{ startTime }} &ndash; {{ endTime }}</span>
        </div>
        <div class="text-body-small">
          Trip {{ tripId }}
        </div>
      </div>
      <TransitMap
        :stops="mapStops"
        :buses="mapBuses"
        :paths="mapPaths"
        :fit-key="tripId"
        class="trip-map mt-3"
      />
      <v-card v-if="stopRows.length" variant="outlined" class="mt-3">
        <template v-for="(row, index) in stopRows" :key="row.stop.stop_sequence">
          <v-divider v-if="index > 0" />
          <div
            v-ripple
            class="stop-row d-flex align-center pa-3"
            :class="{ 'stop-row--expanded': expandedSequence === row.stop.stop_sequence }"
            role="button"
            tabindex="0"
            :aria-expanded="expandedSequence === row.stop.stop_sequence"
            @click="toggleStop(row.stop)"
            @keydown.enter.prevent="toggleStop(row.stop)"
            @keydown.space.prevent="toggleStop(row.stop)"
          >
            <div class="flex-grow-1 min-width-0">
              <div class="text-body-large">
                {{ row.name }}
              </div>
              <div class="text-body-small text-medium-emphasis">
                Stop {{ row.code }}
              </div>
            </div>
            <div class="text-right flex-shrink-0 ml-2">
              <div class="text-title-medium">
                {{ row.scheduled }}
              </div>
              <template v-if="row.status">
                <div v-if="row.estimated" class="text-body-small text-medium-emphasis">
                  Actual &asymp; {{ row.estimated }}
                </div>
                <v-chip :color="row.status.color" size="x-small" variant="tonal">
                  {{ row.status.label }}
                </v-chip>
              </template>
            </div>
            <v-icon
              :icon="expandedSequence === row.stop.stop_sequence ? 'mdi-chevron-up' : 'mdi-chevron-down'"
              class="ml-2 flex-shrink-0"
            />
          </div>
          <v-expand-transition>
            <div v-if="expandedSequence === row.stop.stop_sequence" class="text-body-medium px-3 pb-3">
              <div>
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
                  <RouteBadge :route-id="route.route_id" size="small" class="mr-2" />
                  {{ route.route_long_name }}
                  <span v-if="route.agency_name && route.agency_name !== LOCAL_AGENCY" class="text-medium-emphasis ml-1">
                    &middot; {{ route.agency_name }}
                  </span>
                </v-chip>
              </div>
              <v-btn
                :to="`/stops/${encodeURIComponent(row.stop.stop_id)}`"
                block
                variant="tonal"
                color="primary"
                class="mt-2"
              >
                Stop details
              </v-btn>
            </div>
          </v-expand-transition>
        </template>
      </v-card>
    </div>
  </v-container>
</template>

<style scoped>
.route-header {
    border-radius: 4px;
    color: inherit;
    text-decoration: none;
}

.route-header:hover,
.stop-row:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.min-width-0 {
    min-width: 0;
}

.stop-row {
    cursor: pointer;
}

.stop-row--expanded {
    background: rgba(var(--v-theme-primary), 0.08);
}

.trip-map {
    --transit-map-height: max(45vh, 300px);
}

@media (prefers-reduced-motion: reduce) {
    .expand-transition-enter-active,
    .expand-transition-leave-active {
        transition: none !important;
    }
}
</style>
