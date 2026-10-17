<script setup>
// @ts-check
import { useQuery } from '@tanstack/vue-query';
import { computed } from 'vue';
import { getRouteStopStats, getTripStopStats } from '../api';
import { formatDelay, onTimeShare, typicalStatus } from '../utils/delayStats';
import DelayHistogram from './DelayHistogram.vue';
import { formatShortDate } from '../utils/weeks';

const props = defineProps({
    tripId: { type: [String, Number], required: true },
    // the stop's stop_sequence in the trip
    seq: { type: [String, Number], required: true },
    routeId: { type: String, required: true },
    stopId: { type: String, required: true },
    // the trip passes this stop more than once, so the route's stats only count this visit
    repeated: { type: Boolean, default: false },
});

// 'trip' for this trip at the stop, 'route' for every trip of the route at it
const scope = defineModel('scope', { type: String, default: 'trip' });

// worked out nightly, so there's nothing new to fetch for a while
const STATS_STALE_MS = 60 * 60 * 1000;

// both load at once, so the toggle switches straight away
const tripStats = useQuery({
    queryKey: computed(() => ['trip-stop-stats', String(props.tripId), String(props.seq)]),
    queryFn: () => getTripStopStats(props.tripId, props.seq),
    staleTime: STATS_STALE_MS,
});

const routeStats = useQuery({
    queryKey: computed(() => ['route-stop-stats', props.routeId, props.stopId, props.repeated ? String(props.seq) : null]),
    queryFn: () => getRouteStopStats(props.routeId, props.stopId, props.repeated ? props.seq : null),
    staleTime: STATS_STALE_MS,
});

const shown = computed(() => (scope.value === 'route' ? routeStats : tripStats));
const stats = computed(() => shown.value.data.value);

const onTime = computed(() => onTimeShare(stats.value?.histogram ?? []));

const range = computed(() => (stats.value ? `${formatShortDate(stats.value.from)} – ${formatShortDate(stats.value.to)}` : ''));

// one time a day for a trip, many for the route
const basis = computed(() => {
    const value = stats.value;
    if (!value) return '';
    if (scope.value === 'trip') return `On ${value.count} of the last 7 days`;
    const trips = /** @type {{trips?: number}} */ (value).trips ?? 0;
    return `${value.count} ${value.count === 1 ? 'bus' : 'buses'} on ${trips} ${trips === 1 ? 'trip' : 'trips'}`;
});

/** @param {number} count */
const times = (count) => {
    if (scope.value === 'trip') return `${count} ${count === 1 ? 'day' : 'days'}`;
    return `${count} ${count === 1 ? 'bus' : 'buses'}`;
};
</script>

<template>
  <div class="delay-stats">
    <div class="d-flex align-center flex-wrap ga-2">
      <div class="flex-grow-1">
        <div class="text-title-small">
          Last week
        </div>
        <div v-if="range" class="text-body-small text-medium-emphasis">
          {{ range }}
        </div>
      </div>
      <v-btn-toggle
        v-model="scope"
        mandatory
        density="compact"
        variant="outlined"
        divided
        color="primary"
        class="delay-stats__toggle"
        @click.stop
      >
        <v-btn value="trip" size="small">
          This trip
        </v-btn>
        <v-btn value="route" size="small">
          Whole route
        </v-btn>
      </v-btn-toggle>
    </div>
    <v-progress-circular
      v-if="shown.isLoading.value"
      indeterminate
      size="20"
      width="2"
      class="mt-2"
    />
    <div v-else-if="shown.isError.value" class="text-error mt-2">
      Stats for this stop could not be loaded.
    </div>
    <div v-else-if="!stats?.count || stats.mean === null" class="text-medium-emphasis mt-2">
      {{ scope === 'trip' ? 'No times for this trip here in the last week yet' : 'No times for this route here in the last week yet' }}
    </div>
    <template v-else>
      <div class="d-flex align-center flex-wrap ga-2 mt-2">
        <v-chip :color="typicalStatus(stats.mean).color" size="small" variant="tonal">
          Usually {{ typicalStatus(stats.mean).label.toLowerCase() }}
        </v-chip>
        <span class="text-body-small text-medium-emphasis">
          Average {{ formatDelay(stats.mean).toLowerCase() }}<template v-if="onTime !== null">
            &middot; {{ Math.round(onTime * 100) }}% on time
          </template>
        </span>
      </div>
      <DelayHistogram :histogram="stats.histogram" :times="times" :caption="basis" class="mt-3" />
    </template>
  </div>
</template>

<style scoped>
/* on phones the toggle takes the full width, under the heading */
@media (max-width: 599px) {
  .delay-stats__toggle {
    width: 100%;
  }

  .delay-stats__toggle .v-btn {
    flex: 1 1 0;
  }
}
</style>
