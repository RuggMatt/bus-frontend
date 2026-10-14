<script setup>
// @ts-check
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { getBus, getBusRecentTrips, getBusStopTimes, getTrip, getTripSummaries } from '../api';
import { useRoutes } from '../composables/useRoutes';
import { useStops } from '../composables/useStops';
import { tripPath } from '../composables/useStopArrivals';
import { nextBusRefreshDelay } from '../utils/busRefresh';
import { formatReportAge, reportAgeLevel } from '../utils/reportAge';
import { formatTripTimes, tripDayLabel } from '../utils/tripTimes';
import RouteBadge from '../components/RouteBadge.vue';
import TransitMap from '../components/TransitMap.vue';

// a bus out of service is still checked now and then, in case it comes back
const INACTIVE_REFRESH_MS = 60_000;

const props = defineProps({
    busId: {
        type: String,
        required: true,
    },
});

const { data: busInfo, error: busError, isLoading: busLoading } = useQuery({
    queryKey: computed(() => ['bus', props.busId]),
    queryFn: () => getBus(props.busId),
    // a bus that has never been seen won't turn up on a retry
    retry: (count, error) => /** @type {any} */ (error).status !== 404 && count < 3,
    refetchInterval: (query) => {
        const info = query.state.data;
        // a live bus reports with each /bus/now snapshot
        return info?.active ? nextBusRefreshDelay([info.latest]) : INACTIVE_REFRESH_MS;
    },
});

const notFound = computed(() => /** @type {any} */ (busError.value)?.status === 404);

const { data: recentTrips, isLoading: tripsLoading, isError: tripsError, refetch: refetchTrips } = useQuery({
    queryKey: computed(() => ['bus-recent-trips', props.busId]),
    queryFn: () => getBusRecentTrips(props.busId),
});

// only worth asking again once the bus has reported something new
watch(() => busInfo.value?.lastSeen, (lastSeen, previous) => {
    if (previous && lastSeen !== previous) {
        refetchTrips();
    }
});

/** @param {import('../api').TripSummary['trip']} trip */
const hasTrip = (trip) => trip !== null && trip !== undefined && trip !== '';

const tripIds = computed(() =>
    [...new Set((recentTrips.value ?? []).filter((summary) => hasTrip(summary.trip)).map((summary) => String(summary.trip)))].sort(),
);

const { data: tripSummaries, isLoading: summariesLoading } = useQuery({
    queryKey: computed(() => ['trip-summaries', tripIds.value]),
    queryFn: () => getTripSummaries(tripIds.value),
    enabled: () => tripIds.value.length > 0,
    staleTime: Infinity,
    // a new trip shouldn't blank the names of the others while it loads
    placeholderData: keepPreviousData,
});

const tripsById = computed(() => new Map((tripSummaries.value ?? []).map((trip) => [String(trip.trip_id), trip])));

const { keyedroutes } = useRoutes();
const { keyedStops } = useStops();

// the trip the bus is on, or last ran, for the map's route line and stops
const currentTripId = computed(() => {
    const latestTrip = busInfo.value?.latest?.trip;
    if (hasTrip(latestTrip)) return String(latestTrip);
    const lastTrip = recentTrips.value?.find((summary) => hasTrip(summary.trip))?.trip;
    return hasTrip(lastTrip) ? String(lastTrip) : null;
});

// same queries as the other pages, so they share their cache
const { data: currentTrip } = useQuery({
    queryKey: computed(() => ['trip-shape', currentTripId.value]),
    queryFn: () => getTrip(currentTripId.value),
    enabled: () => !!currentTripId.value,
    staleTime: Infinity,
});

const { data: currentStopTimes } = useQuery({
    queryKey: computed(() => ['trip-stop-times', currentTripId.value]),
    queryFn: () => getBusStopTimes(/** @type {string} */ (currentTripId.value)),
    enabled: () => !!currentTripId.value,
    staleTime: Infinity,
});

const mapStops = computed(() =>
    (currentStopTimes.value ?? []).flatMap((stopTime) => {
        const stop = keyedStops.value?.[stopTime.stop_id];
        const lat = Number(stop?.stop_lat);
        const lon = Number(stop?.stop_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        return [{ stop_id: stopTime.stop_id, stop_name: stop?.stop_name || stopTime.stop_id, lat, lon }];
    }),
);

const mapPaths = computed(() => {
    const path = tripPath(currentTrip.value);
    return path.length ? [path] : [];
});

const mapBuses = computed(() => (busInfo.value?.latest ? [busInfo.value.latest] : []));

// keeps "last seen" counting up between refreshes
const now = ref(Date.now());
const clock = setInterval(() => { now.value = Date.now(); }, 1000);
onBeforeUnmount(() => clearInterval(clock));

const lastSeen = computed(() => {
    const info = busInfo.value;
    if (!info) return null;
    if (info.active) return { label: 'Live', color: 'success' };
    const level = reportAgeLevel(info.lastSeen, now.value);
    return {
        label: `Last seen ${formatReportAge(info.lastSeen, now.value)}`,
        color: level === 'old' ? undefined : 'warning',
    };
});

const isElectric = computed(() => Number(props.busId) >= 8000 && Number(props.busId) <= 8999);

const trackedSince = computed(() =>
    busInfo.value?.firstSeen
        ? new Date(busInfo.value.firstSeen * 1000).toLocaleDateString('en-CA', {
            timeZone: 'America/Edmonton',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        })
        : null,
);

/**
 * @typedef {Object} TripRow
 * @property {string} key
 * @property {string | null} tripId null while the bus was out of service
 * @property {{route_id: string, trip_headsign: string} | null} trip null until loaded, or if the feed doesn't know it
 * @property {string} times
 * @property {boolean} ongoing
 */

/** @type {import('vue').ComputedRef<{label: string, rows: TripRow[]}[]>} */
const tripDays = computed(() => {
    /** @type {{label: string, rows: TripRow[]}[]} */
    const days = [];
    (recentTrips.value ?? []).forEach((summary, index) => {
        const tripId = hasTrip(summary.trip) ? String(summary.trip) : null;
        // only the newest trip can still be running
        const ongoing = index === 0 && !!busInfo.value?.active && tripId === String(busInfo.value.latest?.trip ?? '');
        const label = tripDayLabel(summary.start, now.value);
        let day = days[days.length - 1];
        if (day?.label !== label) {
            day = { label, rows: [] };
            days.push(day);
        }
        day.rows.push({
            key: `${tripId}-${summary.start}`,
            tripId,
            trip: tripId ? tripsById.value.get(tripId) ?? null : null,
            times: formatTripTimes(summary.start, summary.end, { ongoing }),
            ongoing,
        });
    });
    return days;
});
</script>

<template>
  <v-container>
    <div class="d-flex align-center flex-wrap ga-2 px-2">
      <h1 class="text-headline-small mr-1">
        Bus {{ busId }}
      </h1>
      <v-chip v-if="lastSeen" :color="lastSeen.color" size="small" variant="tonal">
        {{ lastSeen.label }}
      </v-chip>
      <v-chip
        v-if="isElectric"
        color="success"
        size="small"
        variant="tonal"
        prepend-icon="mdi-lightning-bolt"
      >
        Electric
      </v-chip>
    </div>
    <div v-if="trackedSince" class="text-body-small text-medium-emphasis px-2">
      Tracked since {{ trackedSince }}
    </div>

    <div v-if="busLoading" class="d-flex justify-center py-6">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <v-alert v-else-if="notFound" type="info" variant="tonal" class="mt-3">
      Bus {{ busId }} hasn't been seen.
    </v-alert>
    <v-alert v-else-if="busError" type="error" variant="tonal" class="mt-3">
      This bus could not be loaded.
    </v-alert>
    <template v-else>
      <TransitMap
        :stops="mapStops"
        :buses="mapBuses"
        :paths="mapPaths"
        show-age
        follow-bus
        class="bus-map mt-3"
      />

      <h2 class="text-title-large mt-5 mb-2 px-2">
        Recent trips
      </h2>
      <div v-if="tripsLoading" class="d-flex justify-center py-6">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <div v-else-if="tripsError" class="text-error px-2">
        Recent trips could not be loaded.
      </div>
      <div v-else-if="!tripDays.length" class="text-medium-emphasis px-2">
        No trips in the last week
      </div>
      <template v-for="day in tripDays" v-else :key="day.label">
        <div class="text-title-small text-medium-emphasis mt-4 mb-1 px-2">
          {{ day.label }}
        </div>
        <v-card variant="outlined">
          <template v-for="(row, index) in day.rows" :key="row.key">
            <v-divider v-if="index > 0" />
            <component
              :is="row.tripId ? 'router-link' : 'div'"
              :to="row.tripId ? `/trips/${encodeURIComponent(row.tripId)}` : undefined"
              class="trip-row d-flex align-center pa-3"
              :class="{ 'trip-row--link': row.tripId, 'trip-row--current': row.ongoing }"
            >
              <div class="flex-grow-1 min-width-0">
                <template v-if="!row.tripId">
                  <div class="text-body-large text-medium-emphasis">
                    Not in service
                  </div>
                </template>
                <template v-else-if="row.trip">
                  <div class="d-flex align-center text-body-large">
                    <RouteBadge :route-id="row.trip.route_id" size="small" class="mr-2" />
                    <span class="text-truncate">{{ keyedroutes[row.trip.route_id]?.route_long_name }}</span>
                  </div>
                  <div class="text-body-small text-medium-emphasis text-truncate">
                    {{ row.trip.trip_headsign }}
                  </div>
                </template>
                <v-skeleton-loader v-else-if="summariesLoading" type="text" class="trip-loader" />
                <template v-else>
                  <div class="text-body-large">
                    Trip {{ row.tripId }}
                  </div>
                  <div class="text-body-small text-medium-emphasis">
                    Not in the current schedule
                  </div>
                </template>
              </div>
              <div class="text-right flex-shrink-0 ml-2">
                <div class="text-body-medium">
                  {{ row.times }}
                </div>
                <v-chip v-if="row.ongoing" color="success" size="x-small" variant="tonal">
                  Now
                </v-chip>
              </div>
              <v-icon v-if="row.tripId" icon="mdi-chevron-right" class="ml-1 text-medium-emphasis" />
            </component>
          </template>
        </v-card>
      </template>
    </template>
  </v-container>
</template>

<style scoped>
.min-width-0 {
    min-width: 0;
}

.bus-map {
    --transit-map-height: max(45vh, 300px);
}

.trip-row {
    color: inherit;
    text-decoration: none;
}

.trip-row--link:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.trip-row--current {
    background: rgba(var(--v-theme-primary), 0.08);
}

.trip-loader {
    background: transparent;
    max-width: 240px;
}
</style>
