<script setup>
// @ts-check
import { computed, ref } from 'vue';
import { addDays, formatDayLabel } from '../utils/weeks';

// the day, YYYY-MM-DD
const day = defineModel({ type: String, required: true });

const props = defineProps({
    // the earliest and latest days that can be picked, YYYY-MM-DD
    min: {
        type: String,
        required: true,
    },
    max: {
        type: String,
        required: true,
    },
    // today in Edmonton, for the label
    today: {
        type: String,
        required: true,
    },
    // whether a day between min and max can be picked, e.g. one the service runs on
    allowed: {
        type: /** @type {import('vue').PropType<(date: string) => boolean>} */ (Function),
        default: () => true,
    },
});

const menu = ref(false);

const label = computed(() => formatDayLabel(day.value, props.today));

/**
 * The nearest pickable day before or after the selected one
 * @param {-1 | 1} direction
 * @returns {string | null}
 */
const nearest = (direction) => {
    for (let date = addDays(day.value, direction); date >= props.min && date <= props.max; date = addDays(date, direction)) {
        if (props.allowed(date)) return date;
    }
    return null;
};

const previous = computed(() => nearest(-1));
const next = computed(() => nearest(1));

/** @param {string} date */
const toPickerDate = (date) => new Date(`${date}T00:00:00`);

/** @param {unknown} date the picker's local-midnight date */
const fromPickerDate = (date) => {
    if (typeof date === 'string') return date.slice(0, 10);
    if (!(date instanceof Date)) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** @param {unknown} date */
const allowedDate = (date) => {
    const value = fromPickerDate(date);
    return !!value && props.allowed(value);
};

/** @param {unknown} value */
const pick = (value) => {
    const date = fromPickerDate(value);
    if (!date) return;
    day.value = date;
    menu.value = false;
};
</script>

<template>
  <div class="d-flex align-center ga-1">
    <v-btn
      icon="mdi-chevron-left"
      variant="text"
      size="small"
      aria-label="Previous day"
      :disabled="!previous"
      @click="previous && (day = previous)"
    />
    <v-menu v-model="menu" :close-on-content-click="false" location="bottom center">
      <template #activator="{ props: activator }">
        <v-btn
          v-bind="activator"
          variant="text"
          prepend-icon="mdi-calendar"
          class="day-label text-none"
          aria-label="Pick a day"
        >
          {{ label }}
        </v-btn>
      </template>
      <v-date-picker
        :model-value="toPickerDate(day)"
        :min="min"
        :max="max"
        :allowed-dates="allowedDate"
        hide-header
        @update:model-value="pick"
      />
    </v-menu>
    <v-btn
      icon="mdi-chevron-right"
      variant="text"
      size="small"
      aria-label="Next day"
      :disabled="!next"
      @click="next && (day = next)"
    />
  </div>
</template>

<style scoped>
.day-label {
    min-width: 0;
}
</style>
