<script setup>
// @ts-check
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getBus, getBusRecentTrips, getBusStopTimes, getTrip, getTripSummaries } from '../api';
import { useRoutes } from '../composables/useRoutes';
import { useStops } from '../composables/useStops';
import { tripPath } from '../composables/useStopArrivals';
import { nextBusRefreshDelay } from '../utils/busRefresh';
import { formatReportAge, reportAgeLevel } from '../utils/reportAge';
import { edmontonNow } from '../utils/serviceTime';
import { edmontonDate, formatTripDuration, formatTripTimes, tripDayLabel } from '../utils/tripTimes';
import { formatShortDate, isDateString, weekRange, weekStart } from '../utils/weeks';
import { headsignWithoutRoute } from '../utils/routes';
import RouteBadge from '../components/RouteBadge.vue';
import TransitMap from '../components/TransitMap.vue';
import WeekPicker from '../components/WeekPicker.vue';

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

const router = useRouter();
const currentRoute = useRoute();

// keeps "last seen" counting up between refreshes, and today current past midnight
const now = ref(Date.now());
const clock = setInterval(() => { now.value = Date.now(); }, 1000);
onBeforeUnmount(() => clearInterval(clock));

const today = computed(() => edmontonNow(new Date(now.value)).dateString);
const firstSeenDate = computed(() => (busInfo.value?.firstSeen ? edmontonDate(busInfo.value.firstSeen) : undefined));

// the week's sunday, from ?week= so reloads and shared links keep it
const initialWeek = currentRoute.query.week;
/** @type {import('vue').Ref<string>} */
const selectedWeek = ref(
    isDateString(initialWeek) && initialWeek <= today.value ? weekStart(initialWeek) : weekStart(today.value),
);
const isCurrentWeek = computed(() => selectedWeek.value === weekStart(today.value));

watch(selectedWeek, (week) => {
    const query = { ...currentRoute.query };
    if (isCurrentWeek.value) delete query.week;
    else query.week = week;
    router.replace({ query });
});

const { data: recentTrips, isLoading: tripsLoading, isError: tripsError, refetch: refetchTrips } = useQuery({
    queryKey: computed(() => ['bus-trips-week', props.busId, selectedWeek.value]),
    queryFn: () => getBusRecentTrips(props.busId, weekRange(selectedWeek.value)),
    // a past week is done, only the current one gains trips
    staleTime: () => (isCurrentWeek.value ? 0 : Infinity),
});

// only worth asking again once the bus has reported something new
watch(() => busInfo.value?.lastSeen, (lastSeen, previous) => {
    if (previous && lastSeen !== previous && isCurrentWeek.value) {
        refetchTrips();
    }
});

/** @param {import('../api').TripSummary['trip']} trip */
const hasTrip = (trip) => trip !== null && trip !== undefined && trip !== '';

// a trip id can appear once per day, so rows are told apart by when they started too
/** @param {import('../api').TripSummary} summary */
const rowKey = (summary) => `${summary.trip ?? ''}-${summary.start}`;

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
    // an older week's trips shouldn't move the map
    if (!isCurrentWeek.value) return null;
    const lastTrip = recentTrips.value?.find((summary) => hasTrip(summary.trip))?.trip;
    return hasTrip(lastTrip) ? String(lastTrip) : null;
});

// the expanded row, by key, so it stays open through refreshes
/** @type {import('vue').Ref<string | null>} */
const selectedKey = ref(null);

// a new week starts collapsed, so the map follows the bus again
watch(selectedWeek, () => {
    selectedKey.value = null;
});

// the lookup has finished and the feed doesn't have the trip, so its page would only say not found
/** @param {TripRow} row */
const notInSchedule = (row) => !!row.tripId && !row.trip && !summariesLoading.value && !!tripSummaries.value;

/** @param {string} key */
const toggleRow = (key) => {
    selectedKey.value = selectedKey.value === key ? null : key;
};

// a selected trip takes over the map from the bus's own trip
const selectedTripId = computed(() => {
    const trip = recentTrips.value?.find((summary) => rowKey(summary) === selectedKey.value)?.trip;
    return hasTrip(trip) ? String(trip) : null;
});
const mapTripId = computed(() => selectedTripId.value ?? currentTripId.value);

// same queries as the other pages, so they share their cache
const { data: mapTrip } = useQuery({
    queryKey: computed(() => ['trip-shape', mapTripId.value]),
    queryFn: () => getTrip(mapTripId.value),
    enabled: () => !!mapTripId.value,
    staleTime: Infinity,
});

const { data: mapStopTimes } = useQuery({
    queryKey: computed(() => ['trip-stop-times', mapTripId.value]),
    queryFn: () => getBusStopTimes(/** @type {string} */ (mapTripId.value)),
    enabled: () => !!mapTripId.value,
    staleTime: Infinity,
});

const mapStops = computed(() =>
    (mapStopTimes.value ?? []).flatMap((stopTime) => {
        const stop = keyedStops.value?.[stopTime.stop_id];
        const lat = Number(stop?.stop_lat);
        const lon = Number(stop?.stop_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        return [{ stop_id: stopTime.stop_id, stop_name: stop?.stop_name || stopTime.stop_id, lat, lon }];
    }),
);

const mapPaths = computed(() => {
    const path = tripPath(mapTrip.value);
    return path.length ? [path] : [];
});

const mapBuses = computed(() => (busInfo.value?.latest ? [busInfo.value.latest] : []));

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
 * @property {string} duration
 * @property {number} points
 * @property {number | null} avgSpeed km/h
 * @property {number | null} maxSpeed km/h
 * @property {boolean} ongoing
 */

/** @param {number | null} metresPerSecond */
const toKmh = (metresPerSecond) =>
    metresPerSecond === null || metresPerSecond === undefined ? null : Math.round(metresPerSecond * 3.6);

const weekOfLabel = computed(() => formatShortDate(selectedWeek.value));

/** @type {import('vue').ComputedRef<{label: string, rows: TripRow[]}[]>} */
const tripDays = computed(() => {
    /** @type {{label: string, rows: TripRow[]}[]} */
    const days = [];
    (recentTrips.value ?? []).forEach((summary, index) => {
        const tripId = hasTrip(summary.trip) ? String(summary.trip) : null;
        // only the newest trip can still be running
        const ongoing = index === 0 && isCurrentWeek.value && !!busInfo.value?.active && tripId === String(busInfo.value.latest?.trip ?? '');
        const label = tripDayLabel(summary.start, now.value);
        let day = days[days.length - 1];
        if (day?.label !== label) {
            day = { label, rows: [] };
            days.push(day);
        }
        day.rows.push({
            key: rowKey(summary),
            tripId,
            trip: tripId ? tripsById.value.get(tripId) ?? null : null,
            times: formatTripTimes(summary.start, summary.end, { ongoing }),
            duration: formatTripDuration(summary.start, summary.end),
            points: summary.points,
            avgSpeed: toKmh(summary.avgSpeed),
            maxSpeed: toKmh(summary.maxSpeed),
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
        :follow-bus="!selectedTripId"
        :fit-key="selectedTripId"
        show-age
        class="bus-map mt-3"
      />

      <div class="d-flex align-center flex-wrap ga-2 mt-5 mb-2 px-2">
        <h2 class="text-title-large mr-auto">
          Trips
        </h2>
        <WeekPicker v-model="selectedWeek" :min="firstSeenDate" :max="today" />
      </div>
      <div v-if="tripsLoading" class="d-flex justify-center py-6">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <div v-else-if="tripsError" class="text-error px-2">
        Trips could not be loaded.
      </div>
      <div v-else-if="!tripDays.length" class="text-medium-emphasis px-2">
        {{ isCurrentWeek ? 'No trips this week' : `No trips in the week of ${weekOfLabel}` }}
      </div>
      <template v-for="day in tripDays" v-else :key="day.label">
        <div class="text-title-small text-medium-emphasis mt-4 mb-1 px-2">
          {{ day.label }}
        </div>
        <v-card variant="outlined">
          <template v-for="(row, index) in day.rows" :key="row.key">
            <v-divider v-if="index > 0" />
            <div
              v-ripple
              class="trip-row d-flex align-center pa-3"
              :class="{ 'trip-row--expanded': selectedKey === row.key }"
              role="button"
              tabindex="0"
              :aria-expanded="selectedKey === row.key"
              @click="toggleRow(row.key)"
              @keydown.enter.prevent="toggleRow(row.key)"
              @keydown.space.prevent="toggleRow(row.key)"
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
                    <span class="text-truncate">{{ headsignWithoutRoute(row.trip.trip_headsign, row.trip.route_id) }}</span>
                  </div>
                  <div class="text-body-small text-medium-emphasis text-truncate">
                    {{ keyedroutes[row.trip.route_id]?.route_long_name }}
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
            </div>
            <v-expand-transition>
              <div v-if="selectedKey === row.key" class="trip-details text-body-medium px-3 pb-3">
                <div>
                  <v-icon icon="mdi-timer-outline" size="small" class="mr-1" />
                  {{ row.duration }}{{ row.ongoing ? ' so far' : '' }}
                </div>
                <div v-if="row.avgSpeed !== null">
                  <v-icon icon="mdi-speedometer" size="small" class="mr-1" />
                  Average {{ row.avgSpeed }} km/h<template v-if="row.maxSpeed !== null">
                    &middot; top {{ row.maxSpeed }} km/h
                  </template>
                </div>
                <div>
                  <v-icon icon="mdi-map-marker-path" size="small" class="mr-1" />
                  {{ row.points }} {{ row.points === 1 ? 'position' : 'positions' }} recorded
                </div>
                <div v-if="row.tripId" class="text-body-small text-medium-emphasis">
                  Trip {{ row.tripId }}
                </div>
                <v-btn
                  v-if="row.tripId"
                  :to="`/trips/${encodeURIComponent(row.tripId)}`"
                  :disabled="notInSchedule(row)"
                  block
                  variant="tonal"
                  color="primary"
                  class="mt-3"
                >
                  View trip
                </v-btn>
              </div>
            </v-expand-transition>
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
    cursor: pointer;
}

.trip-row:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.trip-row--expanded,
.trip-row--expanded:hover {
    background: rgba(var(--v-theme-primary), 0.08);
}

.trip-details {
    background: rgba(var(--v-theme-primary), 0.08);
}

.trip-details > div:not(:last-child) {
    margin-bottom: 2px;
}

@media (prefers-reduced-motion: reduce) {
    .expand-transition-enter-active,
    .expand-transition-leave-active {
        transition: none !important;
    }
}

.trip-loader {
    background: transparent;
    max-width: 240px;
}
</style>
