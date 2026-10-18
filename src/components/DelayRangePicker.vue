<script setup>
// @ts-check
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';
import { addMonths, formatPeriodLabel, periodRange, periodStart } from '../utils/delayRankings';
import { addDays, weekStart } from '../utils/weeks';

// a week or month's first day, YYYY-MM-DD, or "" for the last 7 or 30 days up to yesterday
const start = defineModel({ type: String, required: true });

const props = defineProps({
    /** @type {import('vue').PropType<'week' | 'month'>} */
    kind: {
        type: String,
        required: true,
    },
    // the earliest day that can be picked, YYYY-MM-DD
    min: {
        type: String,
        required: true,
    },
    // today in Edmonton. the latest week or month is the one yesterday is in, as today has no times yet
    today: {
        type: String,
        required: true,
    },
});

const menu = ref(false);
// week numbers make the picker too wide for a phone
const { xs } = useDisplay();

const yesterday = computed(() => addDays(props.today, -1));
const latest = computed(() => periodStart(props.kind, yesterday.value));
const earliest = computed(() => periodStart(props.kind, props.min));

/** @param {string} value @param {number} steps */
const step = (value, steps) => (props.kind === 'week' ? addDays(value, steps * 7) : addMonths(value, steps));

/** @param {string} value */
const labelOf = (value) => formatPeriodLabel(props.kind, value, props.today);

const label = computed(() => labelOf(start.value));

// oldest to newest: calendar weeks or months, then the last 7 or 30 days
const previous = computed(() => {
    if (!start.value) return latest.value;
    const before = step(start.value, -1);
    return before >= earliest.value ? before : null;
});
const next = computed(() => {
    if (!start.value) return null;
    return start.value >= latest.value ? '' : step(start.value, 1);
});

// the rolling range first, then the latest calendar weeks or months
const options = computed(() => {
    const count = props.kind === 'week' ? 2 : 12;
    const calendar = Array.from({ length: count }, (_, i) => step(latest.value, -i)).filter((value) => value >= earliest.value);
    return ['', ...calendar];
});

/** @param {string} value */
const pick = (value) => {
    start.value = value;
    menu.value = false;
};

/** @param {string} date */
const toPickerDate = (date) => new Date(`${date}T00:00:00`);

/** @param {Date} date the picker's local-midnight date */
const fromPickerDate = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

// every day shown is selected, so the picker highlights the week
const shownDays = computed(() => {
    const { from, to } = periodRange(props.kind, start.value, props.today);
    const days = [];
    for (let day = from; day <= to; day = addDays(day, 1)) days.push(toPickerDate(day));
    return days;
});

/** @param {unknown} value */
const pickDay = (value) => {
    if (!Array.isArray(value)) return;
    const shown = shownDays.value.map(fromPickerDate);
    const picked = value.filter((date) => date instanceof Date).map(fromPickerDate);
    // tapping a day adds it, or removes it if it's already shown
    const day = picked.find((date) => !shown.includes(date)) ?? shown.find((date) => !picked.includes(date));
    if (day) pick(weekStart(day));
};
</script>

<template>
  <div class="d-flex align-center ga-1">
    <v-btn
      icon="mdi-chevron-left"
      variant="text"
      size="small"
      :aria-label="kind === 'week' ? 'Previous week' : 'Previous month'"
      :disabled="previous === null"
      @click="previous !== null && (start = previous)"
    />
    <v-menu v-model="menu" :close-on-content-click="false" location="bottom center">
      <template #activator="{ props: activator }">
        <v-btn
          v-bind="activator"
          variant="text"
          prepend-icon="mdi-calendar"
          class="range-label text-none"
          :aria-label="kind === 'week' ? 'Pick a week' : 'Pick a month'"
        >
          {{ label }}
        </v-btn>
      </template>
      <v-card>
        <v-list density="compact" nav>
          <v-list-item
            v-for="option in options"
            :key="option"
            :title="labelOf(option)"
            :active="option === start"
            color="primary"
            @click="pick(option)"
          />
        </v-list>
        <template v-if="kind === 'week'">
          <v-divider />
          <v-date-picker
            :model-value="shownDays"
            multiple
            :show-week="!xs"
            :first-day-of-week="0"
            :min="min"
            :max="yesterday"
            hide-header
            @update:model-value="pickDay"
          />
        </template>
      </v-card>
    </v-menu>
    <v-btn
      icon="mdi-chevron-right"
      variant="text"
      size="small"
      :aria-label="kind === 'week' ? 'Next week' : 'Next month'"
      :disabled="next === null"
      @click="next !== null && (start = next)"
    />
  </div>
</template>

<style scoped>
.range-label {
    min-width: 0;
}
</style>
