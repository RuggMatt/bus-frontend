<script setup>
// @ts-check
import { useQueries, useQuery } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getBusStopTimes, getRouteStopTimes, getServiceDates, getStopRouteSchedule, getTrip, getTripRun, getTripsByRouteId } from '../api';
import { useStops } from '../composables/useStops';
import { useRoutes } from '../composables/useRoutes';
import { useRecordedTrips } from '../composables/useRecordedTrips';
import { usePageTitle } from '../composables/usePageTitle';
import { tripPath } from '../composables/useStopArrivals';
import { LOCAL_AGENCY, RAIL_ROUTE_TYPE, headsignWithoutRoute, routeColor, routeNumber } from '../utils/routes';
import { formatScheduledTime } from '../utils/busStatus';
import { actualStopTime, delaysByTrip } from '../utils/actualTimes';
import { estimateStopArrivals } from '../utils/stopEstimates';
import { serviceDatesFrom, servicesOnDate } from '../utils/serviceCalendar';
import { edmontonNow, timeToSeconds } from '../utils/serviceTime';
import { arrivalsOnDate, earlierCount, runDate, serviceDaySeconds } from '../utils/stopRouteTimes';
import { addDays, formatDayLabel, isDateString } from '../utils/weeks';
import RouteBadge from '../components/RouteBadge.vue';
import DayPicker from '../components/DayPicker.vue';
import StopDelayStats from '../components/StopDelayStats.vue';

const props = defineProps({
    stopId: { type: String, required: true },
    routeId: { type: String, required: true },
});

// how far back the picker goes, about as far as the backend keeps positions
const PAST_DAYS = 366;
// how far ahead the picker goes when the calendar can't be loaded
const FALLBACK_FUTURE_DAYS = 60;
// today starts the list this long before now, with the rest behind a button
const EARLIER_SECONDS = 60 * 60;
// a bus this far from its time here may already be on its way, so its run is loaded
const RUN_AHEAD_SECONDS = 10 * 60;
// a bus with no time this long after it was due here wasn't seen going by
const NOT_SEEN_SECONDS = 10 * 60;
// upcoming buses within this show how long until they're due
const SOON_SECONDS = 60 * 60;
// a run that reported in the last few minutes is still going
const ACTIVE_RUN_SECONDS = 300;

const router = useRouter();
const currentRoute = useRoute();

const today = edmontonNow().dateString;
const yesterday = addDays(today, -1);

/** @param {unknown} value */
const dateFromQuery = (value) => (isDateString(value) ? value : today);
const selectedDate = ref(dateFromQuery(currentRoute.query.date));
watch(() => currentRoute.query.date, (date) => {
    selectedDate.value = dateFromQuery(date);
});

/** @param {string} date */
const pickDate = (date) => {
    selectedDate.value = date;
    router.replace({ query: { ...currentRoute.query, date: date === today ? undefined : date } });
};

// route ids are only unique within an agency, so a regional route's links say which
const agency = computed(() => {
    const value = currentRoute.query.agency;
    return typeof value === 'string' && value ? value : LOCAL_AGENCY;
});

const { keyedStops } = useStops();
const { keyedroutes } = useRoutes();
const stop = computed(() => keyedStops.value?.[props.stopId] ?? null);

// the stop page hands over the route's name, so the heading can morph straight away
/** @type {{ routeLongName?: string }} */
const handoff = window.history.state ?? {};

// ticks so today's list moves on and the buses' runs refresh
const nowSeconds = ref(Date.now() / 1000);
/** @type {ReturnType<typeof setInterval> | undefined} */
let nowInterval;
onMounted(() => {
    nowInterval = setInterval(() => {
        nowSeconds.value = Date.now() / 1000;
    }, 30000);
});
onBeforeUnmount(() => clearInterval(nowInterval));
// now on the picked service day's clock, so it compares with times past 24:00:00
const dayNow = computed(() => serviceDaySeconds(nowSeconds.value, selectedDate.value));

const schedule = useQuery({
    queryKey: computed(() => ['stop-route-schedule', props.stopId, props.routeId, agency.value]),
    queryFn: () => getStopRouteSchedule(props.stopId, props.routeId, agency.value),
    staleTime: Infinity,
});

const entries = computed(() => schedule.data.value ?? []);
const serviceIds = computed(() => [...new Set(entries.value.map((entry) => entry.service_id))].sort());

const { data: serviceDateRows, isLoading: calendarLoading } = useQuery({
    queryKey: computed(() => ['service-dates', props.routeId, serviceIds.value.join(',')]),
    queryFn: () => getServiceDates(serviceIds.value),
    enabled: () => serviceIds.value.length > 0,
    staleTime: Infinity,
});

// null if the calendar couldn't be loaded
const serviceDates = computed(() => (serviceDateRows.value?.length ? serviceDatesFrom(serviceDateRows.value) : null));

// sorted dates the route stops here, or null without the calendar
const serviceDays = computed(() => {
    if (!serviceDates.value) return null;
    const days = [...new Set([...serviceDates.value.values()].flatMap((dates) => [...dates]))].sort();
    return days.length ? days : null;
});

const pickerMin = addDays(today, -PAST_DAYS);
const pickerMax = computed(() => {
    const last = serviceDays.value?.at(-1);
    return last && last > today ? last : serviceDays.value ? today : addDays(today, FALLBACK_FUTURE_DAYS);
});

// days the route runs, plus any day before the calendar starts, as older feeds aren't in it
/** @param {string} date */
const isPickable = (date) => {
    const days = serviceDays.value;
    if (!days) return true;
    return date < /** @type {string} */ (days[0]) || days.includes(date);
};

const arrivals = computed(() => {
    const services = serviceDates.value ? servicesOnDate(serviceDates.value, selectedDate.value) : null;
    return arrivalsOnDate(entries.value, services, selectedDate.value);
});

const listLoading = computed(() => schedule.isLoading.value || (serviceIds.value.length > 0 && calendarLoading.value));

const routeInfo = computed(() => keyedroutes.value?.[props.routeId]);
const routeLongName = computed(() => entries.value[0]?.route_long_name ?? routeInfo.value?.route_long_name ?? handoff.routeLongName ?? '');
// LRT lines go by name and colour in Edmonton, not number, and aren't tracked live
const isRail = computed(() => (entries.value[0]?.route_type ?? routeInfo.value?.route_type) === RAIL_ROUTE_TYPE);

// where the route usually goes from here, as its name doesn't say the direction
const mainHeadsign = computed(() => {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const entry of arrivals.value.length ? arrivals.value : entries.value) {
        if (entry.trip_headsign) counts.set(entry.trip_headsign, (counts.get(entry.trip_headsign) ?? 0) + 1);
    }
    const headsign = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return headsign ? headsignWithoutRoute(headsign, props.routeId) : '';
});

const stopName = computed(() => stop.value?.stop_name ?? '');
const stopCode = computed(() => stop.value?.stop_code ?? props.stopId);

usePageTitle(() => [
    isRail.value ? routeLongName.value : `Route ${routeNumber(props.routeId)}`,
    stopName.value ? `${stopName.value} · Stop ${stopCode.value}` : `Stop ${stopCode.value}`,
]);

const isToday = computed(() => selectedDate.value === today);
const isFuture = computed(() => selectedDate.value > today);

// today starts an hour back, so the list opens on what's coming
const showEarlier = ref(false);
watch(selectedDate, () => {
    showEarlier.value = false;
});
const hiddenCount = computed(() =>
    (isToday.value && !showEarlier.value ? earlierCount(arrivals.value, dayNow.value, EARLIER_SECONDS) : 0));
const shownArrivals = computed(() => arrivals.value.slice(hiddenCount.value));

// --- actual times ---

// past days come from the backend, worked out overnight
const storedTimes = useQuery({
    queryKey: computed(() => ['route-stop-times', props.routeId, selectedDate.value]),
    queryFn: () => getRouteStopTimes(props.routeId, selectedDate.value),
    enabled: () => !isRail.value && selectedDate.value < today,
    // yesterday's are worked out early in the morning
    staleTime: 60 * 60 * 1000,
});
const storedDelays = computed(() => delaysByTrip(storedTimes.data.value));

// today's aren't stored yet, nor yesterday's early in the morning, so they're worked
// out here from the buses' recorded positions, like the trip page does
const estimating = computed(() => {
    if (isRail.value) return false;
    if (isToday.value) return true;
    return selectedDate.value === yesterday && storedTimes.isSuccess.value && !storedTimes.data.value?.trips.length;
});

const recordedTripIds = useRecordedTrips(() => props.routeId, () => (estimating.value ? selectedDate.value : null));

// one shape and stop list per route shape, from the first bus on it, so a busy route
// doesn't fetch every trip's
const { data: routeTrips } = useQuery({
    queryKey: computed(() => ['route-trips', props.routeId]),
    queryFn: () => getTripsByRouteId(props.routeId),
    enabled: estimating,
});
const shapeByTrip = computed(() => new Map((routeTrips.value ?? []).map((trip) => [trip.trip_id, trip.shape_id])));

// the buses shown that have been recorded and may have reached the stop
const candidates = computed(() => {
    if (!estimating.value) return [];
    return shownArrivals.value.filter((entry) =>
        recordedTripIds.value.has(entry.trip_id)
        && shapeByTrip.value.has(entry.trip_id)
        && timeToSeconds(entry.arrival_time) <= dayNow.value + RUN_AHEAD_SECONDS);
});

/** @type {import('vue').ComputedRef<Map<string, string>>} shape id → trip id */
const shapeTrips = computed(() => {
    const map = new Map();
    for (const entry of candidates.value) {
        const shape = /** @type {string} */ (shapeByTrip.value.get(entry.trip_id));
        if (!map.has(shape)) map.set(shape, entry.trip_id);
    }
    return map;
});

const shapeQueries = useQueries({
    queries: computed(() => [...shapeTrips.value.values()].map((tripId) => ({
        queryKey: ['trip-shape', tripId],
        queryFn: () => getTrip(tripId),
        staleTime: Infinity,
    }))),
});
const shapeStopQueries = useQueries({
    queries: computed(() => [...shapeTrips.value.values()].map((tripId) => ({
        queryKey: ['trip-stop-times', tripId],
        queryFn: () => getBusStopTimes(tripId),
        staleTime: Infinity,
    }))),
});

/**
 * Each shape's line, and its stops up to this one, by shape id
 * @type {import('vue').ComputedRef<Map<string, {path: [number, number][], stops: import('../api').BusStopTime[]}>>}
 */
const shapes = computed(() => {
    const map = new Map();
    [...shapeTrips.value.keys()].forEach((shape, index) => {
        const trip = shapeQueries.value[index]?.data;
        const stops = shapeStopQueries.value[index]?.data;
        if (trip && stops?.length) map.set(shape, { path: tripPath(trip), stops });
    });
    return map;
});

/**
 * Where this visit is in its shape's stop list, and when the trip starts
 * @param {import('../api').StopScheduleEntry} entry
 */
const placeOnShape = (entry) => {
    const shape = shapes.value.get(/** @type {string} */ (shapeByTrip.value.get(entry.trip_id)));
    if (!shape) return null;
    const { stops } = shape;
    let index = stops.findIndex((stopTime) => stopTime.stop_sequence === entry.stop_sequence && stopTime.stop_id === props.stopId);
    if (index === -1) index = stops.findIndex((stopTime) => stopTime.stop_id === props.stopId);
    if (index === -1) return null;
    const first = stops[0];
    // trips on a shape keep the same running times, near enough to tell the day it started
    const offset = timeToSeconds(stops[index].arrival_time) - timeToSeconds(first.departure_time || first.arrival_time);
    return { shape, index, start: timeToSeconds(entry.arrival_time) - offset };
};

const runs = computed(() => candidates.value.flatMap((entry) => {
    const place = placeOnShape(entry);
    return place ? [{ entry, place, date: runDate(selectedDate.value, place.start) }] : [];
}));

/** @type {import('vue').Ref<Set<string>>} trips already estimated, so their runs stop refreshing */
const passedTrips = ref(new Set());

const runQueries = useQueries({
    queries: computed(() => runs.value.map(({ entry, date }) => ({
        // the trip page's key, so the two share runs
        queryKey: ['trip-run', entry.trip_id, date],
        queryFn: () => getTripRun(entry.trip_id, date),
        // a day with no run won't gain one on a retry
        retry: (/** @type {number} */ count, /** @type {any} */ error) => error.status !== 404 && count < 3,
        staleTime: passedTrips.value.has(`${entry.trip_id}|${entry.stop_sequence}`) ? Infinity : 30000,
        refetchInterval: (/** @type {any} */ query) => {
            if (passedTrips.value.has(`${entry.trip_id}|${entry.stop_sequence}`)) return false;
            const positions = query.state.data?.positions ?? [];
            const latest = positions.reduce((max, position) => Math.max(max, position.timestamp), 0);
            return Date.now() / 1000 - latest <= ACTIVE_RUN_SECONDS ? 60000 : false;
        },
    }))),
});

// worked-out delays in seconds, by trip and stop_sequence
const estimatedDelays = computed(() => {
    /** @type {Map<string, number>} */
    const delays = new Map();
    runs.value.forEach(({ entry, place }, index) => {
        const positions = runQueries.value[index]?.data?.positions;
        if (!positions?.length) return;
        const coords = place.shape.stops.slice(0, place.index + 1).map((stopTime) => {
            const info = keyedStops.value?.[stopTime.stop_id];
            return info ? { lat: info.stop_lat, lon: info.stop_lon } : null;
        });
        const passedAt = estimateStopArrivals(coords, positions, place.shape.path)[place.index];
        if (passedAt === null || passedAt === undefined) return;
        delays.set(`${entry.trip_id}|${entry.stop_sequence}`, serviceDaySeconds(passedAt, selectedDate.value) - timeToSeconds(entry.arrival_time));
    });
    return delays;
});

watch(estimatedDelays, (delays) => {
    if ([...delays.keys()].some((key) => !passedTrips.value.has(key))) {
        passedTrips.value = new Set([...passedTrips.value, ...delays.keys()]);
    }
});

// whether a bus's time here could still turn up
/** @param {import('../api').StopScheduleEntry} entry */
const timePending = (entry) => {
    if (isFuture.value) return false;
    if (!estimating.value) return storedTimes.isLoading.value;
    const index = runs.value.findIndex((run) => run.entry === entry);
    if (index !== -1) return runQueries.value[index]?.isLoading ?? false;
    // still waiting on what's needed to place it
    return recordedTripIds.value.has(entry.trip_id) && !shapes.value.has(/** @type {string} */ (shapeByTrip.value.get(entry.trip_id)));
};

const rows = computed(() => {
    return shownArrivals.value.map((entry) => {
        const seq = Number(entry.stop_sequence);
        // a loop can visit the stop twice, so each visit is told apart
        const key = `${entry.trip_id}|${entry.stop_sequence}`;
        const delay = estimating.value ? estimatedDelays.value.get(key) : storedDelays.value.get(entry.trip_id)?.get(seq);
        const actual = delay === undefined ? null : actualStopTime(entry.arrival_time, delay);
        const due = timeToSeconds(entry.arrival_time) - dayNow.value;
        const headsign = headsignWithoutRoute(entry.trip_headsign || '', props.routeId);
        return {
            key,
            entry,
            scheduled: formatScheduledTime(entry.arrival_time),
            headsign: headsign && headsign !== mainHeadsign.value ? headsign : null,
            actual: actual ? { time: formatScheduledTime(actual.time), status: actual.status } : null,
            // only today, as other days' buses are either all to come or all gone
            soon: isToday.value && due >= 0 && due <= SOON_SECONDS ? Math.round(due / 60) : null,
            notSeen: !actual && !isRail.value && due < -NOT_SEEN_SECONDS && !timePending(entry),
            past: isToday.value && due < 0,
        };
    });
});

// the first bus still to come today, picked out in the list
const nextKey = computed(() => (isToday.value ? rows.value.find((row) => !row.past)?.key ?? null : null));

// why there are no actual times, when there aren't any for a past day
const noStoredTimes = computed(() =>
    !estimating.value && !isRail.value && selectedDate.value < today && storedTimes.isSuccess.value
    && !arrivals.value.some((entry) => storedDelays.value.get(entry.trip_id)?.has(Number(entry.stop_sequence))));

const dayLabel = computed(() => formatDayLabel(selectedDate.value, today));
</script>

<template>
  <v-container class="stop-route-page">
    <router-link
      :to="`/routes/${routeId}`"
      class="route-header d-flex align-center pa-2"
      :class="{ 'route-header--line': isRail }"
      :style="isRail && routeColor(routeId) ? { borderLeftColor: routeColor(routeId) } : undefined"
    >
      <!-- named like the route page's heading, so the stop page's card morphs through here -->
      <RouteBadge v-if="!isRail" :route-id="routeId" size="large" style="view-transition-name: route-number" />
      <div class="min-width-0" :class="{ 'ml-3': !isRail }">
        <h1 class="text-headline-small my-0" :style="mainHeadsign ? undefined : { viewTransitionName: 'route-name' }">
          {{ mainHeadsign || routeLongName }}
        </h1>
        <div v-if="mainHeadsign" class="text-body-medium text-medium-emphasis" style="view-transition-name: route-name">
          {{ routeLongName }}
        </div>
        <div v-if="agency !== LOCAL_AGENCY" class="text-body-small text-medium-emphasis">
          {{ agency }}
        </div>
      </div>
      <v-icon icon="mdi-chevron-right" class="ml-auto pl-2" />
    </router-link>

    <router-link :to="`/stops/${stopId}`" class="stop-link d-flex align-center pa-2">
      <v-icon icon="mdi-bus-stop" class="mr-3" />
      <div class="min-width-0">
        <div class="text-title-medium">
          {{ stopName || `Stop ${stopCode}` }}
        </div>
        <div v-if="stopName" class="text-body-small text-medium-emphasis">
          Stop {{ stopCode }}
        </div>
      </div>
      <v-icon icon="mdi-chevron-right" class="ml-auto pl-2" />
    </router-link>

    <v-card v-if="!isRail" variant="outlined" class="pa-3 mt-3">
      <StopDelayStats :route-id="routeId" :stop-id="stopId" />
    </v-card>

    <div class="day-picker d-flex align-center flex-wrap ga-2 mt-4">
      <DayPicker
        :model-value="selectedDate"
        :min="pickerMin"
        :max="pickerMax"
        :today="today"
        :allowed="isPickable"
        @update:model-value="pickDate"
      />
      <span v-if="arrivals.length" class="text-body-medium text-medium-emphasis">
        {{ arrivals.length }} {{ isRail ? (arrivals.length === 1 ? 'train' : 'trains') : (arrivals.length === 1 ? 'bus' : 'buses') }}
      </span>
    </div>

    <div v-if="isRail" class="d-flex align-center text-body-small text-medium-emphasis mt-2">
      <v-icon icon="mdi-calendar-clock" size="x-small" class="mr-1" />
      Scheduled, not live
    </div>
    <div v-else-if="estimating && arrivals.length" class="text-body-small text-medium-emphasis mt-2">
      Actual times are estimated from where the buses reported, as {{ isToday ? "today's" : "yesterday's" }} are worked out overnight.
    </div>
    <div v-else-if="noStoredTimes && arrivals.length" class="text-body-small text-medium-emphasis mt-2">
      No actual times here on this day.
    </div>

    <v-alert v-if="schedule.isError.value" type="error" variant="tonal" class="mt-3">
      The schedule for this stop could not be loaded.
    </v-alert>
    <div v-else-if="listLoading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <div v-else-if="!arrivals.length" class="text-medium-emphasis mt-3">
      {{ entries.length ? `No ${isRail ? 'trains' : 'buses'} stop here ${isToday ? 'today' : `on ${dayLabel}`}.` : `Route ${routeNumber(routeId)} doesn't stop here in the current schedule.` }}
    </div>
    <template v-else>
      <v-btn
        v-if="hiddenCount"
        block
        variant="text"
        color="primary"
        prepend-icon="mdi-chevron-up"
        class="mt-3"
        @click="showEarlier = true"
      >
        Show {{ hiddenCount }} earlier
      </v-btn>
      <v-card v-if="rows.length" variant="outlined" class="mt-3">
        <template v-for="(row, index) in rows" :key="row.key">
          <v-divider v-if="index > 0" />
          <router-link
            :to="{ path: `/trips/${row.entry.trip_id}`, query: { date: selectedDate } }"
            class="arrival-row d-flex align-start pa-3"
            :class="{ 'arrival-row--past': row.past, 'arrival-row--next': row.key === nextKey }"
          >
            <div class="flex-grow-1 min-width-0">
              <div class="text-title-medium">
                {{ row.scheduled }}
                <v-chip
                  v-if="row.key === nextKey"
                  size="x-small"
                  color="primary"
                  variant="tonal"
                  class="ml-1"
                >
                  Next
                </v-chip>
              </div>
              <div class="text-body-small text-medium-emphasis">
                <template v-if="row.headsign">
                  {{ row.headsign }} &middot;
                </template>
                Trip {{ row.entry.trip_id }}
              </div>
            </div>
            <div class="text-right flex-shrink-0 ml-2">
              <template v-if="row.actual">
                <div class="text-body-medium" :class="`text-${row.actual.status.color}`">
                  {{ estimating ? 'Actual ≈' : 'Actual' }} {{ row.actual.time }}
                </div>
                <v-chip :color="row.actual.status.color" size="x-small" variant="tonal">
                  {{ row.actual.status.label }}
                </v-chip>
              </template>
              <div v-else-if="row.soon !== null" class="text-body-medium text-medium-emphasis">
                {{ row.soon < 1 ? 'Due' : `in ${row.soon} min` }}
              </div>
              <div v-else-if="row.notSeen" class="text-body-small text-medium-emphasis">
                Not seen
              </div>
            </div>
          </router-link>
        </template>
      </v-card>
      <div v-else class="text-medium-emphasis mt-3">
        No more {{ isRail ? 'trains' : 'buses' }} today.
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.route-header,
.stop-link,
.arrival-row {
  color: inherit;
  text-decoration: none;
}

.route-header,
.stop-link {
  border-radius: 4px;
}

.route-header:hover,
.stop-link:hover,
.arrival-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

/* a bar in the line's colour, as on the stop page */
.route-header--line {
  border-left: 6px solid rgb(var(--v-theme-primary));
}

.arrival-row--past {
  opacity: 0.7;
}

.arrival-row--next {
  background: rgba(var(--v-theme-primary), 0.06);
}

.min-width-0 {
  min-width: 0;
}

/* on phones the day picker takes the full width */
@media (max-width: 599px) {
  .day-picker > :first-child {
    flex: 1 1 100%;
    justify-content: space-between;
  }

  .day-picker > :first-child > :deep(.v-btn:not(.v-btn--icon)) {
    flex: 1 1 auto;
  }
}
</style>
