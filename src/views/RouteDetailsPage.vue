<script setup>
// @ts-check
import { useQueries, useQuery } from '@tanstack/vue-query';
import { getTripsByRouteId, getStopTimesByTripIds, getActiveTripsByRouteId, getTrip, getServiceDates, getRouteSchedule, getRouteStopTimes, getRouteStopsStats } from '../api';
import { useRoutes } from '../composables/useRoutes';
import { useBuses } from '../composables/useBuses';
import { useStops } from '../composables/useStops';
import { useRecordedTrips } from '../composables/useRecordedTrips';
import { useNowLocal, useServiceAlerts } from '../composables/useServiceAlerts';
import RouteBadge from '../components/RouteBadge.vue';
import RouteBusCard from '../components/RouteBusCard.vue';
import ServiceAlertCard from '../components/ServiceAlertCard.vue';
import TransitMap from '../components/TransitMap.vue';
import DelayHistogram from '../components/DelayHistogram.vue';
import TimetableHeaderRow from '../components/TimetableHeaderRow.vue';
import { useStickyTableHeader } from '../composables/useStickyTableHeader';
import { tripPath } from '../composables/useStopArrivals';
import { RAIL_ROUTE_TYPE, directionLabels as labelDirections, representativeTrips, routeColor, routeNumber, stopsInOrder } from '../utils/routes';
import { upcomingArrivals } from '../utils/nextArrival';
import { actualStopTime, delaysByTrip } from '../utils/actualTimes';
import TrainTimes from '../components/TrainTimes.vue';
import { usePageTitle } from '../composables/usePageTitle';
import { useAgencies, useRouteAgencies } from '../composables/useAgencies';
import { telHref } from '../utils/phone';
import { edmontonNow, scheduleWindow, serviceRunsOnDay, weekdayOf } from '../utils/serviceTime';
import { addDays, formatShortDate } from '../utils/weeks';
import { formatDelay, onTimeShare, typicalStatus } from '../utils/delayStats';
import { alertsForRoute, disruptedStops, effectLabel } from '../utils/serviceAlerts';
import {
  regularServices,
  sameServices,
  schedulePeriods,
  serviceDatesFrom,
  servicesOnDate,
} from '../utils/serviceCalendar';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const props = defineProps({
  routeId: {
    type: String,
    required: true,
  },
});

const router = useRouter();
const currentRoute = useRoute();
const { keyedroutes } = useRoutes();
const { buses } = useBuses();
const { keyedStops } = useStops();

const route = computed(() => keyedroutes.value?.[props.routeId] ?? null);
// trains aren't in the bus feed, so there's nothing live or recorded to show for them
const isRail = computed(() => route.value?.route_type === RAIL_ROUTE_TYPE);

// handed over by the stop page so the header and buses can show (and morph in) before their data loads
/** @type {{ routeLongName?: string, buses?: Array<{ bus: number | string, trip: string }> }} */
const handoff = window.history.state ?? {};

const routeLongName = computed(() => route.value?.route_long_name ?? handoff.routeLongName ?? '');
usePageTitle(() => [`Route ${routeNumber(props.routeId)}`, routeLongName.value]);

// --- Trips for this route ---
const { data: trips, isLoading: tripsLoading } = useQuery({
  queryKey: ['route-trips', props.routeId],
  queryFn: () => getTripsByRouteId(props.routeId),
  enabled: !!props.routeId,
});

// --- Active GTFS feed trips ---
const { data: activeFeedData, isLoading: activeFeedLoading } = useQuery({
  queryKey: ['active-feed-trips', props.routeId],
  queryFn: () => getActiveTripsByRouteId(props.routeId),
  enabled: !!props.routeId,
  retry: false,
});

const activeFeedTripIdSet = computed(() => {
  if (!activeFeedData.value || !activeFeedData.value.length) return null;
  return new Set(activeFeedData.value.map((t) => t.trip_id));
});

// the feed can list a trip more than once
const uniqueTrips = computed(() => {
  const seen = new Set();
  return (trips.value ?? []).filter((t) => {
    if (seen.has(t.trip_id)) return false;
    seen.add(t.trip_id);
    return true;
  });
});

// Trips in the currently-active GTFS feed
const activeTrips = computed(() => {
  const activeSet = activeFeedTripIdSet.value;
  return activeSet ? uniqueTrips.value.filter((t) => activeSet.has(t.trip_id)) : uniqueTrips.value;
});

// --- Direction, which the whole page follows ---
const directions = computed(() => [...new Set(activeTrips.value.map((t) => t.direction_id))].sort());
const directionLabels = computed(() => labelDirections(activeTrips.value));

// from ?direction=, e.g. when coming from a trip, and written back so reloads and shared links keep it
const selectedDirection = ref(String(currentRoute.query.direction ?? ''));

watch(directions, (dirs) => {
  if (dirs.length && !dirs.includes(selectedDirection.value)) {
    selectedDirection.value = dirs[0] ?? '';
  }
}, { immediate: true });

watch(selectedDirection, (direction) => {
  if (direction && currentRoute.query.direction !== direction) {
    router.replace({ query: { ...currentRoute.query, direction } });
  }
});

// --- Active buses ---
/** @type {import('vue').ComputedRef<Map<string, string>>} */
const directionByTrip = computed(() => new Map((trips.value ?? []).map((t) => [String(t.trip_id), t.direction_id])));

const routeBuses = computed(() =>
  (buses.value ?? [])
    .filter((bus) => bus.route_id === props.routeId)
    .sort((a, b) => Number(a.bus) - Number(b.bus)),
);

/** @type {import('vue').ComputedRef<Record<string, number>>} */
const busCounts = computed(() => {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const bus of routeBuses.value) {
    const direction = directionByTrip.value.get(String(bus.trip));
    if (direction !== undefined) counts[direction] = (counts[direction] ?? 0) + 1;
  }
  return counts;
});

const activeBuses = computed(() => {
  if (!buses.value) return handoff.buses ?? [];
  // shown unsplit until the trips say which way each bus is going
  if (!trips.value) return routeBuses.value;
  return routeBuses.value.filter((bus) => directionByTrip.value.get(String(bus.trip)) === selectedDirection.value);
});

// --- Stops and lines for the direction, from one trip per route shape ---
const directionTripIds = computed(() =>
  representativeTrips(activeTrips.value, selectedDirection.value).map((t) => t.trip_id),
);

/** @param {string[]} tripIds */
const directionStopsQuery = (tripIds) => ({
  queryKey: ['route-direction-stops', props.routeId, tripIds.join(',')],
  queryFn: () => getStopTimesByTripIds(tripIds),
  enabled: tripIds.length > 0,
  staleTime: Infinity,
});

const { data: directionStopTimes, isError: directionStopsError } = useQuery(
  computed(() => directionStopsQuery(directionTripIds.value)),
);

// every direction's stops load up front, so switching direction has its map and
// disruptions straight away. Same keys as above, so they share the cache
useQueries({
  queries: computed(() =>
    directions.value.map((direction) =>
      directionStopsQuery(representativeTrips(activeTrips.value, direction).map((t) => t.trip_id)))),
});

// --- Service disruptions in this direction, in effect now and still to come ---
const serviceAlerts = useServiceAlerts();
const nowLocal = useNowLocal();

const directionStopIds = computed(() =>
  directionStopTimes.value ? new Set(directionStopTimes.value.map((st) => st.stop_id)) : null,
);

// waits for the direction's stops, as the whole route's alerts would include the other
// direction's. Only if they can't be loaded does it fall back to the whole route
const routeAlerts = computed(() =>
  directionStopIds.value || directionStopsError.value
    ? alertsForRoute(serviceAlerts.value, props.routeId, nowLocal.value, directionStopIds.value)
    : { active: [], upcoming: [] });
const showUpcomingAlerts = ref(false);

// stops this route's alerts in effect name, ringed on the map
const routeDisruptedStops = computed(() => disruptedStops(serviceAlerts.value, nowLocal.value, props.routeId));

const mapStops = computed(() =>
  [...new Set((directionStopTimes.value ?? []).map((st) => st.stop_id))]
    .map((stopId) => keyedStops.value?.[stopId])
    .filter((stop) => !!stop)
    .map((stop) => {
      const effect = routeDisruptedStops.value.get(stop.stop_id);
      return {
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        lat: Number(stop.stop_lat),
        lon: Number(stop.stop_lon),
        disruption: effect ? effectLabel(effect) : null,
        tooltip: effect ? `${stop.stop_name} • ${effectLabel(effect)}` : undefined,
      };
    })
    .filter(({ lat, lon }) => Number.isFinite(lat) && Number.isFinite(lon)),
);

// same key as the trip page and bus cards, so they share the shapes
const shapeQueries = useQueries({
  queries: computed(() =>
    directionTripIds.value.map((tripId) => ({
      queryKey: ['trip-shape', tripId],
      queryFn: () => getTrip(tripId),
      staleTime: Infinity,
    })),
  ),
});

const mapPaths = computed(() =>
  shapeQueries.value.map((query) => tripPath(query.data)).filter((path) => path.length > 1),
);

// --- Timetable: a typical week in a schedule period, or an exact date ---
const DAYS = [
  { label: 'Mon', field: 'monday' },
  { label: 'Tue', field: 'tuesday' },
  { label: 'Wed', field: 'wednesday' },
  { label: 'Thu', field: 'thursday' },
  { label: 'Fri', field: 'friday' },
  { label: 'Sat', field: 'saturday' },
  { label: 'Sun', field: 'sunday' },
];

const today = edmontonNow().dateString;

/** @type {import('vue').Ref<import('../utils/serviceTime').Weekday>} */
const selectedDay = ref(weekdayOf(today));
// opens on what's actually running today; null shows a typical selectedDay instead
/** @type {import('vue').Ref<string | null>} */
const selectedDate = ref(today);
const selectedPeriodKey = ref('');

const routeServiceIds = computed(() => [...new Set(uniqueTrips.value.map((t) => t.service_id))].sort());

const { data: serviceDateRows, isLoading: serviceDatesLoading } = useQuery({
  queryKey: computed(() => ['service-dates', props.routeId, routeServiceIds.value.join(',')]),
  queryFn: () => getServiceDates(routeServiceIds.value),
  enabled: () => routeServiceIds.value.length > 0,
  staleTime: Infinity,
});

// null when the calendar couldn't be loaded, so the days in each service_id are used instead
const serviceDates = computed(() =>
  serviceDateRows.value?.length ? serviceDatesFrom(serviceDateRows.value) : null,
);

const periods = computed(() =>
  serviceDates.value ? schedulePeriods(routeServiceIds.value, serviceDates.value) : [],
);

/** @param {string} date YYYY-MM-DD */
const periodOn = (date) => {
  const running = serviceDates.value ? servicesOnDate(serviceDates.value, date) : new Set();
  return periods.value.find((p) => p.serviceIds.some((id) => running.has(id)))
    ?? periods.value.find((p) => p.start <= date && date <= p.end);
};

watch(periods, (list) => {
  if (!list.length || list.some((p) => p.key === selectedPeriodKey.value)) return;
  const period = periodOn(selectedDate.value ?? today)
    ?? list.find((p) => p.end >= today)
    ?? list[list.length - 1];
  selectedPeriodKey.value = period?.key ?? '';
}, { immediate: true });

const selectedPeriod = computed(() => periods.value.find((p) => p.key === selectedPeriodKey.value) ?? null);

/** @param {string} date YYYY-MM-DD */
const formatDate = (date, options = /** @type {Intl.DateTimeFormatOptions} */ ({ month: 'short', day: 'numeric' })) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });

const periodOptions = computed(() =>
  periods.value.map((p) => {
    const status = p.start > today ? ' (upcoming)' : p.end >= today ? ' (current)' : '';
    return { title: `${formatDate(p.start)} – ${formatDate(p.end)}${status}`, value: p.key };
  }),
);

/** @param {string} key */
const pickPeriod = (key) => {
  selectedPeriodKey.value = key;
  // the date may be outside the new period, so show its typical week
  selectedDate.value = null;
};

// the weekday buttons show nothing selected while an exact date is
const dayToggle = computed({
  get: () => (selectedDate.value && serviceDates.value ? null : selectedDay.value),
  /** @param {import('../utils/serviceTime').Weekday | null} day */
  set: (day) => {
    if (!day) return;
    selectedDay.value = day;
    selectedDate.value = null;
  },
});

const datePickerOpen = ref(false);

/** @param {string} date YYYY-MM-DD */
const selectDate = (date) => {
  selectedDate.value = date;
  selectedDay.value = weekdayOf(date);
  const period = periodOn(date);
  if (period) selectedPeriodKey.value = period.key;
};

/** @param {unknown} value the picker's local-midnight Date */
const pickDate = (value) => {
  if (!(value instanceof Date)) return;
  selectDate(`${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`);
  datePickerOpen.value = false;
};

/**
 * The nearest date before or after the selected one that the route runs on, within
 * the calendar. Null on a typical week.
 * @param {-1 | 1} step
 * @returns {string | null}
 */
const nearestServiceDate = (step) => {
  const dates = serviceDates.value;
  const first = periods.value[0]?.start;
  const last = periods.value[periods.value.length - 1]?.end;
  if (!dates || !selectedDate.value || !first || !last) return null;
  for (let date = addDays(selectedDate.value, step); date >= first && date <= last; date = addDays(date, step)) {
    if (servicesOnDate(dates, date).size) return date;
  }
  return null;
};

const previousDate = computed(() => nearestServiceDate(-1));
const nextDate = computed(() => nearestServiceDate(1));

// trip links open the trip on the shown date, so its page shows that day's run
/** @param {string} tripId */
const tripHref = (tripId) => (selectedDate.value ? `/trips/${tripId}?date=${selectedDate.value}` : `/trips/${tripId}`);

const pickerValue = computed(() => (selectedDate.value ? new Date(`${selectedDate.value}T00:00:00`) : null));

const dateLabel = computed(() => {
  if (!selectedDate.value) return 'Pick a date';
  const label = formatDate(selectedDate.value, { weekday: 'short', month: 'short', day: 'numeric' });
  return selectedDate.value === today ? `Today, ${label}` : label;
});

// the services the timetable shows, or null to fall back to the days in each service_id
const dayServices = computed(() => {
  if (!serviceDates.value) return null;
  if (selectedDate.value) return servicesOnDate(serviceDates.value, selectedDate.value);
  return regularServices(serviceDates.value, selectedPeriod.value?.serviceIds ?? [], selectedDay.value);
});

// e.g. sunday service on thanksgiving monday, or a one-off schedule
const isSpecialDay = computed(() => {
  if (!serviceDates.value || !selectedDate.value || !dayServices.value?.size) return false;
  const typical = regularServices(serviceDates.value, periodOn(selectedDate.value)?.serviceIds ?? [], selectedDay.value);
  return !sameServices(dayServices.value, typical);
});

// --- Trips for selected day + direction ---
const dayTrips = computed(() => {
  const services = dayServices.value;
  if (services) {
    return uniqueTrips.value.filter((trip) =>
      trip.direction_id === selectedDirection.value && services.has(trip.service_id)
    );
  }
  return activeTrips.value.filter((trip) =>
    trip.direction_id === selectedDirection.value &&
    serviceRunsOnDay(trip.service_id, selectedDay.value)
  );
});

const dayTripIds = computed(() => dayTrips.value.map((t) => t.trip_id));

// trips we recorded on the picked date, dotted in the timetable's header. A typical week has no date
const recordedTripIds = useRecordedTrips(() => props.routeId, selectedDate);

// --- Stop times for the day's trips ---
const { data: stopTimesData, isLoading: stopTimesLoading } = useQuery({
  queryKey: computed(() => ['timetable-stop-times', dayTripIds.value.join(',')]),
  queryFn: () => getStopTimesByTripIds(dayTripIds.value),
  enabled: () => dayTripIds.value.length > 0,
});

// --- Build lookup: trip_id -> stop_id -> arrival_time_fixed ---
const stopTimeMap = computed(() => {
  if (!stopTimesData.value) return new Map();
  /** @type {Map<string, Map<string, string>>} */
  const lookup = new Map();
  stopTimesData.value.forEach((st) => {
    const tripEntry = lookup.get(st.trip_id) ?? new Map();
    tripEntry.set(st.stop_id, st.arrival_time_fixed || st.departure_time_fixed);
    lookup.set(st.trip_id, tripEntry);
  });
  return lookup;
});

// --- Actual times: when the bus went by each stop, instead of when it was scheduled ---
// worked out nightly, so only an exact date up to today has them, and today never does yet.
// Trains aren't in the bus feed
const canShowActual = computed(() => !!selectedDate.value && selectedDate.value <= today && !isRail.value);
/** @type {import('vue').Ref<'scheduled' | 'actual'>} */
const timesMode = ref(currentRoute.query.times === 'actual' ? 'actual' : 'scheduled');
const showActual = computed(() => canShowActual.value && timesMode.value === 'actual');

watch(timesMode, (mode) => {
  const times = mode === 'actual' ? 'actual' : undefined;
  if (currentRoute.query.times !== times) {
    router.replace({ query: { ...currentRoute.query, times } });
  }
});

const { data: actualData, isLoading: actualLoading, isError: actualError } = useQuery({
  queryKey: computed(() => ['route-stop-times', props.routeId, selectedDate.value]),
  queryFn: () => getRouteStopTimes(props.routeId, /** @type {string} */ (selectedDate.value)),
  enabled: () => showActual.value && selectedDate.value !== today,
  // yesterday's are worked out early in the morning
  staleTime: 60 * 60 * 1000,
});

const actualDelays = computed(() => delaysByTrip(actualData.value));
const hasActualTimes = computed(() => timetableTrips.value.some((trip) => actualDelays.value.has(trip.trip_id)));

// a loop can pass a stop twice, but the timetable has a row per stop, so keep the sequence its time came from
const stopSeqMap = computed(() => {
  /** @type {Map<string, Map<string, number>>} */
  const lookup = new Map();
  (stopTimesData.value ?? []).forEach((st) => {
    const tripEntry = lookup.get(st.trip_id) ?? new Map();
    tripEntry.set(st.stop_id, parseInt(st.stop_sequence, 10));
    lookup.set(st.trip_id, tripEntry);
  });
  return lookup;
});

// trip -> stop -> when the bus went by and how late it was, worked out once rather than per cell
const actualGrid = computed(() => {
  /** @type {Map<string, Map<string, { time: string, pm: boolean, status: { label: string, color: string } }>>} */
  const grid = new Map();
  if (!showActual.value) return grid;
  for (const [tripId, stops] of stopTimeMap.value) {
    const delays = actualDelays.value.get(tripId);
    if (!delays) continue;
    const cells = new Map();
    for (const [stopId, scheduled] of stops) {
      const delay = delays.get(stopSeqMap.value.get(tripId)?.get(stopId) ?? -1);
      if (!scheduled || delay === undefined) continue;
      const { time, status } = actualStopTime(scheduled, delay);
      cells.set(stopId, { time: formatTime(time), pm: isPMRaw(time), status });
    }
    grid.set(tripId, cells);
  }
  return grid;
});

/**
 * When the bus went by a stop and how late it was, or undefined if it wasn't seen passing.
 * @param {string} tripId
 * @param {string} stopId
 */
const actualCell = (tripId, stopId) => actualGrid.value.get(tripId)?.get(stopId);

// --- Canonical stop list ordered by average stop_sequence across all day trips ---
const timetableStops = computed(() => {
  if (!stopTimesData.value || !stopTimesData.value.length) return [];
  /** @type {Map<string, { sum: number, count: number }>} */
  const seqInfo = new Map();
  stopTimesData.value.forEach((st) => {
    const seq = parseInt(st.stop_sequence, 10);
    const info = seqInfo.get(st.stop_id) ?? { sum: 0, count: 0 };
    info.sum += seq;
    info.count += 1;
    seqInfo.set(st.stop_id, info);
  });
  return [...seqInfo.keys()]
    .sort((a, b) => {
      const ia = seqInfo.get(a); const ib = seqInfo.get(b);
      return (ia ? ia.sum / ia.count : 0) - (ib ? ib.sum / ib.count : 0);
    })
    .map((stop_id) => ({
      stop_id,
      stop_name: shortenStopName(keyedStops.value?.[stop_id]?.stop_name || `Stop ${stop_id}`),
    }));
});

// --- Trip columns sorted by first stop departure time ---
const timetableTrips = computed(() => {
  if (!stopTimesData.value || !stopTimesData.value.length || !dayTrips.value.length) return [];
  /** @type {Map<string, string>} */
  const tripFirstTime = new Map();
  stopTimesData.value.forEach((st) => {
    const time = st.departure_time_fixed || st.arrival_time_fixed;
    const existing = tripFirstTime.get(st.trip_id);
    if (time && (existing === undefined || time < existing)) {
      tripFirstTime.set(st.trip_id, time);
    }
  });
  return dayTrips.value
    .filter((t) => tripFirstTime.has(t.trip_id))
    .sort((a, b) => (tripFirstTime.get(a.trip_id) ?? '').localeCompare(tripFirstTime.get(b.trip_id) ?? ''))
    .map((t) => ({
      ...t,
      headerTime: formatTime(tripFirstTime.get(t.trip_id) ?? ''),
      headerPM: isPMRaw(tripFirstTime.get(t.trip_id) ?? ''),
    }));
});

/** @type {import('vue').Ref<HTMLElement | null>} */
const timetableHead = ref(null);
/** @type {import('vue').Ref<HTMLTableElement | null>} */
const timetableHeadTable = ref(null);
/** @type {import('vue').Ref<HTMLElement | null>} */
const timetableBox = ref(null);
/** @type {import('vue').Ref<HTMLTableElement | null>} */
const timetableTable = ref(null);
const { headHeight: timetableHeadHeight, sizeColumns } = useStickyTableHeader({
  head: timetableHead,
  headTable: timetableHeadTable,
  box: timetableBox,
  table: timetableTable,
});

// columns can change width without the table's overall size changing
watch([timetableTrips, timetableStops, showActual], sizeColumns, { flush: 'post' });

const timetableLoading = computed(
  () => tripsLoading.value || activeFeedLoading.value || serviceDatesLoading.value || stopTimesLoading.value
    || (showActual.value && selectedDate.value !== today && actualLoading.value)
);

// --- Time helpers ---

/** Shortens common street-name words to save space on mobile
 * @param {string} name
 * @returns {string}
 */
function shortenStopName(name) {
  if (typeof name !== 'string' || !name) return name;
  const replacements = /** @type {Array<[RegExp, string]>} */ ([
    [/\bAvenue\b/g, 'Av'],
    [/\bStreet\b/g, 'St'],
    [/\bBoulevard\b/g, 'Blvd'],
    [/\bDrive\b/g, 'Dr'],
    [/\bRoad\b/g, 'Rd'],
    [/\bCrescent\b/g, 'Cres'],
    [/\bPlace\b/g, 'Pl'],
    [/\bCourt\b/g, 'Ct'],
    [/\bTrail\b/g, 'Tr'],
    [/\bLane\b/g, 'Ln'],
    [/\bClose\b/g, 'Cl'],
    [/\bNorthwest\b/g, 'NW'],
    [/\bNortheast\b/g, 'NE'],
    [/\bSouthwest\b/g, 'SW'],
    [/\bSoutheast\b/g, 'SE'],
  ]);
  let result = name;
  for (const [pattern, replacement] of replacements) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/** Returns true if a raw HH:MM:SS time string is PM (hour >= 12)
 * @param {string} timeStr
 */
function isPMRaw(timeStr) {
  if (!timeStr) return false;
  return parseInt(timeStr.split(':')[0] ?? '0', 10) >= 12;
}

/** Formats a raw HH:MM:SS string to 12-hr H:MM without AM/PM
 * @param {string} timeStr
 */
function formatTime(timeStr) {
  if (!timeStr) return '—';
  const parts = timeStr.split(':');
  const h = parseInt(parts[0] ?? '0', 10);
  const m = parts[1] ?? '00';
  const hour12 = h % 12 || 12;
  return `${hour12}:${m}`;
}

/**
 * @param {string} tripId
 * @param {string} stopId
 */
function cellTime(tripId, stopId) {
  return formatTime(stopTimeMap.value.get(tripId)?.get(stopId) ?? '');
}

/**
 * @param {string} tripId
 * @param {string} stopId
 */
function cellIsPM(tripId, stopId) {
  return isPMRaw(stopTimeMap.value.get(tripId)?.get(stopId) ?? '');
}

/**
 * Opens a time cell's trip in the app rather than reloading the page. New-tab
 * clicks are left to the browser.
 * @param {MouseEvent} event
 */
function openTripCell(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  const link = /** @type {HTMLElement} */ (event.target).closest('a[data-trip-link]');
  if (!link) return;
  event.preventDefault();
  router.push(/** @type {string} */ (link.getAttribute('href')));
}

// who runs the route, with their website, fares and phone
const { agencyByRoute } = useRouteAgencies();
const { agenciesByName } = useAgencies();
const agencyName = computed(() => agencyByRoute.value.get(props.routeId) ?? null);
const agency = computed(() => (agencyName.value ? agenciesByName.value.get(agencyName.value) ?? null : null));

// --- LRT: each station's next scheduled trains, in place of Active Buses ---
// before the routes load, only buses handed over for the view transition are shown
const showActiveBuses = computed(() => (route.value ? !isRail.value : activeBuses.value.length > 0));

// --- Stops in the direction, with how late buses were at each last week ---
// trains aren't tracked, so LRT lines have no stats
const showStopsList = computed(() => !!route.value && !isRail.value);

// every stop at once, worked out nightly, so there's nothing new to fetch for a while
const stopsStats = useQuery({
  queryKey: ['route-stops-stats', props.routeId],
  queryFn: () => getRouteStopsStats(props.routeId),
  enabled: showStopsList,
  staleTime: 60 * 60 * 1000,
});

const statsByStop = computed(() => new Map((stopsStats.data.value?.stops ?? []).map((stats) => [stats.stop, stats])));

const stopsStatsRange = computed(() => {
  const data = stopsStats.data.value;
  return data ? `${formatShortDate(data.from)} – ${formatShortDate(data.to)}` : '';
});

const stopList = computed(() =>
  stopsInOrder(directionStopTimes.value ?? []).map((stopId) => {
    const stats = statsByStop.value.get(stopId);
    const effect = routeDisruptedStops.value.get(stopId);
    return {
      stopId,
      name: keyedStops.value?.[stopId]?.stop_name ?? `Stop ${stopId}`,
      disruption: effect ? effectLabel(effect) : null,
      stats: stats?.count && stats.mean !== null ? stats : null,
      onTime: stats ? onTimeShare(stats.histogram) : null,
    };
  }));

/** @param {number} count */
const busTimes = (count) => `${count} ${count === 1 ? 'bus' : 'buses'}`;

/** @param {{count: number, trips: number}} stats */
const stopStatsCaption = (stats) =>
  `${busTimes(stats.count)} on ${stats.trips} ${stats.trips === 1 ? 'trip' : 'trips'}`;

// the countdowns tick on their own, as nothing else refreshes for a train
const clock = ref(edmontonNow());
/** @type {ReturnType<typeof setInterval> | undefined} */
let clockTimer;
onMounted(() => {
  clockTimer = setInterval(() => {
    clock.value = edmontonNow();
  }, 30 * 1000);
});
onBeforeUnmount(() => clearInterval(clockTimer));

// the next two hours, refetched as that window moves on in 15 minute steps
const TRAIN_WINDOW_SECONDS = 2 * 60 * 60;
const TRAIN_WINDOW_STEP_SECONDS = 15 * 60;
const trainWindowStart = computed(() =>
  Math.floor(clock.value.secondsSinceMidnight / TRAIN_WINDOW_STEP_SECONDS) * TRAIN_WINDOW_STEP_SECONDS);

// today's services, and yesterday's for trains still running past midnight
const trainServiceIds = computed(() => {
  const dates = [clock.value.dateString, addDays(clock.value.dateString, -1)];
  const ids = new Set();
  for (const date of dates) {
    const running = serviceDates.value
      ? servicesOnDate(serviceDates.value, date)
      : routeServiceIds.value.filter((id) => serviceRunsOnDay(id, weekdayOf(date)));
    running.forEach((id) => ids.add(id));
  }
  return [...ids].sort();
});

const { data: trainSchedule, isPending: trainsPending } = useQuery({
  queryKey: computed(() => ['route-schedule', props.routeId, clock.value.dateString, trainWindowStart.value, trainServiceIds.value.join(',')]),
  queryFn: () => getRouteSchedule(
    props.routeId,
    trainServiceIds.value,
    scheduleWindow(trainWindowStart.value, 0, TRAIN_WINDOW_SECONDS + TRAIN_WINDOW_STEP_SECONDS),
  ),
  // waits for the calendar, as the service_id days alone list each train once per variant
  enabled: () => isRail.value && !serviceDatesLoading.value && trainServiceIds.value.length > 0,
  staleTime: Infinity,
  placeholderData: (previous, previousQuery) =>
    previousQuery?.queryKey[1] === props.routeId ? previous : undefined,
});

const stationTrains = computed(() => {
  const entries = (trainSchedule.value ?? []).filter((entry) =>
    directionByTrip.value.get(String(entry.trip_id)) === selectedDirection.value);
  const byStop = upcomingArrivals(entries, clock.value.dateString, clock.value.secondsSinceMidnight, {
    serviceDates: serviceDates.value,
    keyOf: (entry) => entry.stop_id,
    limit: 3,
  });
  // stations in the order trains reach them
  /** @type {Map<string, {name: string, sequence: number}>} */
  const stations = new Map();
  for (const entry of entries) {
    const sequence = Number(entry.stop_sequence);
    const known = stations.get(entry.stop_id);
    if (!known || sequence < known.sequence) stations.set(entry.stop_id, { name: entry.stop_name, sequence });
  }
  return [...stations]
    .sort(([, a], [, b]) => a.sequence - b.sequence)
    .map(([stopId, station]) => ({ stopId, name: station.name, arrivals: byStop.get(stopId) ?? [] }))
    .filter((station) => station.arrivals.length);
});
</script>

<template>
  <v-container>
    <v-btn
      :to="'/routes'"
      variant="text"
      prepend-icon="mdi-chevron-left"
      class="mb-4 pl-0"
    >
      All Routes
    </v-btn>

    <h1 class="route-heading text-headline-large">
      <RouteBadge :route-id="routeId" size="large" style="view-transition-name: route-number" />
      <span style="view-transition-name: route-name">{{ routeLongName }}</span>
    </h1>

    <!-- the space is kept while the agency loads, so the page doesn't shift -->
    <div class="agency-line d-flex flex-wrap align-center ga-1 mt-2 text-body-medium">
      <template v-if="agencyName">
        <v-icon icon="mdi-domain" size="small" class="text-medium-emphasis mr-1" />
        <span class="mr-2">{{ agencyName }}</span>
        <v-btn
          v-if="agency?.agency_url"
          :href="agency.agency_url"
          target="_blank"
          rel="noopener"
          variant="text"
          size="small"
          color="primary"
          prepend-icon="mdi-open-in-new"
        >
          Website
        </v-btn>
        <v-btn
          v-if="agency?.agency_fare_url"
          :href="agency.agency_fare_url"
          target="_blank"
          rel="noopener"
          variant="text"
          size="small"
          color="primary"
          prepend-icon="mdi-ticket-outline"
        >
          Fares
        </v-btn>
        <v-btn
          v-if="agency?.agency_phone"
          :href="telHref(agency.agency_phone)"
          variant="text"
          size="small"
          color="primary"
          prepend-icon="mdi-phone"
        >
          {{ agency.agency_phone }}
        </v-btn>
      </template>
    </div>

    <!-- the map, buses and timetable all follow the direction -->
    <v-btn-toggle
      v-if="directions.length > 1"
      v-model="selectedDirection"
      mandatory
      color="primary"
      variant="outlined"
      divided
      class="direction-toggle mt-4"
    >
      <v-btn
        v-for="dir in directions"
        :key="dir"
        :value="dir"
        class="text-none"
      >
        <span class="direction-label">{{ directionLabels[dir] }}</span>
        <v-badge
          v-if="busCounts[dir]"
          :content="busCounts[dir]"
          inline
          color="primary"
        />
      </v-btn>
    </v-btn-toggle>

    <TransitMap
      :stops="mapStops"
      :buses="activeBuses"
      :paths="mapPaths"
      :fit-key="selectedDirection"
      class="mt-4"
    />

    <!-- disruptions under the map, as on the trip page -->
    <div v-if="routeAlerts.active.length || routeAlerts.upcoming.length" class="mt-4">
      <h2 class="text-title-large mb-2">
        Service disruptions
      </h2>
      <ServiceAlertCard
        v-for="timing in routeAlerts.active"
        :key="timing.alert.id"
        :timing="timing"
        :now="nowLocal"
        class="mb-2"
      />
      <v-btn
        v-if="routeAlerts.upcoming.length"
        variant="text"
        size="small"
        class="px-1"
        :append-icon="showUpcomingAlerts ? 'mdi-chevron-up' : 'mdi-chevron-down'"
        :aria-expanded="showUpcomingAlerts"
        @click="showUpcomingAlerts = !showUpcomingAlerts"
      >
        {{ routeAlerts.upcoming.length }} upcoming
      </v-btn>
      <v-expand-transition>
        <div v-if="showUpcomingAlerts" class="mt-2">
          <ServiceAlertCard
            v-for="timing in routeAlerts.upcoming"
            :key="timing.alert.id"
            :timing="timing"
            :now="nowLocal"
            class="mb-2"
          />
        </div>
      </v-expand-transition>
    </div>

    <!-- LRT: the next trains at each station, as they aren't tracked live -->
    <template v-if="isRail">
      <h2 class="text-headline-small mt-8 mb-1">
        Next Trains
      </h2>
      <div class="d-flex align-center text-body-small text-medium-emphasis mb-3">
        <v-icon icon="mdi-calendar-clock" size="x-small" class="mr-1" />
        Scheduled, not live
      </div>
      <v-skeleton-loader v-if="trainsPending && !trainSchedule" type="list-item-two-line@4" class="trains-loader" />
      <div v-else-if="!stationTrains.length" class="text-medium-emphasis mb-4">
        No trains in the next two hours.
      </div>
      <v-card v-else variant="outlined" class="mb-4">
        <template v-for="(station, index) in stationTrains" :key="station.stopId">
          <v-divider v-if="index > 0" />
          <div class="station-row pa-3">
            <router-link :to="`/stops/${station.stopId}`" class="station-name text-title-small">
              {{ station.name }}
            </router-link>
            <TrainTimes :arrivals="station.arrivals" :columns="3" :color="routeColor(routeId)" />
          </div>
        </template>
      </v-card>
    </template>

    <!-- Active Buses -->
    <template v-if="showActiveBuses">
      <h2 class="text-headline-small mt-8 mb-3">
        Active Buses
      </h2>
      <div v-if="activeBuses.length === 0" class="text-medium-emphasis mb-4">
        {{ routeBuses.length ? 'No buses currently active in this direction.' : 'No buses currently active on this route.' }}
      </div>
      <v-row v-else dense class="mb-4">
        <v-col
          v-for="bus in activeBuses"
          :key="bus.bus"
          cols="12"
          sm="6"
          lg="4"
        >
          <RouteBusCard :bus="bus" />
        </v-col>
      </v-row>
    </template>

    <!-- Stops, with a week of delays at each -->
    <template v-if="showStopsList">
      <h2 class="text-headline-small mt-8 mb-1">
        Stops
      </h2>
      <div class="text-body-small text-medium-emphasis mb-3">
        How late buses were last week<template v-if="stopsStatsRange">
          &middot; {{ stopsStatsRange }}
        </template>
      </div>
      <v-skeleton-loader v-if="!directionStopTimes && !directionStopsError" type="list-item-two-line@4" />
      <div v-else-if="!stopList.length" class="text-medium-emphasis mb-4">
        The stops could not be loaded.
      </div>
      <template v-else>
        <div v-if="stopsStats.isError.value" class="text-error mb-2">
          Stats for these stops could not be loaded.
        </div>
        <v-card variant="outlined" class="mb-4">
          <template v-for="(stop, index) in stopList" :key="stop.stopId">
            <v-divider v-if="index > 0" />
            <div class="stop-row pa-3">
              <div class="stop-row__info">
                <div class="d-flex align-center ga-1">
                  <router-link :to="`/stops/${stop.stopId}`" class="stop-row__name text-title-small">
                    {{ stop.name }}
                  </router-link>
                  <v-icon
                    v-if="stop.disruption"
                    icon="mdi-alert"
                    color="warning"
                    size="small"
                    :aria-label="stop.disruption"
                  />
                </div>
                <div v-if="stop.disruption" class="text-body-small text-warning">
                  {{ stop.disruption }}
                </div>
                <v-progress-circular
                  v-if="stopsStats.isLoading.value"
                  indeterminate
                  size="16"
                  width="2"
                  class="mt-1"
                />
                <div v-else-if="stop.stats" class="d-flex align-center flex-wrap ga-2 mt-1">
                  <v-chip :color="typicalStatus(stop.stats.mean).color" size="small" variant="tonal">
                    Usually {{ typicalStatus(stop.stats.mean).label.toLowerCase() }}
                  </v-chip>
                  <span class="text-body-small text-medium-emphasis">
                    Average {{ formatDelay(stop.stats.mean).toLowerCase() }}<template v-if="stop.onTime !== null">
                      &middot; {{ Math.round(stop.onTime * 100) }}% on time
                    </template>
                  </span>
                </div>
                <div v-else-if="!stopsStats.isError.value" class="text-body-small text-medium-emphasis mt-1">
                  No times here in the last week yet
                </div>
              </div>
              <DelayHistogram
                v-if="stop.stats"
                :histogram="stop.stats.histogram"
                :times="busTimes"
                :caption="stopStatsCaption(stop.stats)"
                :height="40"
                class="stop-row__histogram"
              />
            </div>
          </template>
        </v-card>
      </template>
    </template>

    <!-- Timetable -->
    <h2 class="text-headline-small mt-8 mb-4">
      Timetable
    </h2>

    <div v-if="tripsLoading || activeFeedLoading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="activeTrips.length > 0">
      <!-- schedule periods, e.g. the current one and the next once it's published -->
      <v-select
        v-if="periodOptions.length > 1"
        :model-value="selectedPeriodKey"
        :items="periodOptions"
        label="Schedule"
        density="compact"
        variant="outlined"
        hide-details
        class="mb-3"
        style="max-width: 320px"
        @update:model-value="pickPeriod"
      />

      <div class="d-flex flex-wrap align-center ga-3 mb-5">
        <!-- a typical week; not mandatory, so nothing shows selected while an exact date is -->
        <v-btn-toggle
          v-model="dayToggle"
          color="primary"
          density="compact"
        >
          <v-btn
            v-for="day in DAYS"
            :key="day.field"
            :value="day.field"
            size="small"
          >
            {{ day.label }}
          </v-btn>
        </v-btn-toggle>

        <div v-if="serviceDates" class="d-flex align-center ga-1">
          <v-btn
            icon="mdi-chevron-left"
            variant="text"
            size="small"
            aria-label="Previous date"
            :disabled="!previousDate"
            @click="previousDate && selectDate(previousDate)"
          />
          <v-menu
            v-model="datePickerOpen"
            :close-on-content-click="false"
          >
            <template #activator="{ props: menuProps }">
              <v-btn
                v-bind="menuProps"
                :variant="selectedDate ? 'tonal' : 'outlined'"
                color="primary"
                prepend-icon="mdi-calendar"
                class="text-none"
              >
                {{ dateLabel }}
              </v-btn>
            </template>
            <v-date-picker
              :model-value="pickerValue"
              :min="periods[0]?.start"
              :max="periods[periods.length - 1]?.end"
              @update:model-value="pickDate"
            />
          </v-menu>
          <v-btn
            icon="mdi-chevron-right"
            variant="text"
            size="small"
            aria-label="Next date"
            :disabled="!nextDate"
            @click="nextDate && selectDate(nextDate)"
          />
        </div>

        <v-chip
          v-if="isSpecialDay"
          color="warning"
          variant="tonal"
          prepend-icon="mdi-calendar-alert"
        >
          Special schedule on this date
        </v-chip>

        <!-- when the buses actually went by, on a day that's been and gone -->
        <v-btn-toggle
          v-if="canShowActual"
          v-model="timesMode"
          color="primary"
          density="compact"
          mandatory
        >
          <v-btn value="scheduled" size="small" class="text-none">
            Scheduled
          </v-btn>
          <v-btn value="actual" size="small" class="text-none">
            Actual
          </v-btn>
        </v-btn-toggle>
      </div>

      <!-- Timetable loading -->
      <div v-if="timetableLoading" class="d-flex justify-center py-8">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <!-- No trips for day -->
      <div v-else-if="timetableTrips.length === 0" class="text-medium-emphasis py-4">
        {{ selectedDate ? 'No trips scheduled on this date in this direction.' : 'No trips scheduled for this day and direction.' }}
      </div>

      <!-- Actual times aren't there for today until they're worked out overnight -->
      <div v-else-if="showActual && (selectedDate === today || actualError || !hasActualTimes)" class="text-medium-emphasis py-4">
        <template v-if="selectedDate === today">
          Actual times are worked out overnight, so today's show tomorrow.
        </template>
        <template v-else-if="actualError">
          Actual times couldn't be loaded.
        </template>
        <template v-else>
          No actual times for this date in this direction.
        </template>
        <v-btn
          v-if="previousDate && !actualError"
          variant="text"
          color="primary"
          size="small"
          class="text-none"
          @click="selectDate(previousDate)"
        >
          See {{ formatDate(previousDate, { weekday: 'short', month: 'short', day: 'numeric' }) }}
        </v-btn>
      </div>

      <!-- Timetable table -->
      <template v-else>
        <p class="text-body-small mb-2">
          <strong>Bold</strong> times are P.M.<template v-if="showActual">
            Times are when the bus went by each stop, coloured
            <span class="text-success font-weight-medium">on time</span>,
            <span class="text-warning font-weight-medium">late</span> or
            <span class="text-info font-weight-medium">early</span>
            (2 min or more); a dash wasn't seen.
          </template>
        </p>
        <div class="timetable">
          <!-- a copy of the header row that sticks to the page, see useStickyTableHeader -->
          <div ref="timetableHead" class="timetable-head">
            <table ref="timetableHeadTable" class="timetable-table">
              <TimetableHeaderRow :trips="timetableTrips" :recorded="recordedTripIds" :href="tripHref" :span="showActual ? 2 : 1" />
            </table>
          </div>
          <div
            ref="timetableBox"
            class="timetable-scroll"
            :style="{ marginTop: `-${timetableHeadHeight}px` }"
          >
            <table ref="timetableTable" class="timetable-table">
              <!-- the real header keeps the table's layout, hidden under the copy -->
              <TimetableHeaderRow
                :trips="timetableTrips"
                :recorded="recordedTripIds"
                :href="tripHref"
                :span="showActual ? 2 : 1"
                class="timetable-layout-head"
              />
              <tbody @click="openTripCell">
                <tr v-for="stop in timetableStops" :key="stop.stop_id">
                  <td class="stop-col">
                    <router-link :to="`/stops/${encodeURIComponent(stop.stop_id)}`" class="timetable-link">
                      {{ stop.stop_name }}
                    </router-link>
                  </td>
                  <template v-if="showActual">
                    <!-- each trip's actual time, then how late it was -->
                    <template v-for="trip in timetableTrips" :key="trip.trip_id">
                      <!-- the colour is on the cell, as the link inherits its colour -->
                      <td :class="['time-col', 'timetable-actual-time', actualCell(trip.trip_id, stop.stop_id) && `text-${actualCell(trip.trip_id, stop.stop_id)?.status.color}`]">
                        <a :href="tripHref(trip.trip_id)" class="timetable-link" data-trip-link>
                          <strong v-if="actualCell(trip.trip_id, stop.stop_id)?.pm">{{ actualCell(trip.trip_id, stop.stop_id)?.time }}</strong>
                          <span v-else>{{ actualCell(trip.trip_id, stop.stop_id)?.time ?? '—' }}</span>
                        </a>
                      </td>
                      <td :class="['time-col', 'timetable-delta', actualCell(trip.trip_id, stop.stop_id) && `text-${actualCell(trip.trip_id, stop.stop_id)?.status.color}`]">
                        <a
                          v-if="actualCell(trip.trip_id, stop.stop_id)"
                          :href="tripHref(trip.trip_id)"
                          class="timetable-link"
                          data-trip-link
                        >
                          {{ actualCell(trip.trip_id, stop.stop_id)?.status.label }}
                        </a>
                      </td>
                    </template>
                  </template>
                  <template v-else>
                    <td
                      v-for="trip in timetableTrips"
                      :key="trip.trip_id"
                      class="time-col"
                    >
                      <!-- plain links, as a router-link per cell is thousands of components; openTripCell routes them -->
                      <a :href="tripHref(trip.trip_id)" class="timetable-link" data-trip-link>
                        <strong v-if="cellIsPM(trip.trip_id, stop.stop_id) && cellTime(trip.trip_id, stop.stop_id) !== '—'">
                          {{ cellTime(trip.trip_id, stop.stop_id) }}
                        </strong>
                        <span v-else>{{ cellTime(trip.trip_id, stop.stop_id) }}</span>
                      </a>
                    </td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>

    <div v-else class="text-medium-emphasis">
      No trips found for this route.
    </div>
  </v-container>
</template>

<style scoped>
/* the histogram sits beside the stop on wider screens, and under it on phones */
.stop-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 280px);
  gap: 8px 16px;
  align-items: center;
}

@media (max-width: 599px) {
  .stop-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

.stop-row__name {
  color: inherit;
  text-decoration: none;
}

.stop-row__name:hover {
  text-decoration: underline;
}

.direction-toggle {
  max-width: 100%;
}

/* long headsigns share the width instead of pushing past the screen edge */
.direction-toggle .v-btn {
  flex: 1 1 0;
  min-width: 0;
}

/* on phones the directions stack, so a long headsign gets the full width */
@media (max-width: 599px) {
  .direction-toggle {
    flex-direction: column;
    height: auto;
    width: 100%;
  }

  .direction-toggle .v-btn {
    flex: 0 0 auto;
    min-height: 48px;
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

.direction-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.trains-loader {
  background: transparent;
}

/* the station beside its trains on wide screens, above them on phones */
.station-row {
  align-items: center;
  display: grid;
  gap: 8px 16px;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
}

@media (max-width: 599px) {
  .station-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

.station-name {
  color: inherit;
  text-decoration: none;
}

.station-name:hover {
  text-decoration: underline;
}

.agency-line {
  min-height: 28px;
}

.route-heading {
  align-items: center;
  display: flex;
  gap: 16px;
}
</style>

<!-- unscoped, to reach the header row component; every selector is under .timetable -->
<style>
/*
 * Scrolls sideways only. That makes it a scroll container in both directions (CSS turns
 * the other axis's visible into auto), so headers inside it can't stick to the page,
 * which is why the copy above sticks instead.
 */
.timetable-scroll {
  overflow-x: auto;
  max-width: 100%;
}

.timetable-head {
  background: rgb(var(--v-theme-surface));
  overflow-x: auto;
  position: sticky;
  scrollbar-width: none;
  top: var(--v-layout-top, 0px);
  z-index: 2;
}

.timetable-head::-webkit-scrollbar {
  display: none;
}

.timetable-head .timetable-table {
  table-layout: fixed;
}

.timetable-head th {
  box-sizing: border-box;
}

.timetable-layout-head {
  visibility: hidden;
}

/* separate borders, as collapsed ones don't travel with sticky cells */
.timetable-table {
  border-collapse: separate;
  border-spacing: 0;
  border-left: 1px solid rgba(0, 0, 0, 0.12);
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  font-size: 0.8rem;
  white-space: nowrap;
}

.timetable-table th,
.timetable-table td {
  padding: 4px 12px;
  text-align: center;
  border-right: 1px solid rgba(0, 0, 0, 0.12);
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.timetable-table .stop-col {
  text-align: left;
  min-width: 180px;
  position: sticky;
  left: 0;
  background: rgb(var(--v-theme-surface));
  z-index: 1;
}

.timetable-table thead th {
  background: rgb(var(--v-theme-surface-variant));
  font-weight: 600;
}

.timetable-table thead th.time-col {
  position: relative;
}

/* a trip we recorded on the shown date */
.timetable-recorded-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgb(var(--v-theme-success));
}

/* in actual times, a trip's time and how late it was read as one pair */
.timetable-table .timetable-actual-time {
  border-right: none;
  padding-right: 4px;
}

.timetable-table .timetable-delta {
  font-size: 0.7rem;
  padding-left: 4px;
  text-align: left;
}

/* trip times and stop names link to their pages */
.timetable-link {
  display: block;
  color: inherit;
  text-decoration: none;
}

.timetable-link:hover {
  text-decoration: underline;
}

.timetable-table tbody tr:hover td {
  background: rgba(var(--v-theme-primary), 0.06);
}

.timetable-table tbody tr:hover .stop-col {
  background: rgb(var(--v-theme-surface));
}
</style>
