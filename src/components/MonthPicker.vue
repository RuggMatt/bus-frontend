<script setup>
// @ts-check
import { computed } from 'vue';
import { addMonths, formatMonthLabel, monthStart } from '../utils/delayRankings';

// the month's first day, YYYY-MM-DD
const month = defineModel({ type: String, required: true });

const props = defineProps({
    // the earliest and latest days that can be picked, YYYY-MM-DD
    min: {
        type: String,
        default: undefined,
    },
    max: {
        type: String,
        required: true,
    },
});

const label = computed(() => formatMonthLabel(month.value, props.max));
const hasPrevious = computed(() => !props.min || month.value > monthStart(props.min));
const hasNext = computed(() => month.value < monthStart(props.max));
</script>

<template>
  <div class="d-flex align-center ga-1">
    <v-btn
      icon="mdi-chevron-left"
      variant="text"
      size="small"
      aria-label="Previous month"
      :disabled="!hasPrevious"
      @click="month = addMonths(month, -1)"
    />
    <span class="month-label text-button text-none px-2">
      <v-icon icon="mdi-calendar" size="small" class="mr-1" />{{ label }}
    </span>
    <v-btn
      icon="mdi-chevron-right"
      variant="text"
      size="small"
      aria-label="Next month"
      :disabled="!hasNext"
      @click="month = addMonths(month, 1)"
    />
  </div>
</template>

<style scoped>
.month-label {
    text-transform: none;
}
</style>
