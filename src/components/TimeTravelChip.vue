<script setup>
// @ts-check
import { computed, ref, watch } from 'vue';
import { formatTravelTime, parseTravelTime, shiftTravelTime, travelTimeNow } from '../utils/timeTravel';

// the time shown, YYYY-MM-DDTHH:MM in Edmonton, or null for live buses
const at = defineModel({ type: /** @type {import('vue').PropType<string | null>} */ (String), default: null });

defineProps({
    // while the buses for the time load
    loading: {
        type: Boolean,
        default: false,
    },
});

// how far the arrows step
const STEP_MINUTES = 5;

const menu = ref(false);
const date = ref('');
const time = ref('');

const now = () => travelTimeNow();
const today = computed(() => now().slice(0, 10));

const label = computed(() => (at.value ? formatTravelTime(at.value, today.value) : 'Now'));

// the form starts from the time shown, or from now
watch(menu, (open) => {
    if (!open) return;
    const parsed = parseTravelTime(at.value ?? now());
    date.value = parsed?.date ?? '';
    time.value = parsed?.time ?? '';
});

const picked = computed(() => parseTravelTime(`${date.value}T${time.value}`) ? `${date.value}T${time.value}` : null);
// the backend only has what has happened
const inFuture = computed(() => Boolean(picked.value) && /** @type {string} */ (picked.value) > now());

const go = () => {
    if (!picked.value || inFuture.value) return;
    at.value = picked.value;
    menu.value = false;
};

const backToNow = () => {
    at.value = null;
    menu.value = false;
};

/** @param {number} minutes */
const step = (minutes) => {
    if (!at.value) return;
    const next = shiftTravelTime(at.value, minutes);
    // stepping past now goes back to live buses
    at.value = next > now() ? null : next;
};
</script>

<template>
  <div class="time-travel d-flex align-center ga-1">
    <v-btn
      v-if="at"
      icon="mdi-chevron-left"
      size="small"
      elevation="2"
      :aria-label="`${STEP_MINUTES} minutes earlier`"
      @click="step(-STEP_MINUTES)"
    />
    <v-menu v-model="menu" :close-on-content-click="false" location="bottom center">
      <template #activator="{ props: activator }">
        <v-chip
          v-bind="activator"
          variant="elevated"
          elevation="2"
          :color="at ? 'primary' : 'surface'"
          :prepend-icon="at ? 'mdi-history' : 'mdi-clock-outline'"
          :aria-label="at ? `Showing buses at ${label}. Change time` : 'Showing buses now. Pick a time'"
          class="time-travel-chip"
          tag="button"
        >
          {{ label }}
          <v-progress-circular
            v-if="loading"
            indeterminate
            size="14"
            width="2"
            class="ml-2"
          />
        </v-chip>
      </template>
      <v-card min-width="280" title="Show buses at">
        <v-card-text class="d-flex flex-column ga-3 pb-0">
          <v-text-field
            v-model="date"
            type="date"
            label="Date"
            :max="today"
            density="comfortable"
            hide-details
          />
          <v-text-field
            v-model="time"
            type="time"
            label="Time (Edmonton)"
            density="comfortable"
            :error-messages="inFuture ? 'Pick a time that has passed' : undefined"
            :hide-details="!inFuture"
            @keydown.enter="go"
          />
        </v-card-text>
        <v-card-actions>
          <v-btn v-if="at" variant="text" @click="backToNow">
            Back to now
          </v-btn>
          <v-spacer />
          <v-btn color="primary" variant="flat" :disabled="!picked || inFuture" @click="go">
            Show buses
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-menu>
    <v-btn
      v-if="at"
      icon="mdi-chevron-right"
      size="small"
      elevation="2"
      :aria-label="`${STEP_MINUTES} minutes later`"
      @click="step(STEP_MINUTES)"
    />
  </div>
</template>

<style scoped>
.time-travel-chip {
  font-weight: 500;
}
</style>
