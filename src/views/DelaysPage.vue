<script setup>
// @ts-check
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getDelayRanking, getTripSummaries } from '../api';
import { useLiveBuses } from '../composables/useBuses';
import { useRoutes } from '../composables/useRoutes';
import { useStops } from '../composables/useStops';
import { scheduleStatus } from '../utils/busStatus';
import { formatDelay } from '../utils/delayStats';
import {
    DELAY_PERIODS,
    DELAY_RANKINGS,
    DELAY_SORTS,
    formatPeriodLabel,
    initialPeriodStart,
    percent,
    periodPhrase,
    periodRange,
    pickOption,
    rangeDays,
    rankingChip,
    rankingDetails,
    switchedPeriodStart,
} from '../utils/delayRankings';
import { liveTripCounts, liveTrips } from '../utils/liveDelays';
import { headsignWithoutRoute, routeNumber } from '../utils/routes';
import { edmontonNow } from '../utils/serviceTime';
import { formatClockTime } from '../utils/tripTimes';
import { addDays, formatDayLabel } from '../utils/weeks';
import BusLink from '../components/BusLink.vue';
import DayPicker from '../components/DayPicker.vue';
import DelayRangePicker from '../components/DelayRangePicker.vue';
import RouteBadge from '../components/RouteBadge.vue';

const router = useRouter();
const currentRoute = useRoute();

const today = edmontonNow().dateString;
// today's stop times aren't worked out until overnight
const yesterday = addDays(today, -1);
const earliest = addDays(today, -366);

// everything is in the URL, so reloads and shared links keep it
/** @type {import('vue').Ref<import('../utils/delayRankings').DelayPeriod>} */
const period = ref(pickOption(DELAY_PERIODS, currentRoute.query.period, 'day'));
const start = ref(initialPeriodStart(period.value, currentRoute.query.date, today));
/** @type {import('vue').Ref<import('../utils/delayRankings').DelayRankingBy>} */
const by = ref(pickOption(DELAY_RANKINGS, currentRoute.query.by, 'trip'));
/** @type {import('vue').Ref<import('../utils/delayRankings').DelaySort>} */
const sort = ref(pickOption(DELAY_SORTS, currentRoute.query.sort, 'mean'));
/** @type {import('vue').Ref<string | null>} */
const routeFilter = ref(typeof currentRoute.query.route === 'string' && currentRoute.query.route ? currentRoute.query.route : null);

// a week or month opens on the last 7 or 30 days, and a day on the last one shown
watch(period, (next, previous) => {
    start.value = switchedPeriodStart(next, periodRange(previous, start.value, today), today);
});

watch([period, start, by, sort, routeFilter], () => {
    /** @type {Record<string, string>} */
    const query = {};
    if (period.value !== 'day') query.period = period.value;
    // a day defaults to yesterday, a week or month to the last 7 or 30 days
    if (start.value && !(period.value === 'day' && start.value === yesterday)) query.date = start.value;
    if (by.value !== 'trip') query.by = by.value;
    if (sort.value !== 'mean') query.sort = sort.value;
    if (by.value === 'trip' && routeFilter.value) query.route = routeFilter.value;
    router.replace({ query });
});

const range = computed(() => periodRange(period.value, start.value, today));
const periodLabel = computed(() => periodPhrase(formatPeriodLabel(period.value, start.value, today)));
const activeRoute = computed(() => (by.value === 'trip' ? routeFilter.value : null));

const { data: ranking, isLoading, isError, isPlaceholderData } = useQuery({
    queryKey: computed(() => ['delay-ranking', by.value, range.value.from, range.value.to, sort.value, activeRoute.value]),
    queryFn: () => getDelayRanking(by.value, { ...range.value, sort: sort.value, route: activeRoute.value }),
    // worked out nightly
    staleTime: 60 * 60_000,
    placeholderData: keepPreviousData,
});

// a new ranking closes the open row
const selectedKey = ref(/** @type {string | null} */ (null));
watch(() => [by.value, range.value.from, sort.value, activeRoute.value], () => { selectedKey.value = null; });
/** @param {string} key */
const toggleRow = (key) => { selectedKey.value = selectedKey.value === key ? null : key; };

const { keyedroutes } = useRoutes();
const { keyedStops } = useStops();

// trips out now, latest first, from the shared /bus/now snapshot
const { data: liveBuses, isLoading: liveLoading, isError: liveError } = useLiveBuses();
const running = computed(() => liveTrips(liveBuses.value));
const runningCounts = computed(() => liveTripCounts(running.value));
const RUNNING_PREVIEW = 5;
const showAllRunning = ref(false);
const shownRunning = computed(() => (showAllRunning.value ? running.value : running.value.slice(0, RUNNING_PREVIEW)));

const runningTripIds = computed(() => [...new Set(shownRunning.value.map((trip) => trip.trip))].sort());
const { data: runningSummaries } = useQuery({
    queryKey: computed(() => ['trip-summaries', runningTripIds.value]),
    queryFn: () => getTripSummaries(runningTripIds.value),
    enabled: () => runningTripIds.value.length > 0,
    staleTime: Infinity,
    // the shown trips change with each snapshot, so keep the names while the next ones load
    placeholderData: keepPreviousData,
});
const runningHeadsigns = computed(() => new Map((runningSummaries.value ?? []).map((trip) => [trip.trip_id, trip.trip_headsign])));

/** @param {string} trip the live trip page, without a date */
const liveTripLink = (trip) => `/trips/${encodeURIComponent(trip)}`;

/** @param {import('../utils/liveDelays').LiveTrip} trip */
const runningTitle = (trip) => {
    const headsign = runningHeadsigns.value.get(trip.trip);
    if (headsign) return headsignWithoutRoute(headsign, trip.route ?? '');
    return (trip.route && routeName(trip.route)) || `Trip ${trip.trip}`;
};

const tripIds = computed(() =>
    [...new Set((ranking.value?.trips ?? []).map((trip) => String(trip.trip)))].sort(),
);
const { data: tripSummaries } = useQuery({
    queryKey: computed(() => ['trip-summaries', tripIds.value]),
    queryFn: () => getTripSummaries(tripIds.value),
    enabled: () => tripIds.value.length > 0,
    staleTime: Infinity,
});
const headsigns = computed(() => new Map((tripSummaries.value ?? []).map((trip) => [trip.trip_id, trip.trip_headsign])));

/** @param {string} routeId */
const routeName = (routeId) => keyedroutes.value[routeId]?.route_long_name ?? '';

/** @param {string | null} stopId */
const stopName = (stopId) => (stopId ? keyedStops.value[stopId]?.stop_name ?? `Stop ${stopId}` : null);

/**
 * @param {string | number} trip
 * @param {string} date
 */
const tripLink = (trip, date) => ({ path: `/trips/${encodeURIComponent(trip)}`, query: { date } });

/**
 * The route's page for the stop a trip was latest at, on its day
 * @param {string} stopId
 * @param {string} routeId
 * @param {string} date
 */
const stopLink = (stopId, routeId, date) => ({
    path: `/stops/${encodeURIComponent(stopId)}/routes/${encodeURIComponent(routeId)}`,
    query: { date },
});

/** @param {string} routeId */
const showRouteTrips = (routeId) => {
    routeFilter.value = routeId;
    by.value = 'trip';
};

const rows = computed(() => {
    const data = ranking.value;
    if (!data) return [];
    if (by.value === 'trip') {
        return (data.trips ?? []).map((trip) => ({ key: `${trip.trip}-${trip.date}`, kind: /** @type {const} */ ('trip'), trip }));
    }
    if (by.value === 'route') {
        return (data.routes ?? []).map((route) => ({ key: route.route, kind: /** @type {const} */ ('route'), route }));
    }
    return (data.buses ?? []).map((bus) => ({ key: String(bus.bus), kind: /** @type {const} */ ('bus'), bus }));
});

const totalDays = computed(() => rangeDays(range.value));
const coverage = computed(() => {
    const days = ranking.value?.days ?? 0;
    if (period.value === 'day' || !days || days >= totalDays.value) return null;
    return `Worked out for ${days} of its ${totalDays.value} days so far`;
});
</script>

<template>
  <v-container class="delays-page">
    <h1 class="text-headline-small px-2">
      Delays
    </h1>

    <section class="mb-6" aria-labelledby="running-now">
      <h2 id="running-now" class="text-title-large px-2 mt-2">
        Running now
      </h2>
      <div class="text-body-medium text-medium-emphasis px-2 mb-3">
        Trips out now, latest first, by how late ETS expects them at their next stop.
      </div>
      <div v-if="liveLoading" class="d-flex justify-center py-6">
        <v-progress-circular indeterminate color="primary" />
      </div>
      <div v-else-if="liveError" class="text-error px-2">
        Live buses could not be loaded.
      </div>
      <div v-else-if="!running.length" class="text-medium-emphasis px-2">
        No trips with a predicted delay are running right now.
      </div>
      <template v-else>
        <div class="d-flex flex-wrap ga-2 px-2 mb-3 running-counts">
          <v-chip size="small" variant="outlined">
            {{ runningCounts.total }} running
          </v-chip>
          <v-chip size="small" variant="tonal" color="success">
            {{ runningCounts.onTime }} on time
          </v-chip>
          <v-chip size="small" variant="tonal" color="warning">
            {{ runningCounts.late }} late
          </v-chip>
          <v-chip v-if="runningCounts.veryLate" size="small" variant="tonal" color="warning">
            {{ runningCounts.veryLate }} 5+ min late
          </v-chip>
          <v-chip size="small" variant="tonal" color="info">
            {{ runningCounts.early }} early
          </v-chip>
        </div>
        <v-card variant="outlined">
          <template v-for="(trip, index) in shownRunning" :key="trip.trip">
            <v-divider v-if="index > 0" />
            <!-- a div rather than a link, as the bus link sits inside it -->
            <div
              v-ripple
              class="running-row d-flex align-center pa-3"
              role="link"
              tabindex="0"
              @click="router.push(liveTripLink(trip.trip))"
              @keydown.enter.prevent="router.push(liveTripLink(trip.trip))"
            >
              <div class="flex-grow-1 min-width-0">
                <div class="d-flex align-center text-body-large">
                  <RouteBadge v-if="trip.route" :route-id="trip.route" size="small" class="mr-2" />
                  <span class="text-truncate">{{ runningTitle(trip) }}</span>
                </div>
                <div class="text-body-small text-medium-emphasis text-truncate">
                  <BusLink :bus="trip.bus" />
                </div>
              </div>
              <v-chip
                :color="scheduleStatus(trip.minutes).color"
                size="small"
                variant="tonal"
                class="flex-shrink-0 ml-2"
              >
                {{ scheduleStatus(trip.minutes).label }}
              </v-chip>
            </div>
          </template>
        </v-card>
        <v-btn
          v-if="running.length > RUNNING_PREVIEW"
          block
          variant="text"
          color="primary"
          class="mt-1"
          @click="showAllRunning = !showAllRunning"
        >
          {{ showAllRunning ? 'Show fewer' : `Show all ${running.length} trips` }}
        </v-btn>
      </template>
    </section>

    <h2 class="text-title-large px-2">
      Past days
    </h2>
    <div class="text-body-medium text-medium-emphasis px-2 mb-4">
      The latest trips, routes and buses, from when buses went by each stop. These are worked out
      overnight, so today isn't in them yet.
    </div>

    <div class="d-flex align-center flex-wrap ga-2 px-2 mb-2">
      <v-btn-toggle
        v-model="period"
        mandatory
        density="compact"
        variant="outlined"
        divided
        color="primary"
        class="period-toggle"
      >
        <v-btn value="day" class="text-none">
          Day
        </v-btn>
        <v-btn value="week" class="text-none">
          Week
        </v-btn>
        <v-btn value="month" class="text-none">
          Month
        </v-btn>
      </v-btn-toggle>
      <DayPicker
        v-if="period === 'day'"
        v-model="start"
        :min="earliest"
        :max="yesterday"
        :today="today"
      />
      <DelayRangePicker
        v-else
        v-model="start"
        :kind="period"
        :min="earliest"
        :today="today"
      />
    </div>

    <v-tabs v-model="by" color="primary" class="mb-2">
      <v-tab value="trip" class="text-none">
        Trips
      </v-tab>
      <v-tab value="route" class="text-none">
        Routes
      </v-tab>
      <v-tab value="bus" class="text-none">
        Buses
      </v-tab>
    </v-tabs>

    <div class="d-flex align-center flex-wrap ga-2 px-2 mb-3">
      <v-chip-group v-model="sort" mandatory selected-class="text-primary" aria-label="Rank by">
        <v-chip value="mean" filter variant="outlined">
          Average
        </v-chip>
        <v-chip value="max" filter variant="outlined">
          Worst
        </v-chip>
        <v-chip value="late" filter variant="outlined">
          Often 5+ min late
        </v-chip>
      </v-chip-group>
      <v-chip
        v-if="activeRoute"
        closable
        color="primary"
        variant="tonal"
        close-label="Show every route"
        @click:close="routeFilter = null"
      >
        Route {{ routeNumber(activeRoute) }} only
      </v-chip>
    </div>

    <div v-if="isLoading" class="d-flex justify-center py-6">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <div v-else-if="isError" class="text-error px-2">
      Delays could not be loaded.
    </div>
    <div v-else-if="ranking && !ranking.days" class="text-medium-emphasis px-2">
      No delays have been worked out for {{ periodLabel }} yet.
    </div>
    <div v-else-if="!rows.length" class="text-medium-emphasis px-2">
      Nothing to rank for {{ periodLabel }}.
    </div>
    <template v-else>
      <div v-if="coverage" class="text-body-small text-medium-emphasis px-2 mb-2">
        {{ coverage }}
      </div>
      <v-card variant="outlined" :class="{ 'delays-list--stale': isPlaceholderData }">
        <template v-for="(row, index) in rows" :key="row.key">
          <v-divider v-if="index > 0" />
          <div
            v-ripple
            class="delay-row d-flex align-center pa-3"
            :class="{ 'delay-row--expanded': selectedKey === row.key }"
            role="button"
            tabindex="0"
            :aria-expanded="selectedKey === row.key"
            @click="toggleRow(row.key)"
            @keydown.enter.prevent="toggleRow(row.key)"
            @keydown.space.prevent="toggleRow(row.key)"
          >
            <div class="rank text-body-medium text-medium-emphasis flex-shrink-0">
              {{ index + 1 }}
            </div>
            <div class="flex-grow-1 min-width-0">
              <template v-if="row.kind === 'trip'">
                <div class="d-flex align-center text-body-large">
                  <RouteBadge v-if="row.trip.route" :route-id="row.trip.route" size="small" class="mr-2" />
                  <span class="text-truncate">
                    {{ headsigns.get(String(row.trip.trip))
                      ? headsignWithoutRoute(headsigns.get(String(row.trip.trip)) ?? '', row.trip.route ?? '')
                      : `Trip ${row.trip.trip}` }}
                  </span>
                </div>
                <div class="text-body-small text-medium-emphasis text-truncate">
                  {{ formatDayLabel(row.trip.date, today) }} &middot; {{ formatClockTime(row.trip.firstScheduled) }}
                  <template v-if="row.trip.bus !== null">
                    &middot; <BusLink :bus="row.trip.bus" />
                  </template>
                </div>
              </template>
              <template v-else-if="row.kind === 'route'">
                <div class="d-flex align-center text-body-large">
                  <RouteBadge :route-id="row.route.route" size="small" class="mr-2" />
                  <span class="text-truncate">{{ routeName(row.route.route) }}</span>
                </div>
                <div class="text-body-small text-medium-emphasis">
                  {{ row.route.trips }} trips &middot; {{ row.route.lateTrips }} 5+ min late somewhere
                </div>
              </template>
              <template v-else>
                <div class="text-body-large">
                  <BusLink :bus="row.bus.bus" />
                </div>
                <div class="text-body-small text-medium-emphasis">
                  {{ row.bus.trips }} trips &middot; {{ row.bus.lateTrips }} 5+ min late somewhere
                </div>
              </template>
            </div>
            <div class="text-right flex-shrink-0 ml-2">
              <v-chip
                :color="rankingChip(sort, row[row.kind]).color"
                size="small"
                variant="tonal"
              >
                {{ rankingChip(sort, row[row.kind]).label }}
              </v-chip>
              <div class="text-body-small text-medium-emphasis mt-1 d-none d-sm-block">
                {{ rankingDetails(sort, row[row.kind]) }}
              </div>
            </div>
          </div>
          <v-expand-transition>
            <div v-if="selectedKey === row.key" class="delay-details text-body-medium px-3 pb-3">
              <template v-if="row.kind === 'trip'">
                <div v-if="row.trip.mean !== null">
                  <v-icon icon="mdi-clock-outline" size="small" class="mr-1" />
                  Average {{ formatDelay(row.trip.mean) }} over {{ row.trip.stops }} stops
                </div>
                <div>
                  <v-icon icon="mdi-alert-outline" size="small" class="mr-1" />
                  Worst {{ formatDelay(row.trip.max) }}<template v-if="row.trip.maxStop && row.trip.route">
                    at <router-link :to="stopLink(row.trip.maxStop, row.trip.route, row.trip.date)" class="details-link" @click.stop>
                      {{ stopName(row.trip.maxStop) }}
                    </router-link>
                  </template>
                </div>
                <div>
                  <v-icon icon="mdi-flag-checkered" size="small" class="mr-1" />
                  {{ formatDelay(row.trip.last) }} at the last stop seen
                </div>
                <div>
                  <v-icon icon="mdi-check-circle-outline" size="small" class="mr-1" />
                  On time at {{ percent(row.trip.onTime, row.trip.stops) }} of stops,
                  5+ min late at {{ percent(row.trip.late, row.trip.stops) }}
                </div>
                <div class="text-body-small text-medium-emphasis">
                  Trip {{ row.trip.trip }}
                </div>
                <v-btn
                  :to="tripLink(row.trip.trip, row.trip.date)"
                  block
                  size="large"
                  height="50"
                  variant="tonal"
                  color="primary"
                  class="mt-3"
                >
                  View trip
                </v-btn>
              </template>
              <template v-else>
                <div v-if="row[row.kind].mean !== null">
                  <v-icon icon="mdi-clock-outline" size="small" class="mr-1" />
                  Average {{ formatDelay(/** @type {number} */ (row[row.kind].mean)) }} over {{ row[row.kind].stops }} stops
                </div>
                <div>
                  <v-icon icon="mdi-check-circle-outline" size="small" class="mr-1" />
                  On time at {{ percent(row[row.kind].onTime, row[row.kind].stops) }} of stops,
                  5+ min late at {{ percent(row[row.kind].late, row[row.kind].stops) }}
                </div>
                <div>
                  <v-icon icon="mdi-alert-outline" size="small" class="mr-1" />
                  Worst {{ formatDelay(row[row.kind].max) }}, on
                  <router-link :to="tripLink(row[row.kind].worst.trip, row[row.kind].worst.date)" class="details-link" @click.stop>
                    <template v-if="row.kind === 'bus' && row.bus.worst.route">
                      route {{ routeNumber(row.bus.worst.route) }},
                    </template>
                    trip {{ row[row.kind].worst.trip }}
                  </router-link>
                  {{ formatDayLabel(row[row.kind].worst.date, today) }}
                </div>
                <template v-if="row.kind === 'route'">
                  <v-btn
                    block
                    size="large"
                    height="50"
                    variant="tonal"
                    color="primary"
                    class="mt-3"
                    @click.stop="showRouteTrips(row.route.route)"
                  >
                    Latest trips on route {{ routeNumber(row.route.route) }}
                  </v-btn>
                  <v-btn
                    :to="`/routes/${encodeURIComponent(row.route.route)}`"
                    block
                    variant="text"
                    color="primary"
                    class="mt-1"
                  >
                    View route
                  </v-btn>
                </template>
                <v-btn
                  v-else
                  :to="`/buses/${encodeURIComponent(row.bus.bus)}`"
                  block
                  size="large"
                  height="50"
                  variant="tonal"
                  color="primary"
                  class="mt-3"
                >
                  View bus
                </v-btn>
              </template>
            </div>
          </v-expand-transition>
        </template>
      </v-card>
    </template>
  </v-container>
</template>

<style scoped>
.delays-page {
    max-width: 960px;
}
.min-width-0 {
    min-width: 0;
}
.rank {
    width: 2em;
}
.delay-row,
.running-row {
    cursor: pointer;
}
.delay-row:hover,
.running-row:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
}
.delay-row--expanded,
.delay-row--expanded:hover,
.delay-details {
    background: rgba(var(--v-theme-primary), 0.08);
}
.delay-details {
    padding-left: calc(2em + 12px) !important;
}
.delay-details > div:not(:last-child) {
    margin-bottom: 2px;
}
.details-link {
    color: rgb(var(--v-theme-primary));
}
.delays-list--stale {
    opacity: 0.6;
}
@media (prefers-reduced-motion: reduce) {
    .expand-transition-enter-active,
    .expand-transition-leave-active {
        transition: none !important;
    }
}
</style>
