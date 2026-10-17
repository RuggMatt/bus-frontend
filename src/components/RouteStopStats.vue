<script setup>
// @ts-check
import { computed } from 'vue';
import { formatDelay, onTimeShare } from '../utils/delayStats';
import { formatShortDate } from '../utils/weeks';
import DelayHistogram from './DelayHistogram.vue';

// a week of delays for every trip of a route at a stop
const props = defineProps({
  /** @type {import('vue').PropType<import('../api').DelayStats & {trips: number}>} */
  stats: { type: Object, required: true },
});

const range = computed(() => `${formatShortDate(props.stats.from)} – ${formatShortDate(props.stats.to)}`);
const onTime = computed(() => onTimeShare(props.stats.histogram));

const caption = computed(() => {
  const { count, trips } = props.stats;
  return `${count} ${count === 1 ? 'bus' : 'buses'} on ${trips} ${trips === 1 ? 'trip' : 'trips'}`;
});

/** @param {number} count */
const times = (count) => `${count} ${count === 1 ? 'bus' : 'buses'}`;
</script>

<template>
  <div>
    <div class="text-title-small">
      Last week
    </div>
    <div class="text-body-small text-medium-emphasis">
      {{ range }}
      <template v-if="stats.mean !== null">
        &middot; Average {{ formatDelay(stats.mean).toLowerCase() }}
      </template>
      <template v-if="onTime !== null">
        &middot; {{ Math.round(onTime * 100) }}% on time
      </template>
    </div>
    <DelayHistogram :histogram="stats.histogram" :times="times" :caption="caption" class="mt-3" />
  </div>
</template>
