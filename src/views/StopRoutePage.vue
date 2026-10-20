<script setup>
// @ts-check
import { useQueries, useQuery, useQueryClient } from '@tanstack/vue-query';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getActiveTripsByRouteId, getBusStopTimes, getRouteStopStats, getRouteStopTimes, getServiceDates, getStopRouteSchedule, getTrip, getTripRun, getTripsByRouteId } from '../api';
import { useStops } from '../composables/useStops';
import { useRoutes } from '../composables/useRoutes';
import { useRecordedTripsQuery } from '../composables/useRecordedTrips';
import { liveBusesQuery } from '../composables/useBuses';
import { usePageTitle } from '../composables/usePageTitle';
import { AVERAGE_SPEED_METRES_PER_SECOND, tripPath } from '../composables/useStopArrivals';
import { LOCAL_AGENCY, RAIL_ROUTE_TYPE, directionLabels, headsignWithoutRoute, routeColor, routeNumber } from '../utils/routes';
import { formatScheduledTime } from '../utils/busStatus';
import { actualStopTime, delaysByTrip } from '../utils/actualTimes';
import { typicalStatus } from '../utils/delayStats';
import { estimateStopArrivals } from '../utils/stopEstimates';
import { alongRouteMetres, distanceMetres, formatDistance } from '../utils/geo';
import { serviceDatesFrom, servicesOnDate } from '../utils/serviceCalendar';
import { edmontonNow, timeToSeconds } from '../utils/serviceTime';
import { approachTrack, arrivalsOnDate, commonShapeTrip, earlierCount, runDate, serviceDaySeconds, stopIndexOnTrip } from '../utils/stopRouteTimes';
import { addDays, formatDayLabel, isDateString } from '../utils/weeks';
import RouteBadge from '../components/RouteBadge.vue';
import DayPicker from '../components/DayPicker.vue';
import RouteStopStats from '../components/RouteStopStats.vue';
import StopPicker from '../components/StopPicker.vue';
import StopApproach from '../components/StopApproach.vue';

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
    return arrivalsOnDate(directionEntries.value, services, selectedDate.value);
});

const listLoading = computed(() => schedule.isLoading.value || (serviceIds.value.length > 0 && calendarLoading.value));

const routeInfo = computed(() => keyedroutes.value?.[props.routeId]);
const routeLongName = computed(() => entries.value[0]?.route_long_name ?? routeInfo.value?.route_long_name ?? handoff.routeLongName ?? '');
// LRT lines go by name and colour in Edmonton, not number, and aren't tracked live
const isRail = computed(() => (entries.value[0]?.route_type ?? routeInfo.value?.route_type) === RAIL_ROUTE_TYPE);

/**
 * The last value that wasn't empty. What's the same at every stop on the route, like the
 * heading and the direction, stays put while the next stop's schedule loads
 * @template T
 * @param {() => T} getter
 */
const lastKnown = (getter) => {
    const value = ref(getter());
    watch(getter, (next) => {
        if (next !== null && next !== '') value.value = next;
    });
    return value;
};

// where the route usually goes from here, as its name doesn't say the direction
const currentHeadsign = computed(() => {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const entry of arrivals.value.length ? arrivals.value : directionEntries.value) {
        if (entry.trip_headsign) counts.set(entry.trip_headsign, (counts.get(entry.trip_headsign) ?? 0) + 1);
    }
    const headsign = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
    return headsign ? headsignWithoutRoute(headsign, props.routeId) : '';
});

// the route's trips (shared with the route and trip pages) say which shape each runs, for
// the stop list and for working out today's times one shape at a time
const { data: routeTrips } = useQuery({
    queryKey: computed(() => ['route-trips', props.routeId]),
    queryFn: () => getTripsByRouteId(props.routeId),
});
const shapeByTrip = computed(() => new Map((routeTrips.value ?? []).map((trip) => [trip.trip_id, trip.shape_id])));

// --- direction ---

// the trips in the current feed (shared with the route page), so old schedules' headsigns
// don't name the directions
const { data: activeFeedTrips } = useQuery({
    queryKey: computed(() => ['active-feed-trips', props.routeId]),
    queryFn: () => getActiveTripsByRouteId(props.routeId),
    retry: false,
});
const activeTrips = computed(() => {
    const active = activeFeedTrips.value?.length ? new Set(activeFeedTrips.value.map((trip) => trip.trip_id)) : null;
    const seen = new Set();
    return (routeTrips.value ?? []).filter((trip) => {
        if (seen.has(trip.trip_id) || (active && !active.has(trip.trip_id))) return false;
        seen.add(trip.trip_id);
        return true;
    });
});
const directionByTrip = computed(() => new Map((routeTrips.value ?? []).map((trip) => [trip.trip_id, trip.direction_id])));
const directions = computed(() => [...new Set(activeTrips.value.map((trip) => trip.direction_id))].sort());
const directionNames = computed(() => Object.fromEntries(Object.entries(directionLabels(activeTrips.value))
    .map(([direction, headsign]) => [direction, headsignWithoutRoute(headsign, props.routeId)])));

// how many of the stop's visits go each way. Most stops only see one
const stopDirections = computed(() => {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const entry of entries.value) {
        const direction = directionByTrip.value.get(entry.trip_id);
        if (direction !== undefined) counts.set(direction, (counts.get(direction) ?? 0) + 1);
    }
    return counts;
});
// ?direction= picks one at a stop both directions use, like a terminal; otherwise the way
// most of its buses go. Null until the trips say
const direction = computed(() => {
    const asked = currentRoute.query.direction;
    if (typeof asked === 'string' && stopDirections.value.has(asked)) return asked;
    return [...stopDirections.value].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
});
const shownDirection = lastKnown(() => direction.value);
const directionEntries = computed(() => (direction.value === null
    ? entries.value
    : entries.value.filter((entry) => directionByTrip.value.get(entry.trip_id) === direction.value)));
const mainHeadsign = lastKnown(() => currentHeadsign.value);

const queryClient = useQueryClient();
/** @type {import('vue').Ref<string | null>} the direction whose stops are loading */
const switchingTo = ref(null);
const switchFailed = ref(false);
watch(() => props.stopId, () => {
    switchFailed.value = false;
});

// the other way goes from the stop nearest this one along its usual route, usually across the street
/** @param {string} target */
const pickDirection = async (target) => {
    if (target === direction.value || switchingTo.value) return;
    switchFailed.value = false;
    const query = { ...currentRoute.query, direction: target };
    if (stopDirections.value.has(target)) {
        router.replace({ query });
        return;
    }
    const tripId = commonShapeTrip(
        /** @type {any[]} */ (activeTrips.value.filter((trip) => trip.direction_id === target)),
        shapeByTrip.value,
    );
    const here = stop.value;
    if (!tripId || !here) {
        switchFailed.value = true;
        return;
    }
    switchingTo.value = target;
    try {
        const stopTimes = await queryClient.fetchQuery({
            queryKey: ['trip-stop-times', tripId],
            queryFn: () => getBusStopTimes(tripId),
            staleTime: Infinity,
        });
        const herePoint = [Number(here.stop_lat), Number(here.stop_lon)];
        let nearest = null;
        let nearestMetres = Infinity;
        for (const stopTime of stopTimes) {
            const info = keyedStops.value?.[stopTime.stop_id];
            if (!info) continue;
            const metres = distanceMetres(herePoint, [Number(info.stop_lat), Number(info.stop_lon)]);
            if (metres < nearestMetres) {
                nearest = stopTime.stop_id;
                nearestMetres = metres;
            }
        }
        if (nearest) {
            router.push({ path: `/stops/${encodeURIComponent(nearest)}/routes/${encodeURIComponent(props.routeId)}`, query });
        } else {
            switchFailed.value = true;
        }
    } catch {
        switchFailed.value = true;
    } finally {
        switchingTo.value = null;
    }
};

// the route's stops in order, along the shape most of its buses here take, to step
// between stops without going back to the stop page
const listTrip = lastKnown(() => commonShapeTrip(directionEntries.value, shapeByTrip.value));
const { data: listStopTimes } = useQuery({
    queryKey: computed(() => ['trip-stop-times', listTrip.value]),
    queryFn: () => getBusStopTimes(/** @type {string} */ (listTrip.value)),
    enabled: () => !!listTrip.value,
    staleTime: Infinity,
});
const routeStops = computed(() => (listStopTimes.value ?? []).map((stopTime) => {
    const info = keyedStops.value?.[stopTime.stop_id];
    return { stop_id: stopTime.stop_id, name: info?.stop_name ?? `Stop ${stopTime.stop_id}`, code: info?.stop_code ?? stopTime.stop_id };
}));
// the visit most of the day's buses make, for a loop passing the stop twice
const usualSeq = computed(() => {
    /** @type {Map<string, number>} */
    const counts = new Map();
    for (const entry of directionEntries.value) counts.set(entry.stop_sequence, (counts.get(entry.stop_sequence) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
});
const routeStopIndex = computed(() => stopIndexOnTrip(listStopTimes.value ?? [], props.stopId, usualSeq.value));

/** @param {string} stopId */
const openStop = (stopId) => {
    // a new page in history, so back returns to the last stop, like stepping between trips
    router.push({ path: `/stops/${encodeURIComponent(stopId)}/routes/${encodeURIComponent(props.routeId)}`, query: currentRoute.query });
};

const stopName = computed(() => stop.value?.stop_name ?? '');
const stopCode = computed(() => stop.value?.stop_code ?? props.stopId);

usePageTitle(() => [
    isRail.value ? routeLongName.value : `Route ${routeNumber(props.routeId)}`,
    stopName.value ? `${stopName.value} · Stop ${stopCode.value}` : `Stop ${stopCode.value}`,
]);

// the whole route's last week here. Regional routes share ids with ETS ones, and the
// backend doesn't tell agencies apart, so they get none
const showStats = computed(() => !isRail.value && agency.value === LOCAL_AGENCY);
const routeStats = useQuery({
    queryKey: computed(() => ['route-stop-stats', props.routeId, props.stopId, null]),
    queryFn: () => getRouteStopStats(props.routeId, props.stopId),
    enabled: showStats,
    // worked out nightly, so there's nothing new to fetch for a while
    staleTime: 60 * 60 * 1000,
});

// the chip only shows once there's a week to sum up, like on the stop page
const hasStats = computed(() => showStats.value
    && !!routeStats.data.value?.count && routeStats.data.value.mean !== null);
const typical = computed(() => typicalStatus(routeStats.data.value?.mean ?? 0));
const statsOpen = ref(false);

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

// the trips we recorded on the day, both to work out today's times and to tell a bus we
// tracked but didn't place at the stop from one we never tracked
const recorded = useRecordedTripsQuery(() => props.routeId, () => (isRail.value || isFuture.value ? null : selectedDate.value));
const recordedTripIds = recorded.ids;
// a trip starting after midnight is filed under the next day
const lateArrivals = computed(() => arrivals.value.some((entry) => timeToSeconds(entry.arrival_time) >= 24 * 60 * 60));
const recordedNextDay = useRecordedTripsQuery(() => props.routeId, () => (
    !isRail.value && lateArrivals.value && addDays(selectedDate.value, 1) <= today ? addDays(selectedDate.value, 1) : null));

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
            // the bus's positions after the run can still time the stops it switched trips before
            const positions = [...(query.state.data?.positions ?? []), ...(query.state.data?.after ?? [])];
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
        const run = runQueries.value[index]?.data;
        const positions = run?.positions;
        if (!positions?.length) return;
        const coords = place.shape.stops.slice(0, place.index + 1).map((stopTime) => {
            const info = keyedStops.value?.[stopTime.stop_id];
            return info ? { lat: info.stop_lat, lon: info.stop_lon } : null;
        });
        const passedAt = estimateStopArrivals(coords, positions, place.shape.path, run)[place.index];
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

// --- estimated times for buses on the way, today ---

// worked out like the stop page's, from how far the bus has left to go along its route
const liveBuses = useQuery({ ...liveBusesQuery, enabled: () => isToday.value && !isRail.value });
const liveByTrip = computed(() => {
    const trips = new Set(shownArrivals.value.map((entry) => entry.trip_id));
    /** @type {Map<string, import('../api').Bus>} */
    const map = new Map();
    for (const bus of isToday.value ? liveBuses.data.value ?? [] : []) {
        if (trips.has(String(bus.trip))) map.set(String(bus.trip), bus);
    }
    return map;
});
const liveTripIds = computed(() => [...liveByTrip.value.keys()]);
// the trip page's key, so the lines are shared
const liveShapeQueries = useQueries({
    queries: computed(() => liveTripIds.value.map((tripId) => ({
        queryKey: ['trip-shape', tripId],
        queryFn: () => getTrip(tripId),
        staleTime: Infinity,
    }))),
});

/**
 * Each bus on the way here, by trip and stop_sequence: how late it should be in seconds,
 * and where it is along its route line
 * @type {import('vue').ComputedRef<Map<string, {delay: number, bus: import('../api').Bus, path: [number, number][], busAlong: number, remaining: number}>>}
 */
const liveApproaches = computed(() => {
    const delays = new Map();
    if (!stop.value) return delays;
    const stopPoint = [Number(stop.value.stop_lat), Number(stop.value.stop_lon)];
    liveTripIds.value.forEach((tripId, index) => {
        const bus = /** @type {import('../api').Bus} */ (liveByTrip.value.get(tripId));
        const path = tripPath(liveShapeQueries.value[index]?.data);
        const stopAlong = alongRouteMetres(path, stopPoint);
        const busAlong = alongRouteMetres(path, [bus.lat, bus.long]);
        if (!stopAlong || !busAlong) return;
        const remaining = stopAlong.along - busAlong.along;
        if (remaining < 0) return;
        // a loop passes twice, so it's the first visit without a time yet
        const entry = shownArrivals.value.find((visit) =>
            visit.trip_id === tripId && !estimatedDelays.value.has(`${visit.trip_id}|${visit.stop_sequence}`));
        if (!entry) return;
        // the bus has kept moving since it reported, and can't get here before now
        const arrival = Math.max(bus.timestamp + remaining / AVERAGE_SPEED_METRES_PER_SECOND, nowSeconds.value);
        delays.set(`${entry.trip_id}|${entry.stop_sequence}`, {
            delay: serviceDaySeconds(arrival, selectedDate.value) - timeToSeconds(entry.arrival_time),
            bus,
            path,
            busAlong: busAlong.along,
            remaining,
        });
    });
    return delays;
});

/**
 * The buses on a trip: the live one on it today, else the ones we recorded on it
 * @param {import('../api').StopScheduleEntry} entry
 * @returns {Array<number|string>}
 */
const busesFor = (entry) => {
    const live = liveByTrip.value.get(entry.trip_id);
    if (live) return [live.bus];
    const late = timeToSeconds(entry.arrival_time) >= 24 * 60 * 60;
    return recorded.busesByTrip.value.get(entry.trip_id)
        ?? (late ? recordedNextDay.busesByTrip.value.get(entry.trip_id) : undefined)
        ?? [];
};

/**
 * Whether we recorded the run of a bus with no time here, or null when it's not known yet
 * @param {import('../api').StopScheduleEntry} entry
 */
const wasTracked = (entry) => {
    if (storedDelays.value.has(entry.trip_id) || recordedTripIds.value.has(entry.trip_id)) return true;
    if (timeToSeconds(entry.arrival_time) >= 24 * 60 * 60 && recordedNextDay.ids.value.has(entry.trip_id)) return true;
    if (!recorded.isSuccess.value) return null;
    if (lateArrivals.value && addDays(selectedDate.value, 1) <= today && !recordedNextDay.isSuccess.value) return null;
    return false;
};

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
        const liveDelay = actual ? undefined : liveApproaches.value.get(key)?.delay;
        const estimate = liveDelay === undefined ? null : actualStopTime(entry.arrival_time, liveDelay);
        const notSeen = !actual && !estimate && !isRail.value && due < -NOT_SEEN_SECONDS && !timePending(entry);
        const headsign = headsignWithoutRoute(entry.trip_headsign || '', props.routeId);
        return {
            key,
            entry,
            scheduled: formatScheduledTime(entry.arrival_time),
            headsign: headsign && headsign !== mainHeadsign.value ? headsign : null,
            actual: actual ? { time: formatScheduledTime(actual.time), status: actual.status } : null,
            estimate: estimate && liveDelay !== undefined
                ? { time: formatScheduledTime(estimate.time), status: estimate.status, minutes: Math.max(0, Math.round((due + liveDelay) / 60)) }
                : null,
            // only today, as other days' buses are either all to come or all gone
            soon: isToday.value && due >= 0 && due <= SOON_SECONDS ? Math.round(due / 60) : null,
            notSeen,
            // null while the day's recorded trips load
            tracked: notSeen ? wasTracked(entry) : null,
            // a late bus still on its way isn't gone yet
            past: isToday.value && due < 0 && !estimate,
            upcoming: isFuture.value || (isToday.value && due >= 0),
            buses: isRail.value ? [] : busesFor(entry),
        };
    });
});

// the first bus still to come today, picked out in the list
const nextKey = computed(() => (isToday.value ? rows.value.find((row) => !row.past)?.key ?? null : null));

// why there are no actual times, when there aren't any for a past day
const noStoredTimes = computed(() =>
    !estimating.value && !isRail.value && selectedDate.value < today && storedTimes.isSuccess.value
    && !arrivals.value.some((entry) => storedDelays.value.get(entry.trip_id)?.has(Number(entry.stop_sequence))));

// --- a bus's details, opened from its row ---

/** @type {import('vue').Ref<string | null>} */
const openKey = ref(null);
watch([() => props.stopId, selectedDate], () => {
    openKey.value = null;
});
/** @param {string} key */
const toggleRow = (key) => {
    openKey.value = openKey.value === key ? null : key;
};

const openRow = computed(() => rows.value.find((row) => row.key === openKey.value) ?? null);
const openApproach = computed(() => (openKey.value ? liveApproaches.value.get(openKey.value) ?? null : null));
// the trip page's key, so the stops are shared
const { data: openStopTimes } = useQuery({
    queryKey: computed(() => ['trip-stop-times', openRow.value?.entry.trip_id ?? null]),
    queryFn: () => getBusStopTimes(/** @type {NonNullable<typeof openRow.value>} */ (openRow.value).entry.trip_id),
    enabled: () => !!openApproach.value,
    staleTime: Infinity,
});
// the stops the bus has left before this one, and where it is among them
const openDiagram = computed(() => {
    const approach = openApproach.value;
    const row = openRow.value;
    if (!approach || !row || !openStopTimes.value) return null;
    const here = openStopTimes.value.findIndex((stopTime) => stopTime.stop_sequence === row.entry.stop_sequence);
    if (here === -1) return null;
    const stops = openStopTimes.value.slice(0, here + 1).flatMap((stopTime) => {
        const info = keyedStops.value?.[stopTime.stop_id];
        const along = info ? alongRouteMetres(approach.path, [Number(info.stop_lat), Number(info.stop_lon)]) : null;
        return info && along ? [{ name: info.stop_name, along: along.along }] : [];
    });
    return approachTrack(stops, approach.busAlong);
});

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

    <!-- which way along the route, as the stops on either side of the street differ -->
    <v-btn-toggle
      v-if="directions.length > 1 && shownDirection !== null"
      :model-value="shownDirection"
      mandatory
      color="primary"
      variant="outlined"
      divided
      density="comfortable"
      class="direction-toggle mt-3"
      @update:model-value="pickDirection"
    >
      <v-btn
        v-for="dir in directions"
        :key="dir"
        :value="dir"
        :loading="switchingTo === dir"
        class="text-none"
      >
        <span class="direction-label">To {{ directionNames[dir] }}</span>
      </v-btn>
    </v-btn-toggle>
    <div v-if="switchFailed" class="text-body-small text-error mt-1">
      The stops the other way could not be loaded.
    </div>

    <!-- step along the route's stops, or pick one from the list -->
    <StopPicker
      :stops="routeStops"
      :index="routeStopIndex"
      :name="stopName || `Stop ${stopCode}`"
      :code="stopCode"
      class="mt-2"
      @select="openStop"
    />
    <!-- the picker switches stops on this route, so the stop's own page is a link of its own -->
    <div class="d-flex justify-center">
      <v-btn
        :to="`/stops/${stopId}`"
        variant="text"
        size="small"
        color="primary"
        prepend-icon="mdi-bus-stop"
        class="text-none"
      >
        All routes at this stop
      </v-btn>
    </div>

    <!-- a week's delays fold into one chip, opened for the histogram -->
    <div v-if="hasStats" class="mt-3">
      <v-chip
        tag="button"
        type="button"
        :color="typical.color"
        size="small"
        variant="tonal"
        :append-icon="statsOpen ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        :aria-expanded="statsOpen"
        :aria-label="`Usually ${typical.label.toLowerCase()} here. ${statsOpen ? 'Hide' : 'Show'} last week's delays`"
        @click="statsOpen = !statsOpen"
      >
        Usually {{ typical.label.toLowerCase() }}
      </v-chip>
      <v-expand-transition>
        <v-card v-if="statsOpen" variant="outlined" class="pa-3 mt-2">
          <RouteStopStats :stats="routeStats.data.value" />
        </v-card>
      </v-expand-transition>
    </div>

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
      <template v-if="isToday">
        Buses on the way show when they should get here.
      </template>
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
          <!-- tapping a bus opens its details under it -->
          <div
            role="button"
            tabindex="0"
            :aria-expanded="openKey === row.key"
            class="arrival-row d-flex align-start pa-3"
            :class="{ 'arrival-row--past': row.past, 'arrival-row--next': row.key === nextKey }"
            @click="toggleRow(row.key)"
            @keydown.enter.space.prevent="toggleRow(row.key)"
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
              <template v-else-if="row.estimate">
                <div class="text-body-medium" :class="`text-${row.estimate.status.color}`">
                  Est. {{ row.estimate.time }}
                </div>
                <div class="d-flex align-center justify-end ga-1">
                  <span class="text-body-small text-medium-emphasis">{{ row.estimate.minutes < 1 ? 'Due' : `in ${row.estimate.minutes} min` }}</span>
                  <v-chip :color="row.estimate.status.color" size="x-small" variant="tonal">
                    {{ row.estimate.status.label }}
                  </v-chip>
                </div>
              </template>
              <div v-else-if="row.soon !== null" class="text-body-medium text-medium-emphasis">
                {{ row.soon < 1 ? 'Due' : `in ${row.soon} min` }}
              </div>
              <!-- a bus we tracked that wasn't placed here, apart from one we never tracked -->
              <template v-else-if="row.notSeen">
                <div class="text-body-small text-medium-emphasis">
                  {{ row.tracked === false ? 'Not tracked' : 'Not seen here' }}
                </div>
                <div v-if="row.tracked" class="text-body-small text-medium-emphasis">
                  Trip was tracked
                </div>
              </template>
            </div>
          </div>
          <v-expand-transition>
            <div v-if="openKey === row.key" class="arrival-details px-3 pb-3" :class="{ 'arrival-row--next': row.key === nextKey }">
              <!-- a bus on its way: how far off, and a line of the stops it has left -->
              <template v-if="openDiagram && openApproach">
                <div class="text-body-medium">
                  {{ openDiagram.stopsAway === 1 ? 'Next stop' : `${openDiagram.stopsAway} stops away` }} &middot; {{ formatDistance(openApproach.remaining) }}
                </div>
                <StopApproach
                  :names="openDiagram.names"
                  :bus="openDiagram.bus"
                  :label="`The bus is ${openDiagram.stopsAway === 1 ? '1 stop' : `${openDiagram.stopsAway} stops`} from this stop${openDiagram.bus > 0 ? `, past ${openDiagram.names[Math.floor(openDiagram.bus)]}` : ''}`"
                  class="mt-2"
                />
              </template>
              <div class="d-flex align-center flex-wrap ga-2 mt-2">
                <template v-if="!isRail">
                  <v-chip
                    v-for="bus in row.buses"
                    :key="bus"
                    :to="`/buses/${bus}`"
                    size="small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-bus"
                  >
                    Bus {{ bus }}
                  </v-chip>
                  <span v-if="!row.buses.length" class="text-body-small text-medium-emphasis">
                    {{ row.upcoming ? 'No bus on this trip yet' : 'No bus recorded on this trip' }}
                  </span>
                </template>
                <v-btn
                  :to="{ path: `/trips/${row.entry.trip_id}`, query: { date: selectedDate } }"
                  variant="text"
                  size="small"
                  color="primary"
                  append-icon="mdi-chevron-right"
                  class="text-none ml-auto"
                >
                  Trip details
                </v-btn>
              </div>
            </div>
          </v-expand-transition>
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
.arrival-row {
  color: inherit;
  text-decoration: none;
}

.route-header {
  border-radius: 4px;
}

.route-header:hover,
.arrival-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

/* a bar in the line's colour, as on the stop page */
.route-header--line {
  border-left: 6px solid rgb(var(--v-theme-primary));
}

.arrival-row {
  cursor: pointer;
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

/* long headsigns share the width instead of pushing past the screen edge, as on the route page */
.direction-toggle {
  max-width: 100%;
  width: 100%;
}

.direction-toggle .v-btn {
  flex: 1 1 0;
  min-width: 0;
}

.direction-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

/* on phones the directions stack, so a long headsign gets the full width */
@media (max-width: 599px) {
  .direction-toggle {
    flex-direction: column;
    height: auto;
  }

  .direction-toggle .v-btn {
    flex: 0 0 auto;
    min-height: 44px;
    width: 100%;
  }

  .direction-toggle .v-btn :deep(.v-btn__content) {
    white-space: normal;
  }

  .direction-toggle.v-btn-group--divided .v-btn:not(:last-child) {
    border-inline-end-width: 0;
    border-bottom-width: thin;
  }
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
