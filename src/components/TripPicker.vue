<script setup>
// @ts-check
import { computed, nextTick, ref } from 'vue';
import { formatScheduledTime } from '../utils/busStatus';
import { adjacentTrips } from '../utils/dayTrips';

const props = defineProps({
    // the day's trips going one way, earliest first
    trips: {
        type: /** @type {import('vue').PropType<import('../utils/dayTrips').DayTrip[]>} */ (Array),
        required: true,
    },
    // the trip being shown
    current: {
        type: String,
        required: true,
    },
    loading: {
        type: Boolean,
        default: false,
    },
    // ids of the trips we recorded that day
    recorded: {
        type: /** @type {import('vue').PropType<Set<string>>} */ (Set),
        default: () => new Set(),
    },
});

const emit = defineEmits(['select']);

const menu = ref(false);

const neighbours = computed(() => adjacentTrips(props.trips, props.current));
const currentTrip = computed(() => props.trips.find((trip) => trip.trip_id === props.current));
const label = computed(() => {
    if (currentTrip.value) return formatScheduledTime(currentTrip.value.start);
    return props.loading ? 'Loading...' : 'Pick a trip';
});

/** @param {string} tripId */
const pick = (tripId) => {
    menu.value = false;
    if (tripId !== props.current) emit('select', tripId);
};

// a day has over a hundred trips, so start the list at the current one
const showCurrent = async () => {
    await nextTick();
    document.querySelector('.trip-picker-item--current')?.scrollIntoView({ block: 'center' });
};
</script>

<template>
  <div class="d-flex align-center ga-1">
    <v-btn
      icon="mdi-chevron-left"
      variant="text"
      size="small"
      aria-label="Previous trip"
      :disabled="!neighbours.previous"
      @click="neighbours.previous && pick(neighbours.previous.trip_id)"
    />
    <v-menu v-model="menu" location="bottom center" max-height="320" @after-enter="showCurrent">
      <template #activator="{ props: activator }">
        <v-btn
          v-bind="activator"
          variant="text"
          prepend-icon="mdi-bus-clock"
          class="text-none"
          aria-label="Pick a trip"
          :disabled="!trips.length"
        >
          {{ label }}
          <v-icon
            v-if="recorded.has(current)"
            icon="mdi-access-point"
            color="success"
            size="small"
            class="ms-1"
            aria-label="Recorded"
            title="Recorded"
          />
        </v-btn>
      </template>
      <v-list density="compact" :selected="[current]" mandatory>
        <v-list-item
          v-for="trip in trips"
          :key="trip.trip_id"
          :value="trip.trip_id"
          :title="formatScheduledTime(trip.start)"
          :class="{ 'trip-picker-item--current': trip.trip_id === current }"
          @click="pick(trip.trip_id)"
        >
          <template v-if="recorded.has(trip.trip_id)" #append>
            <v-icon
              icon="mdi-access-point"
              color="success"
              size="small"
              aria-label="Recorded"
              title="Recorded"
            />
          </template>
        </v-list-item>
      </v-list>
    </v-menu>
    <v-btn
      icon="mdi-chevron-right"
      variant="text"
      size="small"
      aria-label="Next trip"
      :disabled="!neighbours.next"
      @click="neighbours.next && pick(neighbours.next.trip_id)"
    />
  </div>
</template>
