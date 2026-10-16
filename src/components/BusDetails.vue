<script setup>
import { computed, ref, toRef } from 'vue';
import { useRouter } from 'vue-router';
import { useBusTrip } from '../composables/useBusTrip';
import { formatScheduledTime, scheduleStatus } from '../utils/busStatus';
import { headsignWithoutRoute, routeNumber } from '../utils/routes';
import { transitionLinkClick } from '../utils/viewTransition';
import RouteBadge from './RouteBadge.vue';
import BusLink from './BusLink.vue';

const props = defineProps({
  /** @type {import('vue').PropType<import('../api').Bus>} */
  bus: {
    type: Object,
    required: true,
  },
});

const router = useRouter();
const { trip, isLoading, routeLongName, nextStop } = useBusTrip(toRef(props, 'bus'));

// where the bus is going leads the card, as the route's name doesn't say the direction
const headsign = computed(() =>
  trip.value?.trip_headsign ? headsignWithoutRoute(trip.value.trip_headsign, trip.value.route_id) : '');

// names are only set while heading to the route, trip or bus page
const named = ref(false);

/** @param {string} name */
const transitionName = (name) => (named.value ? { viewTransitionName: name } : undefined);

/**
 * Morphs the route number, name and bus into the route page, handing over what
 * this page knows so the route page can show it before its own data loads.
 *
 * @param {MouseEvent} event
 */
const openRoute = (event) => {
  if (!trip.value) return;
  transitionLinkClick(
    event,
    router,
    {
      path: `/routes/${trip.value.route_id}`,
      // opens the route on the way this bus is going
      query: { direction: trip.value.direction_id },
      state: {
        routeLongName: routeLongName.value,
        buses: [{ bus: props.bus.bus, trip: String(props.bus.trip) }],
      },
    },
    (value) => { named.value = value; },
  );
};
</script>

<template>
  <div>
    <div v-if="isLoading" class="d-flex justify-center py-6">
      <v-progress-circular indeterminate color="primary" />
    </div>
    <router-link
      v-else-if="trip"
      v-slot="{ href }"
      :to="{ path: `/routes/${trip.route_id}`, query: { direction: trip.direction_id } }"
      custom
    >
      <a
        :href="href"
        class="route-header d-flex align-center pa-3"
        :aria-label="`Timetable for route ${routeNumber(trip.route_id)}`"
        @click="openRoute"
      >
        <RouteBadge :route-id="trip.route_id" :style="transitionName('route-number')" />
        <div class="ml-3 min-width-0">
          <div v-if="headsign" class="text-title-medium">
            {{ headsign }}
          </div>
          <div
            :class="headsign ? 'text-body-small text-medium-emphasis' : 'text-title-medium'"
            :style="transitionName('route-name')"
          >
            {{ routeLongName }}
          </div>
        </div>
        <v-icon icon="mdi-chevron-right" class="ml-auto pl-2" />
      </a>
    </router-link>
    <v-divider />

    <div class="bus-details pa-4 text-body-medium">
      <div class="d-flex align-start">
        <div class="flex-grow-1">
          <div class="text-medium-emphasis">
            <BusLink :bus="bus.bus" :style="transitionName(`bus-${bus.bus}`)" @click="named = true" />
            · {{ Math.round(bus.speed * 3.6) }} km/h
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
        v-if="trip"
        :to="`/trips/${trip.trip_id}`"
        block
        variant="tonal"
        color="primary"
        class="mt-4"
        @click="named = true"
      >
        Trip details
      </v-btn>
    </div>
  </div>
</template>

<style scoped>
.route-header {
  color: inherit;
  text-decoration: none;
}

.route-header:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.min-width-0 {
  min-width: 0;
}

.bus-details {
  color: rgb(var(--v-theme-on-surface));
}
</style>
