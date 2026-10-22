<script setup>
// @ts-check
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { getBusRecentTrips, getRecentTripData, getServiceDates, getTrip, getTripRun, getTripStartTimes, getTripsByRouteId, getBusStopTimes, getStopRoutes } from '../api';
import { useStops } from '../composables/useStops';
import { useRoutes } from '../composables/useRoutes';
import { useRecordedTrips } from '../composables/useRecordedTrips';
import { usePageTitle } from '../composables/usePageTitle';
import { useBusTrip } from '../composables/useBusTrip';
import { liveBusesQuery } from '../composables/useBuses';
import { useNowLocal, useServiceAlerts } from '../composables/useServiceAlerts';
import { edmontonNow, scheduledEpochsNear, scheduledSecondsNear, serviceRunsOnDay, timeToSeconds, weekdayOf } from '../utils/serviceTime';
import { alertsForTrip, edmontonLocal, effectLabel } from '../utils/serviceAlerts';
import { LOCAL_AGENCY, RAIL_ROUTE_TYPE, headsignWithoutRoute, routeColor, routeNumber } from '../utils/routes';
import { NO_TIMES_HEX, STATUS_HEX, formatScheduledTime, scheduleStatus } from '../utils/busStatus';
import RouteBadge from '../components/RouteBadge.vue';
import TransitMap from '../components/TransitMap.vue';
import BusLink from '../components/BusLink.vue';
import PositionRow from '../components/PositionRow.vue';
import ServiceAlertCard from '../components/ServiceAlertCard.vue';
import DayPicker from '../components/DayPicker.vue';
import TripPicker from '../components/TripPicker.vue';
import StopDelayStats from '../components/StopDelayStats.vue';
import { summarizeDelays, typicalStatus } from '../utils/delayStats';
import { busTripNeighbours } from '../utils/busTrips';
import { tripPath } from '../composables/useStopArrivals';
import { estimateStopArrivals } from '../utils/stopEstimates';
import { schedulePeriod, serviceDatesFrom, servicesOnDate } from '../utils/serviceCalendar';
import { nearestByStart, sortByStart, tripsOnDate } from '../utils/dayTrips';
import { chunk } from '../utils/chunk';
import { edmontonDate, formatClockTime, formatClockTimeWithSeconds } from '../utils/tripTimes';
import { compassPoint, groupPositions, nearestStop } from '../utils/positions';
import { prefersReducedMotion } from '../utils/viewTransition';
import { addDays, formatDayLabel, isDateString } from '../utils/weeks';
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch, watchEffect } from 'vue';
import { useRoute, useRouter } from 'vue-router';

/** @typedef {import('../api/index').BusStopTime} BusStopTime */


const ACTIVE_TRIP_STALE_SECONDS = 300;
// the bus pin shows while the trip runs and for a while after, then it's just history
const RECENT_RUN_SECONDS = 600;
// a position this close to a stop is said to be at it
const NEAR_STOP_METRES = 150;
// reports come about every 30 s, so a longer wait means positions are missing
const POSITION_GAP_SECONDS = 120;
// positions this close together read as the bus staying put, so they share a row
const GROUP_POSITION_METRES = 50;
// how far back the picker goes, about as far as the backend keeps positions
const PAST_DAYS = 366;
// how far ahead the picker goes when the calendar can't be loaded
const FALLBACK_FUTURE_DAYS = 60;

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

/**
 * A run's positions and its bus's positions after it
 * @param {import('../api').TripRun | undefined} run
 */
const runAndAfter = (run) => [...(run?.positions ?? []), ...(run?.after ?? [])];

const props = defineProps({
    tripId: {
        type: [String, Number],
        required: true,
    }
})

const { keyedStops } = useStops();
const { keyedroutes } = useRoutes();

const router = useRouter();
const currentRoute = useRoute();

const today = edmontonNow().dateString;

/** @param {unknown} value */
const dateFromQuery = (value) => (isDateString(value) ? value : null);

// the day whose run is shown, from ?date=. Without one the latest recorded run is shown
/** @type {import('vue').Ref<string | null>} */
const selectedDate = ref(dateFromQuery(currentRoute.query.date));

// back and forward change the query without remounting the page
watch(() => currentRoute.query.date, (date) => {
    selectedDate.value = dateFromQuery(date);
});

/** @param {unknown} value */
const viewFromQuery = (value) => (value === 'positions' ? 'positions' : 'stops');

// the list under the map: the scheduled stops, or the positions recorded on the run
const view = ref(viewFromQuery(currentRoute.query.view));
watch(() => currentRoute.query.view, (value) => {
    view.value = viewFromQuery(value);
});

/** @param {string} value */
const pickView = (value) => {
    view.value = viewFromQuery(value);
    router.replace({ query: { ...currentRoute.query, view: view.value === 'positions' ? 'positions' : undefined } });
};

// kept when going to another trip, so the user stays in the view they picked
const viewQuery = () => (view.value === 'positions' ? { view: 'positions' } : {});

// set by picking a day, until this trip is known to run then or the nearest one has been opened
const jumpPending = ref(false);

/** @param {string} date */
const pickDate = (date) => {
    selectedDate.value = date;
    jumpPending.value = true;
    router.replace({ query: { ...currentRoute.query, date } });
};

/** @param {string} id */
const openTrip = (id) => {
    router.push({ path: `/trips/${encodeURIComponent(id)}`, query: { date: pickerDate.value, ...viewQuery() } });
};

// a day still to come only has its schedule
const isFuture = computed(() => !!selectedDate.value && selectedDate.value > today);

// switching trip or day keeps the last data on screen (placeholderData) until the new data
// arrives. `switching` below says which parts are still the old ones
const latestEnabled = computed(() => !!props.tripId && !selectedDate.value);
const runEnabled = computed(() => !!props.tripId && !!selectedDate.value && !isFuture.value);

const { data, error: latestError, isLoading: latestLoading, isPlaceholderData: latestPlaceholder } = useQuery({
    queryKey: computed(() => ['trip', props.tripId]),
    queryFn: () => getRecentTripData(props.tripId),
    enabled: latestEnabled,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
        const tripPoints = /** @type {Array<{timestamp:number}> | undefined} */ (query.state.data);
        return isTripCurrentlyActive(tripPoints) ? 60000 : false;
    },
    refetchIntervalInBackground: true,
})

const { data: runData, error: runError, isLoading: runLoading, isPlaceholderData: runPlaceholder } = useQuery({
    queryKey: computed(() => ['trip-run', props.tripId, selectedDate.value]),
    queryFn: () => getTripRun(props.tripId, /** @type {string} */ (selectedDate.value)),
    enabled: runEnabled,
    placeholderData: keepPreviousData,
    // a day with no run won't gain one on a retry
    retry: (count, error) => /** @type {any} */ (error).status !== 404 && count < 3,
    // a run that started yesterday can still be going past midnight
    staleTime: () => (selectedDate.value && selectedDate.value < addDays(today, -1) ? Infinity : 0),
    // the bus's positions after the run can still time the stops it switched trips before
    refetchInterval: (query) => (isTripCurrentlyActive(runAndAfter(query.state.data)) ? 60000 : false),
    refetchIntervalInBackground: true,
})

const runMissing = computed(() => /** @type {any} */ (runError.value)?.status === 404);
const isLoading = computed(() => (selectedDate.value ? !isFuture.value && runLoading.value : latestLoading.value));
const error = computed(() => (selectedDate.value ? (runMissing.value ? null : runError.value) : latestError.value));

// the bus cards share these keys, so coming from one the heading and map show straight away
const { data: tripData, isLoading: tripLoading, isPlaceholderData: tripPlaceholder } = useQuery({
    queryKey: computed(() => ['trip-shape', props.tripId]),
    queryFn: () => getTrip(props.tripId),
    enabled: () => !!props.tripId,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
})

// route data is a list of stops along this trip
const { data: routeData, isPlaceholderData: stopsPlaceholder } = useQuery({
    queryKey: computed(() => ['trip-stop-times', props.tripId]),
    queryFn: () => getBusStopTimes(props.tripId),
    enabled: () => !!props.tripId,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
})

// part of what's shown is still the last trip's or day's. The pieces that depend on it wait,
// while the route header, pickers and map stay
// the headsign, e.g. "8 University", leads as it says more than the trip id. a
// placeholder is the previous trip's, so it's left out
usePageTitle(() => [tripPlaceholder.value ? null : tripData.value?.trip_headsign, `Trip ${props.tripId}`]);

const switching = computed(
    () => tripPlaceholder.value
        || stopsPlaceholder.value
        || (latestEnabled.value && latestPlaceholder.value)
        || (runEnabled.value && runPlaceholder.value),
);

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

/** @param {Array<{timestamp: number}>} positions */
const latestTimestamp = (positions) => positions.reduce((max, position) => Math.max(max, position.timestamp), 0);

// the positions of the run being shown: the picked day's, or the latest recorded one
const runPositions = computed(() => {
    if (selectedDate.value) return isFuture.value ? [] : runData.value?.positions ?? [];
    // positions come newest first, so pick the run by its times rather than its place
    return groupedTripData.value.reduce(
        (latest, group) => (latestTimestamp(group) > latestTimestamp(latest) ? group : latest),
        /** @type {typeof groupedTripData.value[number]} */ ([]),
    );
});

const latestTripPoint = computed(() =>
    runPositions.value.reduce(
        (latest, position) => (!latest || position.timestamp >= latest.timestamp ? position : latest),
        /** @type {typeof runPositions.value[number] | null} */ (null),
    ),
);

// the day the latest run started, or today before the trip has been recorded
const latestRunDate = computed(() => {
    const first = runPositions.value.reduce((min, position) => Math.min(min, position.timestamp), Infinity);
    return Number.isFinite(first) ? edmontonDate(first) : today;
});

const pickerDate = computed(() => selectedDate.value ?? latestRunDate.value);
const pickerDateLabel = computed(() => formatDayLabel(pickerDate.value, today));

// the route's trips share the route page's key. They give the other trips of the day
const routeId = computed(() => tripData.value?.route_id ?? '');
const { data: routeTrips } = useQuery({
    queryKey: computed(() => ['route-trips', routeId.value]),
    queryFn: () => getTripsByRouteId(routeId.value),
    enabled: () => !!routeId.value,
});

const routeServiceIds = computed(() => [...new Set((routeTrips.value ?? []).map((trip) => trip.service_id))].sort());

// same key as the route page, so it can share the cache
const { data: serviceDateRows } = useQuery({
    queryKey: computed(() => ['service-dates', routeId.value, routeServiceIds.value.join(',')]),
    queryFn: () => getServiceDates(routeServiceIds.value),
    enabled: () => routeServiceIds.value.length > 0,
    staleTime: Infinity,
});

// null if the calendar couldn't be loaded
const serviceDates = computed(() => (serviceDateRows.value?.length ? serviceDatesFrom(serviceDateRows.value) : null));

// sorted dates the route runs, or null without the calendar
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

// the services running on the picked day. Without calendar dates for it, the days in each
// service_id, within this trip's schedule period
const dayServices = computed(() => {
    const date = pickerDate.value;
    const running = serviceDates.value ? servicesOnDate(serviceDates.value, date) : new Set();
    if (running.size) return running;
    const period = schedulePeriod(tripData.value?.service_id ?? '');
    return new Set(
        routeServiceIds.value.filter(
            (id) => schedulePeriod(id) === period && serviceRunsOnDay(id, weekdayOf(date)),
        ),
    );
});

const dayTripIds = computed(() =>
    tripsOnDate(routeTrips.value ?? [], dayServices.value, tripData.value?.direction_id ?? '').map((trip) => trip.trip_id),
);

const { data: dayStartTimes, isLoading: dayTripsLoading } = useQuery({
    queryKey: computed(() => ['trip-start-times', dayTripIds.value.join(',')]),
    queryFn: async () => (await Promise.all(chunk(dayTripIds.value, 200).map(getTripStartTimes))).flat(),
    enabled: () => dayTripIds.value.length > 0,
    staleTime: Infinity,
});

const dayTrips = computed(() => sortByStart(dayTripIds.value, dayStartTimes.value ?? []));

// the route's trips we recorded on the picked day, marked in the trip picker
const recordedTripIds = useRecordedTrips(routeId, pickerDate);

// picking a day on which this trip doesn't run goes to the trip starting nearest to it
watch([jumpPending, dayTrips, dayTripsLoading, routeData], () => {
    if (!jumpPending.value || dayTripsLoading.value || !routeTrips.value || !routeData.value) return;
    if (dayStartTimes.value === undefined && dayTripIds.value.length) return;
    jumpPending.value = false;
    if (dayTrips.value.some((trip) => trip.trip_id === String(props.tripId))) return;
    const first = routeData.value[0];
    const start = first?.departure_time || first?.arrival_time;
    const nearest = start ? nearestByStart(dayTrips.value, start) : null;
    if (nearest) router.replace({ path: `/trips/${encodeURIComponent(nearest.trip_id)}`, query: { date: pickerDate.value, ...viewQuery() } });
});

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
 * Returns the difference in seconds between estimated and scheduled arrival.
 * Negative = early, positive = late.
 * @param {BusStopTime} stop
 * @param {number | null} estimatedEpoch
 * @returns {number|null}
 */
function getDelaySeconds(stop, estimatedEpoch) {
    if (estimatedEpoch === null) return null;
    if (!stop.arrival_time) return null;
    // compare in Edmonton time, as the viewer's midnight can be hours off the schedule's
    const estimatedSeconds = edmontonNow(new Date(estimatedEpoch * 1000)).secondsSinceMidnight;
    const scheduledSeconds = scheduledSecondsNear(stop.arrival_time, estimatedSeconds);
    return estimatedSeconds - scheduledSeconds;
}

// a loop can visit the same stop twice, so rows are told apart by their sequence
/** @type {import('vue').Ref<string | null>} */
const expandedSequence = ref(null);

// another trip has other stops
watch(() => props.tripId, () => {
    expandedSequence.value = null;
});

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

// this trip's or the whole route's week at the expanded stop, kept while opening other stops
const statsScope = ref('trip');

// a loop passes some stops twice, so the route's stats for them only count this visit
const repeatedStopIds = computed(() => {
    const seen = new Set();
    const repeated = new Set();
    for (const stop of routeData.value ?? []) {
        if (seen.has(stop.stop_id)) repeated.add(stop.stop_id);
        seen.add(stop.stop_id);
    }
    return repeated;
});

const otherRoutes = computed(() =>
    (stopRoutes.value ?? []).filter((route) => route.route_id !== tripData.value?.route_id),
);

// disruptions in effect at some point while this trip runs on the picked day
const serviceAlerts = useServiceAlerts();
const nowLocal = useNowLocal();

const tripAlerts = computed(() => {
    const stops = routeData.value ?? [];
    const first = stops[0];
    const last = stops.at(-1);
    const firstTime = first?.departure_time || first?.arrival_time;
    const lastTime = last?.arrival_time || last?.departure_time;
    if (!tripData.value?.route_id || !firstTime || !lastTime) return { alerts: [], affectedStops: new Map() };
    return alertsForTrip(
        serviceAlerts.value,
        tripData.value.route_id,
        new Set(stops.map((stop) => stop.stop_id)),
        edmontonLocal(pickerDate.value, timeToSeconds(firstTime)),
        edmontonLocal(pickerDate.value, timeToSeconds(lastTime)),
    );
});

// the disruptions naming each stop, shown when its row is opened
const stopAlerts = computed(() => {
    /** @type {Map<string, typeof tripAlerts.value.alerts>} */
    const byStop = new Map();
    for (const timing of tripAlerts.value.alerts) {
        for (const stopId of timing.alert.stopIds) {
            byStop.set(stopId, [...(byStop.get(stopId) ?? []), timing]);
        }
    }
    return byStop;
});

const stopCoords = computed(() => (routeData.value ?? []).map((stop) => {
    const stopInfo = keyedStops.value?.[stop.stop_id];
    return stopInfo ? { lat: stopInfo.stop_lat, lon: stopInfo.stop_lon } : null;
}));

// when the run was due at each stop, so a run that went round a loop twice is timed on the right lap
const scheduledEpochs = computed(() => {
    const start = runPositions.value.reduce((min, position) => Math.min(min, position.timestamp), Infinity);
    return Number.isFinite(start) ? scheduledEpochsNear((routeData.value ?? []).map((stop) => stop.arrival_time), start) : [];
});

// the latest run (without ?date=) doesn't come with its bus's positions either side of it.
// When a stop at either end has no time without them, they're fetched with the run's day,
// on the key a picked day uses. At the end that's once the run has stopped, as when the bus
// took its next trip's id a few stops early
const latestRunGaps = computed(() => {
    if (selectedDate.value || !runPositions.value.length || !stopCoords.value.length) return false;
    const estimates = estimateStopArrivals(stopCoords.value, runPositions.value, tripPath(tripData.value), {}, scheduledEpochs.value);
    return estimates[0] === null || (estimates.at(-1) === null && !isTripCurrentlyActive(runPositions.value));
});
const { data: latestRunData } = useQuery({
    queryKey: computed(() => ['trip-run', props.tripId, latestRunDate.value]),
    queryFn: () => getTripRun(props.tripId, latestRunDate.value),
    enabled: latestRunGaps,
    retry: (count, error) => /** @type {any} */ (error).status !== 404 && count < 3,
    staleTime: () => (latestRunDate.value < addDays(today, -1) ? Infinity : 0),
    refetchInterval: (query) => (isTripCurrentlyActive(runAndAfter(query.state.data)) ? 60000 : false),
    refetchIntervalInBackground: true,
});

// the bus's positions just before and after the run being shown
const runNeighbours = computed(() => {
    if (selectedDate.value) return runData.value;
    const run = latestRunData.value;
    // only when it's the same run. The latest run's positions come newest first
    const start = runPositions.value.reduce((min, position) => Math.min(min, position.timestamp), Infinity);
    return latestRunGaps.value && run?.start === start ? run : undefined;
});

// worked out once per render, as the estimates follow the run's positions along the route shape
const stopRows = computed(() => {
    const stops = routeData.value ?? [];
    const estimates = estimateStopArrivals(
        stopCoords.value,
        runPositions.value,
        tripPath(tripData.value),
        runNeighbours.value,
        scheduledEpochs.value,
    );
    return stops.map((stop, index) => {
        const stopInfo = keyedStops.value?.[stop.stop_id];
        const estimatedEpoch = estimates[index];
        const delaySeconds = getDelaySeconds(stop, estimatedEpoch);
        return {
            stop,
            stopInfo,
            name: stopInfo?.stop_name || stop.stop_id,
            code: stopInfo?.stop_code || stop.stop_id,
            scheduled: formatScheduledTime(stop.arrival_time),
            estimated: convertUnixEpochToTime(estimatedEpoch),
            delaySeconds,
            status: delaySeconds === null ? null : scheduleStatus(Math.round(delaySeconds / 60)),
            // a closed or moved stop, named by a disruption
            disruption: tripAlerts.value.affectedStops.has(stop.stop_id)
                ? effectLabel(/** @type {string} */ (tripAlerts.value.affectedStops.get(stop.stop_id)))
                : null,
        };
    });
});

// how the run went over the stops it has passed, for the summary at the top
const delaySummary = computed(() => {
    const summary = summarizeDelays(stopRows.value.map((row) => row.delaySeconds));
    if (!summary) return null;
    const last = stopRows.value.at(-1)?.delaySeconds ?? null;
    return {
        ...summary,
        status: typicalStatus(summary.mean),
        // only worth saying when it was late somewhere
        worstLabel: summary.late ? scheduleStatus(Math.round(summary.worst / 60)).label : null,
        // null when the bus wasn't seen at the last stop
        lastLabel: last === null ? null : scheduleStatus(Math.round(last / 60)).label.toLowerCase(),
    };
});

const mapStops = computed(() =>
    stopRows.value.flatMap(({ stop, stopInfo, name, scheduled, status, disruption }) => {
        const lat = Number(stopInfo?.stop_lat);
        const lon = Number(stopInfo?.stop_lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return [];
        return [{
            stop_id: stop.stop_id,
            stop_name: name,
            lat,
            lon,
            color: status ? STATUS_HEX[status.color] ?? NO_TIMES_HEX : NO_TIMES_HEX,
            disruption,
            tooltip: `${name} • ${scheduled} • ${status?.label ?? 'No live estimate'}${disruption ? ` • ${disruption}` : ''}`,
        }];
    }),
);

// ticks so the bus pin goes once the run has been over a while, without a reload
const nowSeconds = ref(Date.now() / 1000);
let nowInterval = null;
onMounted(() => {
    nowInterval = setInterval(() => {
        nowSeconds.value = Date.now() / 1000;
    }, 30000);
});
onBeforeUnmount(() => clearInterval(nowInterval));

// the bus is out on this trip now, rather than having finished it or not reported for a while
const liveRun = computed(() => {
    const latest = latestTripPoint.value;
    if (!latest || isFuture.value || switching.value) return null;
    if (nowSeconds.value - latest.timestamp > ACTIVE_TRIP_STALE_SECONDS) return null;
    return latest;
});

// the shared /bus/now snapshot, only while the bus is out, for its predicted delay
const { data: liveSnapshot } = useQuery({ ...liveBusesQuery, enabled: () => !!liveRun.value });

const liveBus = computed(() => {
    if (!liveRun.value) return null;
    const live = liveSnapshot.value?.find(
        (bus) => String(bus.bus) === String(liveRun.value.bus) && String(bus.trip) === String(props.tripId),
    );
    return { ...liveRun.value, trip: String(props.tripId), delay: live?.delay ?? null };
});

// worked out like the map's bus card, from the next stop, so the two agree. None once
// the bus is past its last stop
const { nextStop: liveNextStop } = useBusTrip(liveBus);
const liveStatus = computed(() => (liveBus.value && liveNextStop.value ? scheduleStatus(liveNextStop.value.offsetMinutes) : null));

// an old position isn't where the bus is, and the positions view has its own pins
const mapBuses = computed(() => {
    const latest = latestTripPoint.value;
    if (!latest || view.value === 'positions') return [];
    return nowSeconds.value - latest.timestamp <= RECENT_RUN_SECONDS ? [latest] : [];
});

// the bus's other trips that day, so it can be followed from trip to trip to see knock-on delays
const runBus = computed(() => (switching.value ? null : latestTripPoint.value?.bus ?? null));
const runRange = computed(() => {
    const times = runPositions.value.map((position) => position.timestamp);
    return times.length ? { start: Math.min(...times), end: Math.max(...times) } : null;
});
/** @param {Array<import('../api/index').TripSummary> | undefined} trips */
const busNeighboursIn = (trips) => (trips && runRange.value
    ? busTripNeighbours(trips, String(props.tripId), runRange.value.start, runRange.value.end)
    : { previous: null, next: null });
const { data: busDayTrips } = useQuery({
    queryKey: computed(() => ['bus-day-trips', runBus.value, pickerDate.value]),
    queryFn: () => getBusRecentTrips(/** @type {string|number} */ (runBus.value), { from: pickerDate.value, to: pickerDate.value }),
    enabled: () => runBus.value !== null && runBus.value !== '',
    // a past day is done, and today's only gains trips
    staleTime: () => (pickerDate.value < addDays(today, -1) ? Infinity : 60000),
    // while the bus hasn't started its next trip yet today, look again now and then
    refetchInterval: (query) => (pickerDate.value === today && !busNeighboursIn(query.state.data).next ? 120000 : false),
});
const busNeighbours = computed(() => busNeighboursIn(busDayTrips.value));

/** @param {import('../api/index').TripSummary | null} trip */
const busTripLink = (trip) => (trip
    ? { path: `/trips/${encodeURIComponent(String(trip.trip))}`, query: { date: edmontonDate(trip.start), ...viewQuery() } }
    : undefined);

/**
 * @param {string} which
 * @param {import('../api/index').TripSummary | null} trip
 */
const busTripLabel = (which, trip) => `Bus ${runBus.value}'s ${which} trip${trip ? `, ${formatClockTime(trip.start)} – ${formatClockTime(trip.end)}` : ''}`;

// the run's recorded positions, oldest first
const positionRows = computed(() => {
    const positions = [...runPositions.value].sort((a, b) => a.timestamp - b.timestamp);
    const buses = new Set(positions.map((position) => String(position.bus)));
    const stops = mapStops.value;
    return positions.map((position, index) => {
        const previous = positions[index - 1];
        const gap = previous ? position.timestamp - previous.timestamp : 0;
        const speed = Number(position.speed);
        return {
            key: `${position.timestamp}-${position.bus}`,
            position,
            time: formatClockTimeWithSeconds(position.timestamp),
            speed: Number.isFinite(speed) ? Math.round(speed * 3.6) : null,
            bearing: Number(position.bearing) || 0,
            direction: compassPoint(position.bearing),
            nearStop: nearestStop(position, stops, NEAR_STOP_METRES)?.stop_name ?? null,
            gapMinutes: gap > POSITION_GAP_SECONDS ? Math.round(gap / 60) : null,
            // only worth showing when the run changed bus
            bus: buses.size > 1 ? position.bus : null,
        };
    });
});

// runs of positions in one spot, one row each, opening to their positions
const positionGroups = computed(() =>
    groupPositions(
        positionRows.value.map((row) => ({ ...row, lat: row.position.lat, long: row.position.long })),
        GROUP_POSITION_METRES,
    ).map((rows) => ({ key: rows[0].key, first: rows[0], rows })),
);

const mapPositions = computed(() =>
    view.value === 'positions'
        ? positionRows.value.map(({ key, position }) => ({ ...position, key, label: formatClockTime(position.timestamp) }))
        : [],
);

/** @type {import('vue').Ref<string | null>} */
const selectedPositionKey = ref(null);
/** @type {import('vue').Ref<string | null>} */
const expandedGroupKey = ref(null);
watch([() => props.tripId, selectedDate, view], () => {
    selectedPositionKey.value = null;
    expandedGroupKey.value = null;
});

const selectedPosition = computed(
    () => mapPositions.value.find((position) => position.key === selectedPositionKey.value) ?? null,
);

const tripMap = ref(null);

/** @param {string} key */
const selectPosition = (key) => {
    selectedPositionKey.value = selectedPositionKey.value === key ? null : key;
    if (selectedPositionKey.value) {
        // a pin tapped on the map opens its group, so its row shows
        const group = positionGroups.value.find(({ rows }) => rows.some((row) => row.key === key));
        if (group && group.rows.length > 1) expandedGroupKey.value = group.key;
        // the list runs well below the map, so bring it back to see the pin
        /** @type {any} */ (tripMap.value)?.$el?.scrollIntoView({
            block: 'nearest',
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        });
    }
};

/** @param {{key: string, rows: Array<{key: string}>}} group */
const toggleGroup = (group) => {
    if (expandedGroupKey.value === group.key) {
        expandedGroupKey.value = null;
        // its rows are hidden now, so don't leave one of them picked
        if (group.rows.some((row) => row.key === selectedPositionKey.value)) selectedPositionKey.value = null;
        return;
    }
    // only picking one of its positions moves the map
    expandedGroupKey.value = group.key;
};

const mapPaths = computed(() => {
    const path = tripPath(tripData.value);
    return path.length ? [path] : [];
});

// the map keeps drawing the last trip while the next loads, then fits the new one once
const currentMap = () => ({
    stops: mapStops.value,
    buses: mapBuses.value,
    paths: mapPaths.value,
    positions: mapPositions.value,
    fitKey: String(tripData.value?.trip_id ?? props.tripId),
});
const shownMap = shallowRef(currentMap());
watchEffect(() => {
    if (switching.value) return;
    shownMap.value = currentMap();
});


// where the trip goes leads the heading, as the route's name doesn't say the direction
const headsign = computed(() =>
  tripData.value?.trip_headsign && tripData.value.route_id
    ? headsignWithoutRoute(tripData.value.trip_headsign, tripData.value.route_id)
    : '');
// LRT lines go by name and colour in Edmonton, not number
const isRail = computed(() => keyedroutes.value[tripData.value?.route_id ?? '']?.route_type === RAIL_ROUTE_TYPE);

/**
 * The trip's route at one of its stops, on the trip's day, for the stop names and the map.
 * The stop's own page is a link from there
 * @param {string} stopId
 */
const stopRouteLink = (stopId) => (tripData.value?.route_id
    ? {
        path: `/stops/${encodeURIComponent(stopId)}/routes/${encodeURIComponent(tripData.value.route_id)}`,
        query: pickerDate.value && pickerDate.value !== today ? { date: pickerDate.value } : {},
    }
    : `/stops/${encodeURIComponent(stopId)}`);
</script>
<template>
  <v-container>
    <v-alert v-if="tripData === null" type="info" variant="tonal">
      Trip {{ tripId }} not found.
    </v-alert>
    <div v-else-if="error">
      Error: {{ error.message }}
    </div>
    <!-- the map shows while loading, so it's there for the view transition from the main map -->
    <div v-else>
      <div v-if="tripLoading">
        Loading...
      </div>
      <template v-else>
        <router-link
          v-if="tripData?.route_id"
          :to="{ path: `/routes/${tripData.route_id}`, query: { direction: tripData.direction_id } }"
          class="route-header d-flex align-center pa-2"
          :class="{ 'route-header--line': isRail }"
          :style="isRail && routeColor(tripData.route_id) ? { borderLeftColor: routeColor(tripData.route_id) } : undefined"
        >
          <!-- named like the route page's heading, so they morph between the two -->
          <RouteBadge v-if="!isRail" :route-id="tripData.route_id" size="large" style="view-transition-name: route-number" />
          <!-- where it's going says the direction, which the route's name doesn't -->
          <div class="min-width-0" :class="{ 'ml-3': !isRail }">
            <h1 class="text-headline-small my-0" :style="headsign ? undefined : { viewTransitionName: 'route-name' }">
              {{ headsign || keyedroutes[tripData.route_id]?.route_long_name }}
            </h1>
            <div
              v-if="headsign"
              class="text-body-medium text-medium-emphasis"
              style="view-transition-name: route-name"
            >
              {{ keyedroutes[tripData.route_id]?.route_long_name }}
            </div>
          </div>
          <v-icon icon="mdi-chevron-right" class="ml-auto pl-2" />
        </router-link>
        <!-- how the bus is doing right now, while it's out on this trip -->
        <div v-if="liveStatus && liveNextStop" class="d-flex align-center flex-wrap ga-2 px-2 mb-1">
          <v-chip :color="liveStatus.color" size="small" variant="tonal" prepend-icon="mdi-access-point">
            {{ liveStatus.label }}
          </v-chip>
          <span class="text-body-small text-medium-emphasis">
            Next stop {{ liveNextStop.name }}, scheduled at {{ formatScheduledTime(liveNextStop.scheduledTime) }}
          </span>
        </div>
        <v-skeleton-loader v-if="switching" type="text, text" class="px-2" />
        <div v-else class="text-body-medium text-medium-emphasis px-2">
          <div v-if="weekdayLabel || (startTime && endTime)">
            {{ [weekdayLabel, startTime && endTime ? `${startTime} – ${endTime}` : ''].filter(Boolean).join(' · ') }}
          </div>
          <div class="text-body-small">
            Trip {{ tripId }}<template v-if="isFuture">
              &middot; Not run yet
            </template><template v-else-if="latestTripPoint">
              &middot;
              <!-- the bus's trips before and after this one, to follow it through the day -->
              <span class="bus-steps">
                <v-btn
                  icon="mdi-chevron-left"
                  variant="text"
                  size="x-small"
                  density="comfortable"
                  :to="busTripLink(busNeighbours.previous)"
                  :disabled="!busNeighbours.previous"
                  :aria-label="busTripLabel('previous', busNeighbours.previous)"
                  :title="busTripLabel('previous', busNeighbours.previous)"
                />
                <BusLink :bus="latestTripPoint.bus" :style="{ viewTransitionName: `bus-${latestTripPoint.bus}` }" />
                <v-btn
                  icon="mdi-chevron-right"
                  variant="text"
                  size="x-small"
                  density="comfortable"
                  :to="busTripLink(busNeighbours.next)"
                  :disabled="!busNeighbours.next"
                  :aria-label="busTripLabel('next', busNeighbours.next)"
                  :title="busTripLabel('next', busNeighbours.next)"
                />
              </span>
            </template>
          </div>
        </div>
        <!-- how late the run was over the stops it has passed -->
        <div
          v-if="!switching && delaySummary"
          class="delay-summary d-flex align-center flex-wrap ga-2 px-2 mt-2"
        >
          <v-chip :color="delaySummary.status.color" size="small" variant="tonal">
            {{ delaySummary.status.color === 'success' ? 'On time on average' : `${delaySummary.status.label} on average` }}
          </v-chip>
          <span class="text-body-small text-medium-emphasis">
            On time at {{ delaySummary.onTime }} of {{ delaySummary.count }} stops<template v-if="liveBus">
              so far
            </template><template v-if="delaySummary.late">
              &middot; {{ delaySummary.late }} late
            </template><template v-if="delaySummary.early">
              &middot; {{ delaySummary.early }} early
            </template><template v-if="delaySummary.worstLabel">
              &middot; Worst {{ delaySummary.worstLabel }}
            </template><template v-if="delaySummary.lastLabel">
              &middot; Finished {{ delaySummary.lastLabel }}
            </template>
          </span>
        </div>
      </template>
      <TransitMap
        ref="tripMap"
        :stops="shownMap.stops"
        :buses="shownMap.buses"
        :paths="shownMap.paths"
        :fit-key="shownMap.fitKey"
        :positions="shownMap.positions"
        :selected-position="selectedPosition"
        show-age
        bounded
        :stop-link="(stop) => stopRouteLink(stop.stop_id)"
        class="trip-map mt-3"
        @select-position="selectPosition"
      />
      <!-- disruptions under the map, then which day's run and which trip -->
      <template v-if="!tripLoading">
        <template v-if="!switching">
          <ServiceAlertCard
            v-for="timing in tripAlerts.alerts"
            :key="timing.alert.id"
            :timing="timing"
            :now="nowLocal"
            class="mt-3"
          />
        </template>
        <div class="trip-pickers d-flex align-center flex-wrap ga-2 mt-3">
          <DayPicker
            :model-value="pickerDate"
            :min="pickerMin"
            :max="pickerMax"
            :today="today"
            :allowed="isPickable"
            @update:model-value="pickDate"
          />
          <TripPicker
            :trips="dayTrips"
            :current="String(tripId)"
            :loading="dayTripsLoading"
            :recorded="recordedTripIds"
            @select="openTrip"
          />
        </div>
        <v-alert
          v-if="runMissing"
          type="info"
          variant="tonal"
          density="compact"
          class="mt-2"
        >
          {{ pickerDate === today ? "Hasn't run yet today" : `Not recorded on ${pickerDateLabel}` }}
        </v-alert>
      </template>
      <v-btn-toggle
        :model-value="view"
        mandatory
        density="compact"
        variant="outlined"
        divided
        color="primary"
        class="view-toggle mt-3"
        @update:model-value="pickView"
      >
        <v-btn value="stops" prepend-icon="mdi-map-marker-outline">
          Stops
        </v-btn>
        <v-btn value="positions" prepend-icon="mdi-crosshairs-gps">
          Positions<template v-if="!isLoading && !switching && positionRows.length">
            ({{ positionRows.length }})
          </template>
        </v-btn>
      </v-btn-toggle>
      <div v-if="isLoading || switching" class="mt-3">
        Loading...
      </div>
      <template v-else-if="view === 'positions'">
        <div v-if="!positionRows.length" class="text-body-medium text-medium-emphasis mt-3">
          No recorded positions
        </div>
        <v-card v-else variant="outlined" class="mt-3">
          <template v-for="(group, index) in positionGroups" :key="group.key">
            <v-divider v-if="index > 0" />
            <div
              v-if="group.rows.length === 1"
              v-ripple
              class="stop-row d-flex align-center pa-3"
              :class="{ 'stop-row--expanded': selectedPositionKey === group.key }"
              role="button"
              tabindex="0"
              :aria-pressed="selectedPositionKey === group.key"
              @click="selectPosition(group.key)"
              @keydown.enter.prevent="selectPosition(group.key)"
              @keydown.space.prevent="selectPosition(group.key)"
            >
              <PositionRow :row="group.first" />
            </div>
            <template v-else>
              <div
                v-ripple
                class="stop-row d-flex align-center pa-3"
                :class="{ 'stop-row--expanded': expandedGroupKey === group.key }"
                role="button"
                tabindex="0"
                :aria-expanded="expandedGroupKey === group.key"
                @click="toggleGroup(group)"
                @keydown.enter.prevent="toggleGroup(group)"
                @keydown.space.prevent="toggleGroup(group)"
              >
                <PositionRow :row="group.first" :more="group.rows.length - 1" />
              </div>
              <v-expand-transition>
                <div v-if="expandedGroupKey === group.key">
                  <template v-for="row in group.rows" :key="row.key">
                    <v-divider class="ml-6" />
                    <div
                      v-ripple
                      class="stop-row d-flex align-center py-2 pr-3 pl-9"
                      :class="{ 'stop-row--expanded': selectedPositionKey === row.key }"
                      role="button"
                      tabindex="0"
                      :aria-pressed="selectedPositionKey === row.key"
                      @click="selectPosition(row.key)"
                      @keydown.enter.prevent="selectPosition(row.key)"
                      @keydown.space.prevent="selectPosition(row.key)"
                    >
                      <PositionRow :row="row" />
                    </div>
                  </template>
                </div>
              </v-expand-transition>
            </template>
          </template>
        </v-card>
      </template>
      <v-card v-else-if="stopRows.length" variant="outlined" class="mt-3">
        <template v-for="(row, index) in stopRows" :key="row.stop.stop_sequence">
          <v-divider v-if="index > 0" />
          <!-- top-aligned, so the stop's name sits level with its time however tall either side is -->
          <div
            v-ripple
            class="stop-row d-flex align-start pa-3"
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
                <v-chip
                  v-if="row.disruption"
                  size="x-small"
                  variant="tonal"
                  color="warning"
                  prepend-icon="mdi-alert"
                  class="ml-1"
                >
                  {{ row.disruption }}
                </v-chip>
              </div>
            </div>
            <div class="text-right flex-shrink-0 ml-2">
              <!-- the chip and the scheduled time share a line, chip first, to keep the row short -->
              <div class="d-flex align-center justify-end ga-1">
                <v-chip v-if="row.status" :color="row.status.color" size="x-small" variant="tonal">
                  {{ row.status.label }}
                </v-chip>
                <span class="text-title-medium">{{ row.scheduled }}</span>
              </div>
              <div v-if="row.status && row.estimated" class="text-body-small text-medium-emphasis">
                Actual &asymp; {{ row.estimated }}
              </div>
            </div>
          </div>
          <v-expand-transition>
            <div v-if="expandedSequence === row.stop.stop_sequence" class="text-body-medium px-3 pb-3">
              <!-- what the warning chip is about -->
              <ServiceAlertCard
                v-for="timing in stopAlerts.get(row.stop.stop_id) ?? []"
                :key="timing.alert.id"
                :timing="timing"
                :now="nowLocal"
                class="mb-3"
              />
              <StopDelayStats
                v-if="tripData?.route_id"
                v-model:scope="statsScope"
                :trip-id="tripId"
                :seq="row.stop.stop_sequence"
                :route-id="tripData.route_id"
                :stop-id="row.stop.stop_id"
                :repeated="repeatedStopIds.has(row.stop.stop_id)"
                class="mb-3"
              />
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
              <!-- this route's times at the stop, which links on to the stop's own page -->
              <v-btn
                :to="stopRouteLink(row.stop.stop_id)"
                block
                size="large"
                height="50"
                variant="tonal"
                color="primary"
                class="mt-2"
              >
                {{ isRail ? keyedroutes[tripData?.route_id ?? '']?.route_long_name ?? 'This line' : `Route ${routeNumber(tripData?.route_id ?? '')}` }} at this stop
              </v-btn>
              <v-btn
                :to="`/stops/${encodeURIComponent(row.stop.stop_id)}`"
                block
                variant="text"
                size="small"
                color="primary"
                prepend-icon="mdi-bus-stop"
                class="text-none mt-1"
              >
                All routes at this stop
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

/* a bar in the line's colour, as on the stop page */
.route-header--line {
  border-left: 6px solid rgb(var(--v-theme-primary));
}

/* on phones the day, trip and stops/positions controls each take the full width */
@media (max-width: 599px) {
  .trip-pickers > * {
    flex: 1 1 100%;
    justify-content: space-between;
  }

  .trip-pickers > * > :deep(.v-btn:not(.v-btn--icon)) {
    flex: 1 1 auto;
  }

  .view-toggle {
    width: 100%;
  }

  .view-toggle .v-btn {
    flex: 1 1 0;
  }
}

.bus-steps {
    white-space: nowrap;
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
