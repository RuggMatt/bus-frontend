<script setup>
import { computed } from 'vue';
import { formatScheduledTime } from '../utils/busStatus';

const props = defineProps({
  /** @type {import('vue').PropType<import('../utils/nextArrival').UpcomingArrival[]>} */
  arrivals: {
    type: Array,
    required: true,
  },
  // the grid keeps this many slots, so rows with fewer trains still line up
  columns: {
    type: Number,
    default: 4,
  },
  // the line's colour for the bars, else the theme's primary
  color: {
    type: String,
    default: null,
  },
});

// each train only needs its own label when they go to different places
const mixedHeadsigns = computed(() => new Set(props.arrivals.map((arrival) => arrival.headsign)).size > 1);
</script>

<template>
  <!-- LRT isn't tracked live, so scheduled trains stand in, soonest first -->
  <div class="train-times" :style="{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }">
    <div
      v-for="arrival in arrivals"
      :key="arrival.trip_id"
      class="train-time"
      :style="color ? { borderLeftColor: color } : undefined"
    >
      <div class="text-no-wrap">
        <span class="text-title-large font-weight-medium">{{ arrival.minutes < 1 ? 'Due' : arrival.minutes }}</span>
        <span v-if="arrival.minutes >= 1" class="text-body-medium"> min</span>
      </div>
      <div class="text-body-small">
        {{ formatScheduledTime(arrival.time) }}
      </div>
      <div v-if="mixedHeadsigns" class="text-body-small text-medium-emphasis text-truncate">
        {{ arrival.headsign }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.train-times {
  display: grid;
  gap: 8px;
}

.train-time {
  border-left: 3px solid rgb(var(--v-theme-primary));
  min-width: 0;
  padding-left: 8px;
}
</style>
