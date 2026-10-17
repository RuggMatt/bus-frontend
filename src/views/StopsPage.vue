<script setup>
import StopsMap from '../components/StopsMap.vue';
import StopDetails from '../components/StopDetails.vue';
import { computed, ref, watch } from 'vue';
import { usePageTitle } from '../composables/usePageTitle';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { useStops } from '../composables/useStops';
import { useQuery } from '@tanstack/vue-query';
import { getBusStopTimes, getRailStopIds, getTrip } from '../api';
import { tripPath, useStopArrivals } from '../composables/useStopArrivals';
import { alongRouteMetres, distanceMetres, formatDistance } from '../utils/geo';
import { useNowLocal, useServiceAlerts } from '../composables/useServiceAlerts';
import { disruptedStops as stopsWithAlerts } from '../utils/serviceAlerts';
import { stationStops, stopPlaces } from '../utils/stations';

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
const pageRoute = useRoute();
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

/** @type {Record<import('../utils/stations').PlaceType, {title: string, icon: string}>} */
const PLACE_TYPES = {
  'transit-centre': { title: 'Transit centres', icon: 'mdi-bus-multiple' },
  lrt: { title: 'LRT stations', icon: 'mdi-train' },
};

// the quick filter, kept in the URL so back from a stop returns to it
const typeFilter = computed({
  get: () => {
    const value = pageRoute.query.type;
    return typeof value === 'string' && value in PLACE_TYPES ? /** @type {keyof typeof PLACE_TYPES} */ (value) : null;
  },
  /** @param {string | null | undefined} value */
  set: (value) => {
    router.replace({ query: { ...pageRoute.query, type: value || undefined } });
  },
});

// which stops trains serve, to tell LRT stations from transit centres. Only needed once filtering
const { data: railStopIds, isLoading: railLoading, isError: railError } = useQuery({
  queryKey: ['rail-stops'],
  queryFn: getRailStopIds,
  enabled: () => !!typeFilter.value,
  staleTime: Infinity,
});

const places = computed(() =>
  stops.value && railStopIds.value ? stopPlaces(stops.value, new Set(railStopIds.value)) : []);

/**
 * @typedef {Object} StopListRow
 * @property {string} key
 * @property {string} name
 * @property {string} detail
 * @property {string} icon
 * @property {number | null} distance
 * @property {boolean} disrupted
 * @property {import('../api').BusStop} stop What tapping the row opens
 */

/** @type {import('vue').ComputedRef<StopListRow[]>} */
const listRows = computed(() => {
  const type = typeFilter.value;
  if (!type) {
    return nearbyStops.value.map(({ stop, distance }) => ({
      key: stop.stop_id,
      name: stop.stop_name,
      detail: `Stop ${stop.stop_code || stop.stop_id}`,
      icon: 'mdi-bus-stop',
      distance,
      disrupted: disruptedStops.value.has(stop.stop_id),
      stop,
    }));
  }
  const origin = mapCenter.value;
  return places.value
    .filter((place) => place.type === type)
    .map((place) => {
      const count = place.stops.length;
      const noun = type === 'lrt' ? 'platform' : 'bay';
      return {
        key: place.key,
        name: place.name,
        detail: count > 1 ? `${count} ${noun}s` : `Stop ${place.stops[0].stop_code || place.stops[0].stop_id}`,
        icon: PLACE_TYPES[type].icon,
        distance: origin ? distanceMetres([origin.lat, origin.lng], [place.lat, place.lon]) : null,
        disrupted: place.stops.some((stop) => disruptedStops.value.has(stop.stop_id)),
        // the first platform or bay, which links to the others
        stop: place.stops[0],
      };
    })
    .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0) || a.name.localeCompare(b.name));
});

const listLoading = computed(() => stopsLoading.value || (!!typeFilter.value && railLoading.value));
const listError = computed(() => !!stopsError.value || (!!typeFilter.value && railError.value));
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

    <!-- Desktop: a left panel. Mobile: under the map -->
    <div class="stop-panel">
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
      <div v-else class="stop-list pa-3">
        <v-chip-group
          v-model="typeFilter"
          selected-class="text-primary"
          filter
          class="py-0"
          aria-label="Stop type"
        >
          <v-chip
            v-for="(option, value) in PLACE_TYPES"
            :key="value"
            :value="value"
            variant="outlined"
            :prepend-icon="option.icon"
          >
            {{ option.title }}
          </v-chip>
        </v-chip-group>
        <h2 class="text-title-small text-medium-emphasis mt-3 mb-1 px-2">
          {{ typeFilter ? PLACE_TYPES[typeFilter].title : 'Nearby stops' }}
        </h2>
        <v-skeleton-loader v-if="listLoading" type="list-item-two-line@6" class="list-loader" aria-label="Loading stops" />
        <v-alert v-else-if="listError" type="error" variant="tonal">
          Stops could not be loaded.
        </v-alert>
        <div v-else-if="!listRows.length" class="text-medium-emphasis pa-4 text-center">
          No stops found
        </div>
        <v-card v-else variant="outlined">
          <template v-for="(row, index) in listRows" :key="row.key">
            <v-divider v-if="index > 0" />
            <div
              v-ripple
              class="stop-row d-flex align-center ga-3 pa-3"
              role="button"
              tabindex="0"
              @click="selectStop(row.stop)"
              @keydown.enter.prevent="selectStop(row.stop)"
              @keydown.space.prevent="selectStop(row.stop)"
            >
              <v-icon :icon="row.icon" class="text-medium-emphasis flex-shrink-0" />
              <div class="flex-grow-1 min-width-0">
                <div class="text-body-large">
                  {{ row.name }}
                </div>
                <div class="text-body-medium text-medium-emphasis">
                  {{ row.detail }}
                </div>
              </div>
              <v-icon
                v-if="row.disrupted"
                v-tooltip="'Service disruption'"
                icon="mdi-alert"
                color="warning"
                size="small"
                class="flex-shrink-0"
                aria-label="Service disruption"
                role="img"
              />
              <span v-if="row.distance !== null" class="text-body-medium text-medium-emphasis flex-shrink-0 text-no-wrap">
                {{ formatDistance(row.distance) }}
              </span>
            </div>
          </template>
        </v-card>
      </div>
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

.min-width-0 {
  min-width: 0;
}

.stop-row {
  cursor: pointer;
}

.stop-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.list-loader {
  background: transparent;
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
