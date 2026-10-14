<script setup>
import { computed, toRef } from 'vue';
import { useBusTrip } from '../composables/useBusTrip';
import { formatScheduledTime, scheduleStatus } from '../utils/busStatus';

const props = defineProps({
  /** @type {import('vue').PropType<import('../api').Bus>} */
  bus: {
    type: Object,
    required: true,
  },
});

const { trip, isLoading, nextStop } = useBusTrip(toRef(props, 'bus'));

// buses handed over from another page only know their number and trip until the live data loads
const hasSpeed = computed(() => Number.isFinite(Number(props.bus.speed)));
</script>

<template>
  <v-card variant="outlined" class="bus-card pa-4 text-body-medium">
    <div class="d-flex align-start">
      <div class="flex-grow-1 min-width-0">
        <div class="text-title-medium">
          <template v-if="trip">
            {{ trip.trip_headsign }}
          </template>
          <v-skeleton-loader v-else-if="isLoading" type="text" class="headsign-loader" />
        </div>
        <div class="text-medium-emphasis">
          <span :style="{ viewTransitionName: `bus-${bus.bus}` }">Bus {{ bus.bus }}</span>
          <template v-if="hasSpeed">
            · {{ Math.round(bus.speed * 3.6) }} km/h
          </template>
        </div>
      </div>
      <v-chip
        v-if="nextStop"
        :color="scheduleStatus(nextStop.offsetMinutes).color"
        size="small"
        variant="tonal"
        class="flex-shrink-0 ml-2"
      >
        {{ scheduleStatus(nextStop.offsetMinutes).label }}
      </v-chip>
    </div>
    <template v-if="nextStop">
      <div class="mt-3">
        <v-icon icon="mdi-bus-stop" size="small" class="mr-1" />
        Next stop: {{ nextStop.name }}
      </div>
      <div>
        <v-icon icon="mdi-clock-outline" size="small" class="mr-1" />
        Scheduled there at {{ formatScheduledTime(nextStop.scheduledTime) }}
      </div>
    </template>
    <v-btn
      :to="`/trips/${bus.trip}`"
      block
      variant="tonal"
      color="primary"
      class="mt-4"
    >
      Trip details
    </v-btn>
  </v-card>
</template>

<style scoped>
.bus-card {
  color: rgb(var(--v-theme-on-surface));
  height: 100%;
}

.min-width-0 {
  min-width: 0;
}

.headsign-loader {
  background: transparent;
  max-width: 200px;
}

.headsign-loader :deep(.v-skeleton-loader__text) {
  margin: 4px 0;
}
</style>
