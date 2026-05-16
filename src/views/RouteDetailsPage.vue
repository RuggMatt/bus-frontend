<script setup>
// @ts-check
import { useQuery } from '@tanstack/vue-query';
import { getTripsByRouteId, getServiceCalendars, getStopTimesByTripIds } from '../api';
import { useRoutes } from '../composables/useRoutes';
import { useBuses } from '../composables/useBuses';
import { useStops } from '../composables/useStops';
import { computed, ref } from 'vue';

const props = defineProps({
  routeId: {
    type: String,
    required: true,
  },
});

const { keyedroutes } = useRoutes();
const { buses } = useBuses();
const { keyedStops } = useStops();

const route = computed(() => keyedroutes.value?.[props.routeId] ?? null);

// --- Trips for this route ---
const { data: trips, isLoading: tripsLoading } = useQuery({
  queryKey: ['route-trips', props.routeId],
  queryFn: () => getTripsByRouteId(props.routeId),
  enabled: !!props.routeId,
});

// --- Active buses ---
const activeBuses = computed(() => {
  if (!buses.value) return [];
  return buses.value.filter((bus) => bus.route_id === props.routeId);
});

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

const DAY_JS_INDEX = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const selectedDay = ref(DAY_JS_INDEX[new Date().getDay()] ?? 'monday');
const selectedDirection = ref('0');

// --- Available directions derived from trips ---
const availableDirections = computed(() => {
  if (!trips.value) return [];
  return [...new Set(trips.value.map((t) => t.direction_id))].sort();
});

// Headsign labels per direction (use the most common headsign per direction)
const directionLabels = computed(() => {
  if (!trips.value) return {};
  /** @type {Map<string, Map<string, number>>} */
  const counts = new Map();
  trips.value.forEach((t) => {
    const bucket = counts.get(t.direction_id) ?? new Map();
    const hs = t.trip_headsign || '';
    bucket.set(hs, (bucket.get(hs) ?? 0) + 1);
    counts.set(t.direction_id, bucket);
  });
  /** @type {Record<string, string>} */
  const labels = {};
  counts.forEach((hsMap, dir) => {
    const top = [...hsMap.entries()].sort((a, b) => b[1] - a[1])[0];
    labels[dir] = top?.[0] || `Direction ${dir}`;
  });
  return labels;
});

// --- Service calendar ---
const serviceIds = computed(() => {
  if (!trips.value) return [];
  return [...new Set(trips.value.map((t) => t.service_id))];
});

const { data: calendarData, isLoading: calendarLoading } = useQuery({
  queryKey: computed(() => ['service-calendars', serviceIds.value.join(',')] ),
  queryFn: () => getServiceCalendars(serviceIds.value),
  enabled: computed(() => serviceIds.value.length > 0),
  retry: false,
});

const calendarMap = computed(() => {
  if (!calendarData.value) return {};
  /** @type {Record<string, any>} */
  const map = {};
  calendarData.value.forEach((entry) => {
    map[entry.service_id] = entry;
  });
  return map;
});

// Whether calendar data actually loaded (non-empty) so we can decide how to filter
const hasCalendarData = computed(
  () => !calendarLoading.value && calendarData.value != null && calendarData.value.length > 0
);

// --- Trips for selected day + direction ---
const dayTrips = computed(() => {
  if (!trips.value) return [];
  return trips.value.filter((trip) => {
    if (trip.direction_id !== selectedDirection.value) return false;
    if (!hasCalendarData.value) return true; // no calendar: show all
    const cal = calendarMap.value[trip.service_id];
    if (!cal) return false;
    const dayField = String(selectedDay.value);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return cal[dayField] === '1' || cal[dayField] === true;
  });
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
      stop_name: keyedStops.value?.[stop_id]?.stop_name || `Stop ${stop_id}`,
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

const timetableLoading = computed(
  () => tripsLoading.value || calendarLoading.value || stopTimesLoading.value
);

// --- Time helpers ---

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

    <div v-if="!route" class="text-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <template v-else>
      <h1 class="text-h4 mb-1">
        Route {{ route.route_short_name || route.route_id }}
      </h1>
      <p class="text-subtitle-1 text-medium-emphasis mb-6">{{ route.route_long_name }}</p>

      <v-row>
        <v-col cols="12" sm="4">
          <v-card variant="tonal" color="primary">
            <v-card-text>
              <div class="text-overline">Route ID</div>
              <div class="text-h6">{{ route.route_id }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card variant="tonal" color="secondary">
            <v-card-text>
              <div class="text-overline">Type</div>
              <div class="text-h6">{{ route.route_type_descr || route.route_type }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <v-col cols="12" sm="4">
          <v-card variant="tonal" color="success">
            <v-card-text>
              <div class="text-overline">Active Buses</div>
              <div class="text-h6">{{ activeBuses.length }}</div>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>

      <!-- Active Buses -->
      <h2 class="text-h5 mt-8 mb-3">Active Buses</h2>
      <div v-if="activeBuses.length === 0" class="text-medium-emphasis mb-4">
        No buses currently active on this route.
      </div>
      <div v-else class="d-flex flex-wrap gap-2 mb-4">
        <router-link
          v-for="bus in activeBuses"
          :key="bus.bus"
          :to="`/trips/${bus.trip}`"
        >
          <v-chip color="primary" variant="elevated" prepend-icon="mdi-bus">
            {{ bus.bus }}
          </v-chip>
        </router-link>
      </div>

      <!-- Timetable -->
      <h2 class="text-h5 mt-8 mb-4">Timetable</h2>

      <div v-if="tripsLoading" class="d-flex justify-center py-8">
        <v-progress-circular indeterminate color="primary" />
      </div>

      <template v-else-if="trips && trips.length">
        <!-- Direction selector -->
        <v-btn-toggle
          v-model="selectedDirection"
          mandatory
          color="primary"
          density="compact"
          class="mb-3"
        >
          <v-btn
            v-for="dir in availableDirections"
            :key="dir"
            :value="dir"
            size="small"
          >
            {{ directionLabels[dir] || `Direction ${dir}` }}
          </v-btn>
        </v-btn-toggle>

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
        <div v-else class="timetable-scroll">
          <table class="timetable-table">
            <thead>
              <tr>
                <th class="stop-col">Stop</th>
                <th
                  v-for="trip in timetableTrips"
                  :key="trip.trip_id"
                  class="time-col"
                >
                  <strong v-if="trip.headerPM">{{ trip.headerTime }}</strong>
                  <span v-else>{{ trip.headerTime }}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="stop in timetableStops" :key="stop.stop_id">
                <td class="stop-col">{{ stop.stop_name }}</td>
                <td
                  v-for="trip in timetableTrips"
                  :key="trip.trip_id"
                  class="time-col"
                >
                  <strong v-if="cellIsPM(trip.trip_id, stop.stop_id) && cellTime(trip.trip_id, stop.stop_id) !== '—'">
                    {{ cellTime(trip.trip_id, stop.stop_id) }}
                  </strong>
                  <span v-else>{{ cellTime(trip.trip_id, stop.stop_id) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="text-caption mt-3"><strong>Bold</strong> times are P.M.</p>
        </div>
      </template>

      <div v-else class="text-medium-emphasis">
        No trips found for this route.
      </div>
    </template>
  </v-container>
</template>

<style scoped>
.timetable-scroll {
  overflow-x: auto;
  max-width: 100%;
}

.timetable-table {
  border-collapse: collapse;
  font-size: 0.8rem;
  white-space: nowrap;
}

.timetable-table th,
.timetable-table td {
  padding: 4px 12px;
  text-align: center;
  border: 1px solid rgba(0, 0, 0, 0.12);
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

.timetable-table thead .stop-col {
  z-index: 2;
}

.timetable-table tbody tr:hover td {
  background: rgba(var(--v-theme-primary), 0.06);
}
</style>
