<script setup>
import { computed, ref, watch } from 'vue';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { getElectricBuses, getHydrogenBuses, getTripSummaries } from '../api';
import { nextBusRefreshDelay } from '../utils/busRefresh';
import { finderRows } from '../utils/busFinder';
import { formatDistance } from '../utils/geo';
import { headsignWithoutRoute } from '../utils/routes';
import TransitMap from '../components/TransitMap.vue';
import RouteBadge from '../components/RouteBadge.vue';
import BusLink from '../components/BusLink.vue';

const props = defineProps({
  /** @type {import('vue').PropType<'electric' | 'hydrogen'>} */
  kind: {
    type: String,
    required: true,
  },
});

const FINDERS = {
  electric: { title: 'Electric Buses', fetch: getElectricBuses, empty: 'No electric buses are out right now.' },
  hydrogen: { title: 'Hydrogen Bus', fetch: getHydrogenBuses, empty: "The hydrogen bus isn't out right now." },
};
const finder = computed(() => FINDERS[props.kind]);

// both endpoints are filtered views of the /bus/now snapshot, so refetch with it
const { data: buses, isLoading, isError } = useQuery({
  queryKey: computed(() => ['finder-buses', props.kind]),
  queryFn: () => finder.value.fetch(),
  staleTime: (query) => nextBusRefreshDelay(query.state.data, query.state.dataUpdatedAt),
  refetchInterval: (query) => nextBusRefreshDelay(query.state.data),
});

const tripIds = computed(() =>
  [...new Set((buses.value ?? []).map((bus) => bus.trip).filter(Boolean).map(String))].sort(),
);
const { data: tripSummaries } = useQuery({
  queryKey: computed(() => ['trip-summaries', tripIds.value]),
  queryFn: () => getTripSummaries(tripIds.value),
  enabled: computed(() => tripIds.value.length > 0),
  staleTime: Infinity,
  // a bus starting a new trip shouldn't blank every row's route
  placeholderData: keepPreviousData,
});
const tripsById = computed(() => new Map((tripSummaries.value ?? []).map((trip) => [String(trip.trip_id), trip])));

// only asked for when the locate button is tapped, never on load. until then the
// list goes by bus number
/** @type {import('vue').Ref<[number, number] | null>} */
const userLocation = ref(null);
const locating = ref(false);
const showLocationError = ref(false);
const locate = () => {
  if (!navigator.geolocation) {
    showLocationError.value = true;
    return;
  }
  locating.value = true;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      userLocation.value = [position.coords.latitude, position.coords.longitude];
      locating.value = false;
    },
    () => {
      showLocationError.value = true;
      locating.value = false;
    },
  );
};

const rows = computed(() => finderRows(buses.value ?? [], tripsById.value, userLocation.value));

/** @type {import('vue').Ref<number | string | null>} */
const selectedBus = ref(null);
watch(() => props.kind, () => {
  selectedBus.value = null;
});
const toggle = (bus) => {
  selectedBus.value = selectedBus.value === bus.bus ? null : bus.bus;
};

// the map follows the first bus: the picked one, else the nearest
const mapBuses = computed(() => {
  const all = rows.value.map((row) => row.bus);
  const picked = all.find((bus) => bus.bus === selectedBus.value);
  return picked ? [picked, ...all.filter((bus) => bus !== picked)] : all;
});
</script>

<template>
  <v-container>
    <h1 class="text-headline-small px-2">
      {{ finder.title }}
    </h1>
    <div class="finder-map-wrapper mt-3">
      <TransitMap
        :buses="mapBuses"
        :user-location="userLocation"
        follow-bus
        show-age
        class="finder-map"
      />
      <v-btn
        class="locate-button"
        icon="mdi-crosshairs-gps"
        size="small"
        elevation="2"
        aria-label="Sort by distance from my location"
        :loading="locating"
        @click="locate"
      />
    </div>
    <v-snackbar v-model="showLocationError" location="bottom" :timeout="3000" color="error">
      Your location could not be determined
    </v-snackbar>

    <div v-if="isLoading" class="d-flex justify-center py-6">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <v-alert v-else-if="isError" type="error" variant="tonal" class="mt-3">
      The buses could not be loaded.
    </v-alert>
    <v-alert v-else-if="!rows.length" type="info" variant="tonal" class="mt-3">
      {{ finder.empty }}
    </v-alert>
    <v-card v-else variant="outlined" class="mt-3">
      <template v-for="(row, index) in rows" :key="row.bus.bus">
        <v-divider v-if="index" />
        <div
          class="finder-row pa-3"
          :class="{ 'finder-row--selected': row.bus.bus === selectedBus }"
          role="button"
          tabindex="0"
          :aria-expanded="row.bus.bus === selectedBus"
          @click="toggle(row.bus)"
          @keydown.enter.prevent="toggle(row.bus)"
          @keydown.space.prevent="toggle(row.bus)"
        >
          <div class="d-flex align-center ga-3">
            <RouteBadge v-if="row.trip" :route-id="row.trip.route_id" size="small" class="flex-shrink-0" />
            <div class="flex-grow-1 min-width-0">
              <div class="text-title-medium text-truncate">
                {{ row.trip ? headsignWithoutRoute(row.trip.trip_headsign, row.trip.route_id) : 'Not in service' }}
              </div>
              <div class="text-body-medium text-medium-emphasis">
                <BusLink :bus="row.bus.bus" />
                · {{ Math.round(row.bus.speed * 3.6) }} km/h
              </div>
            </div>
            <div v-if="row.distance !== null" class="text-title-medium flex-shrink-0">
              {{ formatDistance(row.distance) }}
            </div>
          </div>
          <v-btn
            v-if="row.bus.bus === selectedBus && row.bus.trip"
            :to="`/trips/${row.bus.trip}`"
            block
            variant="tonal"
            color="primary"
            class="mt-3"
            @click.stop
          >
            Trip details
          </v-btn>
        </div>
      </template>
    </v-card>
  </v-container>
</template>

<style scoped>
.min-width-0 {
    min-width: 0;
}

.finder-map {
    --transit-map-height: max(40vh, 280px);
}

.finder-map-wrapper {
    position: relative;
}

.locate-button {
    bottom: 24px;
    position: absolute;
    right: 12px;
    z-index: 1;
}

.finder-row {
    cursor: pointer;
}

.finder-row:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
}

.finder-row--selected,
.finder-row--selected:hover {
    background: rgba(var(--v-theme-primary), 0.08);
}
</style>
