<script setup>
// @ts-check
import { useQuery } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { getRouteStopStats, getTripStopStats } from '../api';
import { HISTOGRAM_LATE_MINUTES, binColor, binLabel, formatDelay, histogramBars, onTimeShare, typicalStatus } from '../utils/delayStats';
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

const bars = computed(() => histogramBars(stats.value?.histogram ?? []));
const tallest = computed(() => Math.max(1, ...bars.value.map((bar) => bar.count)));
const onTime = computed(() => onTimeShare(stats.value?.histogram ?? []));

// tapping a bar says what's in it, as there's no hover on a phone
/** @type {import('vue').Ref<number | null>} */
const pickedMinutes = ref(null);
watch([scope, () => props.seq, () => props.tripId], () => {
    pickedMinutes.value = null;
});
const pickedBar = computed(() => bars.value.find((bar) => bar.minutes === pickedMinutes.value) ?? null);

/** @param {number} minutes */
const pickBar = (minutes) => {
    pickedMinutes.value = pickedMinutes.value === minutes ? null : minutes;
};

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

// the end bars are labelled, plus on time when it isn't one of them
const axisLabels = computed(() => {
    const list = bars.value;
    if (!list.length) return [];
    const first = /** @type {{minutes: number}} */ (list[0]).minutes;
    const last = /** @type {{minutes: number}} */ (list.at(-1)).minutes;
    /** @param {number} minutes */
    const text = (minutes) => (minutes === 0 ? '0' : `${minutes > 0 ? '+' : ''}${minutes}`);
    return [
        { minutes: first, text: text(first), align: 'start' },
        ...(first < 0 && last > 0 ? [{ minutes: 0, text: '0', align: 'center' }] : []),
        { minutes: last, text: last >= HISTOGRAM_LATE_MINUTES ? `${last}+ min` : `${text(last)} min`, align: 'end' },
    ].map((label) => ({ ...label, column: label.minutes - first + 1 }));
});
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
      <div
        class="delay-stats__bars mt-3"
        :style="{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 28px))` }"
        role="group"
        aria-label="How late, by minute"
      >
        <button
          v-for="bar in bars"
          :key="bar.minutes"
          type="button"
          class="delay-stats__bar"
          :class="{ 'delay-stats__bar--picked': pickedMinutes === bar.minutes }"
          :aria-label="`${binLabel(bar.minutes)}: ${times(bar.count)}`"
          :aria-pressed="pickedMinutes === bar.minutes"
          @click.stop="pickBar(bar.minutes)"
        >
          <span
            class="delay-stats__fill"
            :class="`bg-${binColor(bar.minutes)}`"
            :style="{ height: bar.count ? `${Math.max(6, (bar.count / tallest) * 100)}%` : '0' }"
          />
        </button>
        <span
          v-for="label in axisLabels"
          :key="label.minutes"
          class="delay-stats__axis text-body-small text-medium-emphasis"
          :class="`delay-stats__axis--${label.align}`"
          :style="{ gridColumn: label.column, gridRow: 2 }"
        >{{ label.text }}</span>
      </div>
      <div class="text-body-small text-medium-emphasis mt-1">
        <template v-if="pickedBar">
          {{ binLabel(pickedBar.minutes) }}: {{ times(pickedBar.count) }}
        </template>
        <template v-else>
          {{ basis }}
        </template>
      </div>
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

.delay-stats__bars {
  display: grid;
  grid-template-rows: 64px auto;
  column-gap: 2px;
}

.delay-stats__bar {
  grid-row: 1;
  display: flex;
  align-items: flex-end;
  height: 100%;
  padding: 0;
  border: 0;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: none;
  cursor: pointer;
}

.delay-stats__fill {
  display: block;
  width: 100%;
  border-radius: 2px 2px 0 0;
}

.delay-stats__bar--picked {
  background: rgba(var(--v-theme-on-surface), 0.08);
}

/* labels hang off their bar, so a narrow one isn't squeezed */
.delay-stats__axis {
  white-space: nowrap;
  overflow: visible;
  width: 0;
  justify-self: center;
  display: flex;
  justify-content: center;
}

.delay-stats__axis--start {
  justify-self: start;
  justify-content: flex-start;
}

.delay-stats__axis--end {
  justify-self: end;
  justify-content: flex-end;
}
</style>
