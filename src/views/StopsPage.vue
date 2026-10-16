<script setup>
import StopsMap from '../components/StopsMap.vue';
import StopDetails from '../components/StopDetails.vue';
import { computed, ref, watch } from 'vue';
import { usePageTitle } from '../composables/usePageTitle';
import { useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useStops } from '../composables/useStops';
import { useQuery } from '@tanstack/vue-query';
import { getBusStopTimes, getTrip } from '../api';
import { tripPath, useStopArrivals } from '../composables/useStopArrivals';
import { alongRouteMetres, distanceMetres } from '../utils/geo';
import { useNowLocal, useServiceAlerts } from '../composables/useServiceAlerts';
import { disruptedStops as stopsWithAlerts } from '../utils/serviceAlerts';
import { stationStops } from '../utils/stations';

const props = defineProps({
  stopId: {
    type: String,
    default: null,
  },
});

const NEARBY_STOP_COUNT = 20;

// stops closed, moved or detoured around by an alert in effect, ringed on the map
const serviceAlerts = useServiceAlerts();
const nowLocal = useNowLocal();
const disruptedStops = computed(() => stopsWithAlerts(serviceAlerts.value, nowLocal.value));

const router = useRouter();
const { mdAndUp } = useDisplay();
const { stops, keyedStops, isLoading: stopsLoading, error: stopsError } = useStops();

const selectedStop = computed(() => (props.stopId ? keyedStops.value[props.stopId] ?? null : null));
const stopNotFound = computed(() => Boolean(props.stopId) && Boolean(stops.value) && !selectedStop.value);
usePageTitle(() => (props.stopId ? [selectedStop.value?.stop_name, `Stop ${props.stopId}`] : ['Stops']));

const { routeGroups, isLoading, isError } = useStopArrivals(selectedStop);

// the platforms or bays sharing the stop's station, the stop included
const platformStops = computed(() => (selectedStop.value ? stationStops(selectedStop.value, stops.value ?? []) : []));

// an LRT station's other platform is its other direction, so it's loaded alongside and
// switching to it is instant. Its queries share their keys, so it fills the same cache
const otherPlatform = computed(() =>
  platformStops.value.length === 2
    ? platformStops.value.find((stop) => stop.stop_id !== selectedStop.value?.stop_id) ?? null
    : null);
const {
  routeGroups: otherRouteGroups,
  isLoading: otherIsLoading,
} = useStopArrivals(otherPlatform);
const liveBuses = computed(() => routeGroups.value.flatMap((group) => group.buses));

const map = ref(null);
const mapCenter = ref(null);
/** @type {import('vue').Ref<{lat: number, lng: number} | null>} */
const userLocation = ref(null);
const locating = ref(false);
const showLocationError = ref(false);

const stopSearch = ref('');
const SEARCH_RESULT_COUNT = 20;

const searchableStops = computed(() =>
  (stops.value || [])
    .filter((stop) => !stop.location_type || stop.location_type === '0')
    .map((stop) => ({
      stop,
      // the number riders can read off the sign at the stop
      code: (stop.stop_code || stop.stop_id).toLowerCase(),
      id: stop.stop_id.toLowerCase(),
      name: (stop.stop_name || '').toLowerCase(),
    })),
);

// Best matches first: the exact stop number, then numbers starting with the query, then names
const searchResults = computed(() => {
  const query = (stopSearch.value || '').trim().toLowerCase();
  if (!query) return [];
  const words = query.split(/\s+/);
  const ranked = [];
  for (const candidate of searchableStops.value) {
    let rank;
    if (candidate.id === query) rank = 0;
    else if (candidate.code === query) rank = 1;
    else if (candidate.code.startsWith(query)) rank = 2;
    else if (candidate.name.startsWith(query)) rank = 3;
    else if (words.every((word) => candidate.name.includes(word))) rank = 4;
    else continue;
    ranked.push({ candidate, rank });
  }
  return ranked
    .sort((a, b) => a.rank - b.rank || a.candidate.code.localeCompare(b.candidate.code, undefined, { numeric: true }))
    .slice(0, SEARCH_RESULT_COUNT)
    .map(({ candidate }) => ({
      value: candidate.stop.stop_id,
      title: candidate.stop.stop_name,
      subtitle: `Stop ${candidate.stop.stop_code || candidate.stop.stop_id}`,
    }));
});

const pickSearchResult = (stopId) => {
  const stop = stopId ? keyedStops.value[stopId] : null;
  if (!stop) return;
  stopSearch.value = '';
  // a tapped result would otherwise leave the keyboard covering the stop it opened
  document.activeElement?.blur();
  selectStop(stop);
};

/** @type {import('vue').Ref<number | string | null>} */
const selectedBusId = ref(null);
const following = ref(false);

const selectedBus = computed(
  () => liveBuses.value.find((bus) => bus.bus === selectedBusId.value) ?? null,
);
const selectedTripId = computed(() => selectedBus.value?.trip_id ?? null);

const selectBus = (bus) => {
  // clicking the selected bus again closes it
  if (bus.bus === selectedBusId.value) {
    clearBus();
    return;
  }
  selectedBusId.value = bus.bus;
  following.value = true;
  map.value?.centerOn(bus.lat, bus.long, 16);
};

const clearBus = () => {
  selectedBusId.value = null;
  following.value = false;
};

watch(() => props.stopId, clearBus);

// the bus finished its trip or went past the stop
watch(liveBuses, () => {
  if (selectedBusId.value !== null && !selectedBus.value) {
    clearBus();
  }
});

// same query the arrivals use, so the shape is already cached
const { data: selectedTrip } = useQuery({
  queryKey: computed(() => ['trip-shape', selectedTripId.value]),
  queryFn: () => getTrip(selectedTripId.value),
  enabled: () => !!selectedTripId.value,
  staleTime: Infinity,
});

const { data: selectedTripStopTimes } = useQuery({
  queryKey: computed(() => ['trip-stop-times', selectedTripId.value]),
  queryFn: () => getBusStopTimes(selectedTripId.value),
  enabled: () => !!selectedTripId.value,
  staleTime: Infinity,
});

// The selected bus's route line, with its stops moved onto the line
const tripRoute = computed(() => {
  if (!selectedTripId.value) return null;
  const path = tripPath(selectedTrip.value);
  if (!path.length) return null;
  const tripStops = [];
  for (const stopTime of selectedTripStopTimes.value || []) {
    const stop = keyedStops.value[stopTime.stop_id];
    const lat = Number(stop?.stop_lat);
    const lon = Number(stop?.stop_lon);
    if (!stop || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const onLine = alongRouteMetres(path, [lat, lon]);
    const [onLineLat, onLineLon] = onLine?.point ?? [lat, lon];
    tripStops.push({
      stop,
      lat: onLineLat,
      lon: onLineLon,
      along: onLine?.along ?? 0,
      sequence: Number(stopTime.stop_sequence),
      label: `${stop.stop_name} ${stopTime.arrival_time_fixed || ''}`.trim(),
    });
  }
  tripStops.sort((a, b) => a.sequence - b.sequence);
  return { path, stops: tripStops };
});

// Where the selected bus is along its trip, relative to the selected stop
const selectedBusProgress = computed(() => {
  const bus = selectedBus.value;
  const route = tripRoute.value;
  if (!bus || !route || !selectedStop.value) return null;
  const busAlong = alongRouteMetres(route.path, [bus.lat, bus.long])?.along;
  if (busAlong === undefined) return null;
  const upcoming = route.stops.filter((tripStop) => tripStop.along > busAlong);
  const target = route.stops.find((tripStop) => tripStop.stop.stop_id === selectedStop.value.stop_id);
  return {
    stopsAway: target && !bus.passed
      ? upcoming.filter((tripStop) => tripStop.sequence <= target.sequence).length
      : null,
    nextStopName: upcoming[0]?.stop.stop_name ?? null,
  };
});

const selectStop = (stop) => router.push(`/stops/${encodeURIComponent(stop.stop_id)}`);
const clearStop = () => router.push('/stops');

/**
 * Where the map centres for the picked stop: the middle of its station's platforms, so
 * switching between them (an LRT station's two directions) doesn't nudge the map.
 */
const mapFocus = computed(() => {
  const stop = selectedStop.value;
  if (!stop) return null;
  const points = platformStops.value.length ? platformStops.value : [stop];
  return {
    key: platformStops.value.length ? `station:${stop.parent_station}` : `stop:${stop.stop_id}`,
    lat: points.reduce((sum, point) => sum + Number(point.stop_lat), 0) / points.length,
    lon: points.reduce((sum, point) => sum + Number(point.stop_lon), 0) / points.length,
  };
});

// a stop opened straight from its link shouldn't start with a flight across the city
let hasCentredOnStop = false;
/** @type {string | null} */
let centredKey = null;
watch([mapFocus, map], () => {
  if (!mapFocus.value) {
    centredKey = null;
    return;
  }
  if (!map.value || mapFocus.value.key === centredKey) return;
  map.value.centerOn(mapFocus.value.lat, mapFocus.value.lon, 16, { animate: hasCentredOnStop });
  hasCentredOnStop = true;
  centredKey = mapFocus.value.key;
}, { immediate: true });

const locate = () => {
  if (!navigator.geolocation) {
    showLocationError.value = true;
    return;
  }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation.value = { lat: position.coords.latitude, lng: position.coords.longitude };
      map.value?.centerOn(userLocation.value.lat, userLocation.value.lng, 16);
      locating.value = false;
    },
    () => {
      showLocationError.value = true;
      locating.value = false;
    },
  );
};

// Stops closest to the middle of the map, for picking one without tapping the map
const nearbyStops = computed(() => {
  const origin = mapCenter.value;
  if (!origin || !stops.value) return [];
  return stops.value
    .filter((stop) => !stop.location_type || stop.location_type === '0')
    .map((stop) => ({
      stop,
      distance: distanceMetres([origin.lat, origin.lng], [Number(stop.stop_lat), Number(stop.stop_lon)]),
    }))
    .filter(({ distance }) => Number.isFinite(distance))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, NEARBY_STOP_COUNT);
});
</script>

<template>
  <div class="stops-layout" :class="{ 'stops-layout--mobile': !mdAndUp }">
    <div class="map-container">
      <StopsMap
        ref="map"
        :stops="stops ?? []"
        :selected-stop-id="selectedStop?.stop_id ?? null"
        :buses="liveBuses"
        :user-location="userLocation"
        :locating="locating"
        :selected-bus-id="selectedBusId"
        :following="following"
        :trip-route="tripRoute"
        :disrupted-stops="disruptedStops"
        @stop-click="selectStop"
        @bus-click="selectBus"
        @map-click="clearBus"
        @user-move="following = false"
        @stop-following="following = false"
        @move="mapCenter = $event"
        @locate="locate"
      />
      <v-autocomplete
        v-model:search="stopSearch"
        class="stop-search"
        :model-value="null"
        :items="searchResults"
        item-props
        no-filter
        auto-select-first
        variant="solo"
        density="compact"
        placeholder="Stop number or name"
        enterkeyhint="search"
        aria-label="Search for a stop by number or name"
        prepend-inner-icon="mdi-magnify"
        menu-icon=""
        no-data-text="No matching stops"
        hide-details
        :hide-no-data="!stopSearch"
        :disabled="!stops"
        :loading="stopsLoading"
        @update:model-value="pickSearchResult"
      />
    </div>

    <!-- Desktop: left panel once a stop is picked. Mobile: always-visible list under the map -->
    <div v-if="!mdAndUp || selectedStop" class="stop-panel">
      <StopDetails
        v-if="selectedStop"
        :stop="selectedStop"
        :route-groups="routeGroups"
        :is-loading="isLoading"
        :is-error="isError"
        :selected-bus-id="selectedBusId"
        :selected-bus-progress="selectedBusProgress"
        :other-stop="otherPlatform"
        :other-route-groups="otherRouteGroups"
        :other-is-loading="otherIsLoading"
        @close="clearStop"
        @bus-click="selectBus"
      />
      <template v-else>
        <v-list-subheader>Nearby stops</v-list-subheader>
        <div v-if="stopsLoading" class="d-flex justify-center py-8">
          <v-progress-circular indeterminate color="primary" />
        </div>
        <v-alert v-else-if="stopsError" type="error" variant="tonal" class="mx-4">
          Stops could not be loaded.
        </v-alert>
        <v-list v-else lines="two" class="py-0">
          <v-list-item
            v-for="{ stop, distance } in nearbyStops"
            :key="stop.stop_id"
            prepend-icon="mdi-bus-stop"
            @click="selectStop(stop)"
          >
            <v-list-item-title>{{ stop.stop_name }}</v-list-item-title>
            <v-list-item-subtitle>
              Stop {{ stop.stop_code || stop.stop_id }} · {{ Math.round(distance / 10) * 10 }} m
            </v-list-item-subtitle>
          </v-list-item>
        </v-list>
      </template>
    </div>

    <VSnackbar v-model="showLocationError" location="bottom" :timeout="3000" color="error">
      Your location could not be determined
    </VSnackbar>
    <VSnackbar :model-value="stopNotFound" location="bottom" :timeout="3000" color="error">
      Stop {{ stopId }} could not be found
    </VSnackbar>
  </div>
</template>

<style scoped>
.stops-layout {
  display: flex;
  height: calc(100dvh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px));
  overflow: hidden;
  width: 100%;
}

.map-container {
  flex: 1;
  height: 100%;
  min-width: 0;
  position: relative;
}

/* clear of leaflet's zoom buttons in the top left */
.stop-search {
  left: 56px;
  max-width: 320px;
  position: absolute;
  right: 12px;
  top: 10px;
  z-index: 1;
}

.stop-panel {
  border-right: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
  order: -1;
  overflow-y: auto;
  width: 360px;
}

.stops-layout--mobile {
  flex-direction: column;
}

.stops-layout--mobile .map-container {
  flex: none;
  height: 33dvh;
}

.stops-layout--mobile .stop-panel {
  border-right: 0;
  flex: 1;
  min-height: 0;
  order: 0;
  width: 100%;
}
</style>
