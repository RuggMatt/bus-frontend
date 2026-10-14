<script setup>
// @ts-check
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { addDays, formatWeekLabel, weekStart } from '../utils/weeks';

// the week's sunday, YYYY-MM-DD
const week = defineModel({ type: String, required: true });

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

const menu = ref(false);
// week numbers make the picker too wide for a phone
const { xs } = useDisplay();

const label = computed(() => formatWeekLabel(week.value, props.max));
const hasPrevious = computed(() => !props.min || week.value > weekStart(props.min));
const hasNext = computed(() => week.value < weekStart(props.max));

/** @param {number} weeks */
const step = (weeks) => {
    week.value = addDays(week.value, weeks * 7);
};

/** @param {string} date */
const toPickerDate = (date) => new Date(`${date}T00:00:00`);

/** @param {Date} date the picker's local-midnight date */
const fromPickerDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(week.value, i)));

// every day of the week is selected so the picker highlights it
const pickerValue = computed(() => weekDays.value.map(toPickerDate));

/** @param {unknown} value */
const pick = (value) => {
    if (!Array.isArray(value)) return;
    const picked = value.filter((date) => date instanceof Date).map(fromPickerDate);
    // tapping a day adds it, or removes it if it's in the selected week
    const added = picked.find((date) => !weekDays.value.includes(date));
    const removed = weekDays.value.find((date) => !picked.includes(date));
    const day = added ?? removed;
    if (!day) return;
    week.value = weekStart(day);
    menu.value = false;
};
</script>

<template>
  <div class="d-flex align-center ga-1">
    <v-btn
      icon="mdi-chevron-left"
      variant="text"
      size="small"
      aria-label="Previous week"
      :disabled="!hasPrevious"
      @click="step(-1)"
    />
    <v-menu v-model="menu" :close-on-content-click="false" location="bottom center">
      <template #activator="{ props: activator }">
        <v-btn
          v-bind="activator"
          variant="text"
          prepend-icon="mdi-calendar"
          class="week-label text-none"
          aria-label="Pick a week"
        >
          {{ label }}
        </v-btn>
      </template>
      <v-date-picker
        :model-value="pickerValue"
        multiple
        :show-week="!xs"
        :first-day-of-week="0"
        :min="min"
        :max="max"
        hide-header
        @update:model-value="pick"
      />
    </v-menu>
    <v-btn
      icon="mdi-chevron-right"
      variant="text"
      size="small"
      aria-label="Next week"
      :disabled="!hasNext"
      @click="step(1)"
    />
  </div>
</template>

<style scoped>
.week-label {
    min-width: 0;
}
</style>
