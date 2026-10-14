<script setup>
defineProps({
  /** @type {import('vue').PropType<Array<{ trip_id: string, headerTime: string, headerPM: boolean }>>} */
  trips: {
    type: Array,
    required: true,
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
      </th>
    </tr>
  </thead>
</template>
