<script setup>
// @ts-check
import { useQueries, useQuery } from '@tanstack/vue-query';
import { getTripsByRouteId, getStopTimesByTripIds, getActiveTripsByRouteId, getTrip } from '../api';
import { useRoutes } from '../composables/useRoutes';
import { useBuses } from '../composables/useBuses';
import { useStops } from '../composables/useStops';
import RouteBadge from '../components/RouteBadge.vue';
import RouteBusCard from '../components/RouteBusCard.vue';
import TransitMap from '../components/TransitMap.vue';
import TimetableHeaderRow from '../components/TimetableHeaderRow.vue';
import { useStickyTableHeader } from '../composables/useStickyTableHeader';
import { tripPath } from '../composables/useStopArrivals';
import { directionLabels as labelDirections, representativeTrips } from '../utils/routes';
import { serviceRunsOnDay, WEEKDAYS } from '../utils/serviceTime';
import { computed, ref, watch } from 'vue';
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

// handed over by the stop page so the header and buses can show (and morph in) before their data loads
/** @type {{ routeLongName?: string, buses?: Array<{ bus: number | string, trip: string }> }} */
const handoff = window.history.state ?? {};

const routeLongName = computed(() => route.value?.route_long_name ?? handoff.routeLongName ?? '');

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

// Trips filtered to the currently-active GTFS feed, deduplicated by trip_id
const activeTrips = computed(() => {
  if (!trips.value) return [];
  const activeSet = activeFeedTripIdSet.value;
  const filtered = activeSet
    ? trips.value.filter((t) => activeSet.has(t.trip_id))
    : trips.value;
  // Deduplicate by trip_id
  const seen = new Set();
  return filtered.filter((t) => {
    if (seen.has(t.trip_id)) return false;
    seen.add(t.trip_id);
    return true;
  });
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

const { data: directionStopTimes } = useQuery({
  queryKey: computed(() => ['route-direction-stops', props.routeId, directionTripIds.value.join(',')]),
  queryFn: () => getStopTimesByTripIds(directionTripIds.value),
  enabled: () => directionTripIds.value.length > 0,
  staleTime: Infinity,
});

const mapStops = computed(() =>
  [...new Set((directionStopTimes.value ?? []).map((st) => st.stop_id))]
    .map((stopId) => keyedStops.value?.[stopId])
    .filter((stop) => !!stop)
    .map((stop) => ({
      stop_id: stop.stop_id,
      stop_name: stop.stop_name,
      lat: Number(stop.stop_lat),
      lon: Number(stop.stop_lon),
    }))
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

// --- Timetable state ---
const DAYS = [
  { label: 'Mon', field: 'monday' },
  { label: 'Tue', field: 'tuesday' },
  { label: 'Wed', field: 'wednesday' },
  { label: 'Thu', field: 'thursday' },
  { label: 'Fri', field: 'friday' },
  { label: 'Sat', field: 'saturday' },
  { label: 'Sun', field: 'sunday' },
];

/**
 * @type {import('vue').Ref<'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday'>}
 */
const selectedDay = ref(WEEKDAYS[new Date().getDay()] ?? 'monday');
const selectedEffectiveDate = ref('');

/**
 * Parses YY-MM from service_id format like DX-001-Weekday-1-26-06-1111100.
 * @param {string} serviceId
 * @returns {string|null} YYYY-MM
 */
function getEffectiveDateKey(serviceId) {
  const match = serviceId.match(/-(\d{2})-(\d{2})-\d{7}$/);
  if (!match) return null;
  const yy = match[1];
  const mm = match[2];
  return `20${yy}-${mm}`;
}

const effectiveDateOptions = computed(() => {
  if (!activeTrips.value.length) return [];
  const keys = new Set();
  for (const trip of activeTrips.value) {
    const key = getEffectiveDateKey(trip.service_id || '');
    if (key) keys.add(key);
  }
  return [...keys]
    .sort((a, b) => b.localeCompare(a))
    .map((key) => ({
      title: key,
      value: key,
    }));
});

const activeTripsForDate = computed(() => {
  if (!activeTrips.value.length) return [];
  const selected = selectedEffectiveDate.value || effectiveDateOptions.value[0]?.value;
  if (!selected) return activeTrips.value;
  return activeTrips.value.filter((trip) => getEffectiveDateKey(trip.service_id || '') === selected);
});

watch(effectiveDateOptions, (options) => {
  if (!options.length) {
    selectedEffectiveDate.value = '';
    return;
  }
  const exists = options.some((opt) => opt.value === selectedEffectiveDate.value);
  if (!exists) {
    selectedEffectiveDate.value = options.map((opt) => opt.value).find((value) => !!value) || '';
  }
}, { immediate: true });

// --- Trips for selected day + direction ---
const dayTrips = computed(() => {
  if (!activeTripsForDate.value.length) return [];
  return activeTripsForDate.value.filter((trip) =>
    trip.direction_id === selectedDirection.value &&
    serviceRunsOnDay(trip.service_id, selectedDay.value)
  );
});

const dayTripIds = computed(() => dayTrips.value.map((t) => t.trip_id));

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
watch([timetableTrips, timetableStops], sizeColumns, { flush: 'post' });

const timetableLoading = computed(
  () => tripsLoading.value || activeFeedLoading.value || stopTimesLoading.value
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

    <!-- the map, buses and timetable all follow the direction -->
    <v-btn-toggle
      v-if="directions.length > 1"
      v-model="selectedDirection"
      mandatory
      color="primary"
      variant="outlined"
      divided
      class="direction-toggle mt-6"
    >
      <v-btn
        v-for="dir in directions"
        :key="dir"
        :value="dir"
        class="text-none"
      >
        <span class="text-truncate">{{ directionLabels[dir] }}</span>
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

    <!-- Active Buses -->
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

    <!-- Timetable -->
    <h2 class="text-headline-small mt-8 mb-4">
      Timetable
    </h2>

    <div v-if="tripsLoading || activeFeedLoading" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else-if="activeTrips.length > 0">
      <!-- Effective date selector -->
      <div v-if="effectiveDateOptions.length > 1" class="mb-3">
        <v-select
          v-model="selectedEffectiveDate"
          :items="effectiveDateOptions"
          label="Route Effective Date"
          density="compact"
          variant="outlined"
          hide-details
          style="max-width: 240px"
        />
      </div>

      <!-- Day selector -->
      <div class="mb-5">
        <v-btn-toggle
          v-model="selectedDay"
          mandatory
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
      </div>

      <!-- Timetable loading -->
      <div v-if="timetableLoading" class="d-flex justify-center py-8">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <!-- No trips for day -->
      <div v-else-if="timetableTrips.length === 0" class="text-medium-emphasis py-4">
        No trips scheduled for this day and direction.
      </div>

      <!-- Timetable table -->
      <template v-else>
        <p class="text-body-small mb-2">
          <strong>Bold</strong> times are P.M.
        </p>
        <div class="timetable">
          <!-- a copy of the header row that sticks to the page, see useStickyTableHeader -->
          <div ref="timetableHead" class="timetable-head">
            <table ref="timetableHeadTable" class="timetable-table">
              <TimetableHeaderRow :trips="timetableTrips" />
            </table>
          </div>
          <div
            ref="timetableBox"
            class="timetable-scroll"
            :style="{ marginTop: `-${timetableHeadHeight}px` }"
          >
            <table ref="timetableTable" class="timetable-table">
              <!-- the real header keeps the table's layout, hidden under the copy -->
              <TimetableHeaderRow :trips="timetableTrips" class="timetable-layout-head" />
              <tbody @click="openTripCell">
                <tr v-for="stop in timetableStops" :key="stop.stop_id">
                  <td class="stop-col">
                    <router-link :to="`/stops/${encodeURIComponent(stop.stop_id)}`" class="timetable-link">
                      {{ stop.stop_name }}
                    </router-link>
                  </td>
                  <td
                    v-for="trip in timetableTrips"
                    :key="trip.trip_id"
                    class="time-col"
                  >
                    <!-- plain links, as a router-link per cell is thousands of components; openTripCell routes them -->
                    <a :href="`/trips/${trip.trip_id}`" class="timetable-link" data-trip-link>
                      <strong v-if="cellIsPM(trip.trip_id, stop.stop_id) && cellTime(trip.trip_id, stop.stop_id) !== '—'">
                        {{ cellTime(trip.trip_id, stop.stop_id) }}
                      </strong>
                      <span v-else>{{ cellTime(trip.trip_id, stop.stop_id) }}</span>
                    </a>
                  </td>
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
.direction-toggle {
  max-width: 100%;
}

@media (max-width: 599px) {
  .direction-toggle {
    width: 100%;
  }
}

/* long headsigns share the width instead of pushing past the screen edge */
.direction-toggle .v-btn {
  flex: 1 1 0;
  min-width: 0;
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
  top: var(--v-layout-top, 64px);
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
