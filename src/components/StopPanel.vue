<script setup>
// A stop's upcoming buses, in the main map's side panel or bottom sheet
import StopDetails from './StopDetails.vue';
import { computed, ref, shallowRef, watch } from 'vue';
import { usePageTitle } from '../composables/usePageTitle';
import { useStops } from '../composables/useStops';
import { useQuery } from '@tanstack/vue-query';
import { getBusStopTimes, getTrip } from '../api';
import { tripPath, useStopArrivals } from '../composables/useStopArrivals';
import { alongRouteMetres } from '../utils/geo';
import { stationStops } from '../utils/stations';

const props = defineProps({
  stopId: {
    type: String,
    required: true,
  },
});

// buses: every bus on its way, for the map to show. select-bus: a bus picked in the list, or null
const emit = defineEmits(['close', 'buses', 'select-bus']);

const { stops, keyedStops, isLoading: stopsLoading } = useStops();

const selectedStop = computed(() => keyedStops.value[props.stopId] ?? null);
const stopNotFound = computed(() => Boolean(stops.value) && !selectedStop.value);
usePageTitle(() => [selectedStop.value?.stop_name, `Stop ${props.stopId}`]);

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

// a transit centre lists every bay's buses, and they're all shown on the map
/** @type {import('vue').ShallowRef<Map<string, import('../composables/useStopArrivals').StopRouteGroup[]>>} */
const bayRouteGroups = shallowRef(new Map());
/**
 * @param {string} stopId
 * @param {import('../composables/useStopArrivals').StopRouteGroup[]} groups
 */
const setBayRouteGroups = (stopId, groups) => {
  const next = new Map(bayRouteGroups.value);
  if (groups.length) next.set(stopId, groups);
  else next.delete(stopId);
  bayRouteGroups.value = next;
};

const liveBuses = computed(() => {
  const seen = new Set();
  return [routeGroups.value, ...bayRouteGroups.value.values()]
    .flatMap((groups) => groups.flatMap((group) => group.buses))
    .filter((bus) => !seen.has(bus.bus) && seen.add(bus.bus));
});

// only while the stop has loaded, so the map doesn't hide every bus while it does
watch(
  () => (isLoading.value ? null : liveBuses.value.map((bus) => bus.bus)),
  (ids) => emit('buses', ids),
  { immediate: true },
);

// the stop a bus is on its way to: the bay it's listed under, at a transit centre
const busStop = (busId) => {
  for (const [stopId, groups] of bayRouteGroups.value) {
    if (groups.some((group) => group.buses.some((bus) => bus.bus === busId))) return keyedStops.value[stopId] ?? null;
  }
  return selectedStop.value;
};

/** @type {import('vue').Ref<number | string | null>} */
const selectedBusId = ref(null);
const selectedBus = computed(
  () => liveBuses.value.find((bus) => bus.bus === selectedBusId.value) ?? null,
);
const selectedTripId = computed(() => selectedBus.value?.trip_id ?? null);

const selectBus = (bus) => {
  // tapping the selected bus again closes it
  selectedBusId.value = bus.bus === selectedBusId.value ? null : bus.bus;
};

watch(() => props.stopId, () => { selectedBusId.value = null; });
watch(selectedBus, (bus, old) => {
  // the bus finished its trip or went past the stop
  if (selectedBusId.value !== null && !bus) selectedBusId.value = null;
  if (bus?.bus !== old?.bus) emit('select-bus', bus);
});

// same queries the arrivals use, so the shape is already cached
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

// Where the selected bus is along its trip, relative to the stop
const selectedBusProgress = computed(() => {
  const bus = selectedBus.value;
  const stop = bus ? busStop(bus.bus) : null;
  const path = tripPath(selectedTrip.value);
  if (!bus || !stop || !path.length) return null;
  const tripStops = [];
  for (const stopTime of selectedTripStopTimes.value || []) {
    const tripStop = keyedStops.value[stopTime.stop_id];
    const along = tripStop ? alongRouteMetres(path, [Number(tripStop.stop_lat), Number(tripStop.stop_lon)])?.along : undefined;
    if (along === undefined) continue;
    tripStops.push({ stop: tripStop, along, sequence: Number(stopTime.stop_sequence) });
  }
  tripStops.sort((a, b) => a.sequence - b.sequence);
  const busAlong = alongRouteMetres(path, [bus.lat, bus.long])?.along;
  if (busAlong === undefined) return null;
  const upcoming = tripStops.filter((tripStop) => tripStop.along > busAlong);
  const target = tripStops.find((tripStop) => tripStop.stop.stop_id === stop.stop_id);
  return {
    stopsAway: target && !bus.passed
      ? upcoming.filter((tripStop) => tripStop.sequence <= target.sequence).length
      : null,
    nextStopName: upcoming[0]?.stop.stop_name ?? null,
  };
});
</script>

<template>
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
    @close="emit('close')"
    @bus-click="selectBus"
    @bay-route-groups="setBayRouteGroups"
  />
  <div v-else-if="stopNotFound" class="d-flex align-center pa-4">
    <div class="flex-grow-1 text-body-large">
      Stop {{ stopId }} could not be found
    </div>
    <v-btn
      icon="mdi-close"
      variant="text"
      density="comfortable"
      aria-label="Close stop details"
      @click="emit('close')"
    />
  </div>
  <v-skeleton-loader v-else-if="stopsLoading" type="heading, list-item-two-line@3" aria-label="Loading stop" />
</template>
