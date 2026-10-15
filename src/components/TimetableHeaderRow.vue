<script setup>
defineProps({
  /** @type {import('vue').PropType<Array<{ trip_id: string, headerTime: string, headerPM: boolean }>>} */
  trips: {
    type: Array,
    required: true,
  },
  // ids of the trips we recorded on the shown date
  recorded: {
    type: /** @type {import('vue').PropType<Set<string>>} */ (Set),
    default: () => new Set(),
  },
});
</script>

<template>
  <thead>
    <tr>
      <th class="stop-col">
        Stop
      </th>
      <th
        v-for="trip in trips"
        :key="trip.trip_id"
        class="time-col"
      >
        <router-link :to="`/trips/${trip.trip_id}`" class="timetable-link">
          <strong v-if="trip.headerPM">{{ trip.headerTime }}</strong>
          <span v-else>{{ trip.headerTime }}</span>
        </router-link>
        <span
          v-if="recorded.has(trip.trip_id)"
          class="timetable-recorded-dot"
          role="img"
          aria-label="Recorded"
          title="Recorded"
        />
      </th>
    </tr>
  </thead>
</template>
