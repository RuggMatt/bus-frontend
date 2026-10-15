<script setup>
import BusLink from './BusLink.vue';

defineProps({
  /** a recorded position's row, from the trip page's positionRows */
  row: {
    type: Object,
    required: true,
  },
  /** how many more positions are grouped under this one */
  more: {
    type: Number,
    default: 0,
  },
});
</script>

<template>
  <div class="flex-grow-1 min-width-0">
    <div class="text-body-large">
      {{ row.time }}
      <v-chip
        v-if="more"
        size="x-small"
        variant="tonal"
        class="ml-1"
      >
        +{{ more }}
      </v-chip>
      <v-chip
        v-if="row.gapMinutes"
        size="x-small"
        variant="tonal"
        color="warning"
        class="ml-1"
      >
        {{ row.gapMinutes }} min gap
      </v-chip>
    </div>
    <div class="text-body-small text-medium-emphasis">
      <template v-if="row.nearStop">
        Near {{ row.nearStop }}
      </template>
      <template v-else>
        Between stops
      </template>
      <template v-if="row.bus !== null">
        &middot; <BusLink :bus="row.bus" />
      </template>
    </div>
  </div>
  <div class="text-right flex-shrink-0 ml-2">
    <div class="text-title-medium">
      {{ row.speed === null ? '–' : row.speed === 0 ? 'Stopped' : `${row.speed} km/h` }}
    </div>
    <div v-if="row.direction" class="text-body-small text-medium-emphasis">
      <v-icon
        icon="mdi-navigation"
        size="x-small"
        :style="{ transform: `rotate(${row.bearing}deg)` }"
      />
      {{ row.direction }}
    </div>
  </div>
</template>

<style scoped>
.min-width-0 {
  min-width: 0;
}
</style>
