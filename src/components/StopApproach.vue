<script setup>
// @ts-check
import { computed } from 'vue';
import { approachWindow } from '../utils/stopRouteTimes';

// a bus's last few stops before this one as dots on a line, with the bus between two of
// them. The strip slides forward as the bus goes, so stops further on come into view
// and the ones it has left go off the edge, rather than the dots being redrawn
const props = defineProps({
    // the trip's stops up to and including this one
    names: { type: Array, required: true },
    // where the bus is, in stops from the first (see approachTrack)
    bus: { type: Number, required: true },
    // how many stops apart the edges are
    width: { type: Number, default: 5 },
    label: { type: String, default: '' },
});

const last = computed(() => props.names.length - 1);
const view = computed(() => approachWindow(last.value, props.bus, props.width));
// one stop's share of the width, in %
const slot = computed(() => 100 / props.width);
const leftName = computed(() => props.names[Math.max(0, view.value.offset)] ?? '');
</script>

<template>
  <div class="approach" role="img" :aria-label="label">
    <!-- far off, the stops fade out before this stop, pinned to the right edge -->
    <div class="approach__clip" :class="{ 'approach__clip--far': view.far }">
      <div class="approach__track" :style="{ transform: `translateX(${-view.offset * slot}%)` }">
        <div class="approach__line" :style="{ width: `${last * slot}%` }" />
        <span
          v-for="(name, index) in names"
          :key="index"
          class="approach__dot"
          :class="{ 'approach__dot--passed': index < bus, 'approach__dot--here': index === last }"
          :style="{ left: `${index * slot}%` }"
        />
        <v-icon
          icon="mdi-bus"
          color="primary"
          size="small"
          class="approach__bus"
          :style="{ left: `${bus * slot}%` }"
        />
      </div>
    </div>
    <template v-if="view.far">
      <div class="approach__line approach__line--rest" :style="{ left: `${(width - 1) * slot}%` }" />
      <span class="approach__gap text-medium-emphasis" :style="{ left: `${(width - 0.5) * slot}%` }">&hellip;</span>
      <span class="approach__dot approach__dot--here" style="left: 100%" />
    </template>
  </div>
  <div class="d-flex justify-space-between ga-2 text-body-small text-medium-emphasis mt-1">
    <span v-if="last > 0" class="approach__label">{{ leftName }}</span>
    <span class="approach__label text-right ml-auto">This stop</span>
  </div>
</template>

<style scoped>
.approach {
  position: relative;
  height: 28px;
  margin: 0 8px;
}

/* wider than the strip, so the dots and the bus at the edges aren't cut in half */
.approach__clip {
  position: absolute;
  inset: 0 -8px;
  overflow: hidden;
}

.approach__clip--far {
  mask-image: linear-gradient(to right, #000 80%, transparent 94%);
}

.approach__track {
  position: absolute;
  inset: 0 8px;
  transition: transform 1.2s ease;
}

.approach__line {
  position: absolute;
  left: 0;
  top: 20px;
  border-top: 2px solid rgba(var(--v-theme-on-surface), 0.25);
}

.approach__line--rest {
  right: 0;
  border-top-style: dashed;
}

.approach__dot {
  position: absolute;
  top: 15px;
  width: 12px;
  height: 12px;
  margin-left: -6px;
  border-radius: 50%;
  border: 2px solid rgba(var(--v-theme-on-surface), 0.5);
  background: rgb(var(--v-theme-surface));
  transition: background-color 0.6s, border-color 0.6s;
}

.approach__dot--passed {
  border-color: rgba(var(--v-theme-on-surface), 0.25);
  background: rgba(var(--v-theme-on-surface), 0.25);
}

.approach__dot--here {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
}

.approach__gap {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  line-height: 1;
}

.approach__bus {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  transition: left 1.2s ease;
}

.approach__label {
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
