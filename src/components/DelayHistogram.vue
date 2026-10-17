<script setup>
// @ts-check
import { computed, ref, watch } from 'vue';
import { HISTOGRAM_LATE_MINUTES, binColor, binLabel, histogramBars } from '../utils/delayStats';

const props = defineProps({
  /** @type {import('vue').PropType<import('../utils/delayStats').DelayBin[]>} */
  histogram: { type: Array, required: true },
  // what a bar's count is, e.g. "3 days" or "3 buses"
  /** @type {import('vue').PropType<(count: number) => string>} */
  times: { type: Function, required: true },
  // shown under the bars until one is tapped
  caption: { type: String, default: '' },
  height: { type: Number, default: 64 },
});

const bars = computed(() => histogramBars(props.histogram));
const tallest = computed(() => Math.max(1, ...bars.value.map((bar) => bar.count)));

// tapping a bar says what's in it, as there's no hover on a phone
/** @type {import('vue').Ref<number | null>} */
const pickedMinutes = ref(null);
watch(() => props.histogram, () => {
  pickedMinutes.value = null;
});
const pickedBar = computed(() => bars.value.find((bar) => bar.minutes === pickedMinutes.value) ?? null);

/** @param {number} minutes */
const pickBar = (minutes) => {
  pickedMinutes.value = pickedMinutes.value === minutes ? null : minutes;
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
  <div>
    <div
      class="delay-histogram__bars"
      :style="{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 28px))`, gridTemplateRows: `${height}px auto` }"
      role="group"
      aria-label="How late, by minute"
    >
      <button
        v-for="bar in bars"
        :key="bar.minutes"
        type="button"
        class="delay-histogram__bar"
        :class="{ 'delay-histogram__bar--picked': pickedMinutes === bar.minutes }"
        :aria-label="`${binLabel(bar.minutes)}: ${times(bar.count)}`"
        :aria-pressed="pickedMinutes === bar.minutes"
        @click.stop="pickBar(bar.minutes)"
      >
        <span
          class="delay-histogram__fill"
          :class="`bg-${binColor(bar.minutes)}`"
          :style="{ height: bar.count ? `${Math.max(6, (bar.count / tallest) * 100)}%` : '0' }"
        />
      </button>
      <span
        v-for="label in axisLabels"
        :key="label.minutes"
        class="delay-histogram__axis text-body-small text-medium-emphasis"
        :class="`delay-histogram__axis--${label.align}`"
        :style="{ gridColumn: label.column, gridRow: 2 }"
      >{{ label.text }}</span>
    </div>
    <div class="text-body-small text-medium-emphasis mt-1">
      <template v-if="pickedBar">
        {{ binLabel(pickedBar.minutes) }}: {{ times(pickedBar.count) }}
      </template>
      <template v-else>
        {{ caption }}
      </template>
    </div>
  </div>
</template>

<style scoped>
.delay-histogram__bars {
  display: grid;
  column-gap: 2px;
}

.delay-histogram__bar {
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

.delay-histogram__fill {
  display: block;
  width: 100%;
  border-radius: 2px 2px 0 0;
}

.delay-histogram__bar--picked {
  background: rgba(var(--v-theme-on-surface), 0.08);
}

/* labels hang off their bar, so a narrow one isn't squeezed */
.delay-histogram__axis {
  white-space: nowrap;
  overflow: visible;
  width: 0;
  justify-self: center;
  display: flex;
  justify-content: center;
}

.delay-histogram__axis--start {
  justify-self: start;
  justify-content: flex-start;
}

.delay-histogram__axis--end {
  justify-self: end;
  justify-content: flex-end;
}
</style>
