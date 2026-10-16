<script setup>
import { LOCAL_AGENCY, routeNumber } from '../utils/routes';
import { transitionLinkClick } from '../utils/viewTransition';
import { formatScheduledTime, scheduleStatus } from '../utils/busStatus';
import { formatDistance } from '../utils/geo';
import { describeNextArrival } from '../utils/nextArrival';
import { edmontonNow } from '../utils/serviceTime';
import RouteBadge from './RouteBadge.vue';
import BusLink from './BusLink.vue';
import ServiceAlertCard from './ServiceAlertCard.vue';
import { useNowLocal, useServiceAlerts } from '../composables/useServiceAlerts';
import { alertsForStop } from '../utils/serviceAlerts';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({
  stop: {
    type: Object,
    required: true,
  },
  /** @type {import('vue').PropType<import('../composables/useStopArrivals').StopRouteGroup[]>} */
  routeGroups: {
    type: Array,
    default: () => [],
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  isError: {
    type: Boolean,
    default: false,
  },
  selectedBusId: {
    type: [Number, String],
    default: null,
  },
  /** @type {import('vue').PropType<{stopsAway: number | null, nextStopName: string | null} | null>} */
  selectedBusProgress: {
    type: Object,
    default: null,
  },
});

defineEmits(["close", "bus-click"]);

const router = useRouter();

// closures and detours naming this stop, in effect now or still to come
const serviceAlerts = useServiceAlerts();
const nowLocal = useNowLocal();
const stopAlerts = computed(() => {
  const { active, upcoming } = alertsForStop(serviceAlerts.value, props.stop.stop_id, nowLocal.value);
  return [...active, ...upcoming];
});

// the day the next-bus labels count from
const today = computed(() => edmontonNow().dateString);

// only the tapped route's elements are named, as each name must be unique on the page
/** @type {import('vue').Ref<string | null>} */
const transitionKey = ref(null);

/**
 * @param {import('../composables/useStopArrivals').StopRouteGroup} group
 * @param {string} name
 */
const transitionName = (group, name) =>
  group.key === transitionKey.value ? { viewTransitionName: name } : undefined;

/**
 * Morphs the route number, name and buses into the route page. The route page's own
 * data is usually still loading, so what this page knows rides along in history state.
 *
 * @param {MouseEvent} event
 * @param {import('../composables/useStopArrivals').StopRouteGroup} group
 */
const openRoute = (event, group) =>
  transitionLinkClick(
    event,
    router,
    {
      path: `/routes/${group.route_id}`,
      state: {
        routeLongName: group.route_long_name,
        buses: group.buses.map((bus) => ({ bus: bus.bus, trip: bus.trip_id })),
      },
    },
    (named) => { transitionKey.value = named ? group.key : null; },
  );


/** @param {import('../composables/useStopArrivals').StopBus} bus */
const positionLabel = (bus) => {
  const distance = formatDistance(bus.distance);
  if (bus.passed === null) return `${distance} from stop`;
  return bus.passed ? `Passed ${distance} ago` : `${distance} away`;
};

/** @param {number} stopsAway */
// "Next stop" would read twice beside the next stop's name
const formatStopsAway = (stopsAway) => (stopsAway === 1 ? 'This stop is next' : `${stopsAway} stops away`);
</script>

<template>
  <div class="stop-details">
    <div class="d-flex align-start pa-4">
      <div class="flex-grow-1">
        <div class="text-title-large">
          {{ stop.stop_name }}
        </div>
        <div class="text-body-medium text-medium-emphasis">
          Stop {{ stop.stop_code || stop.stop_id }}
        </div>
      </div>
      <v-btn
        icon="mdi-close"
        variant="text"
        density="comfortable"
        aria-label="Close stop details"
        @click="$emit('close')"
      />
    </div>

    <ServiceAlertCard
      v-for="timing in stopAlerts"
      :key="timing.alert.id"
      :timing="timing"
      :now="nowLocal"
      show-routes
      class="mx-4 mb-3"
    />

    <v-alert v-if="isError" type="error" variant="tonal" class="mx-4 mb-3">
      Buses for this stop could not be loaded.
    </v-alert>

    <div v-else-if="isLoading && !routeGroups.length" class="d-flex justify-center py-8">
      <v-progress-circular indeterminate color="primary" />
    </div>

    <div v-else-if="!routeGroups.length" class="text-medium-emphasis px-4 pb-4">
      No buses currently running to this stop.
    </div>

    <!-- buses come and go as the list refreshes, so ease them in rather than popping -->
    <TransitionGroup name="arrival">
      <v-card
        v-for="group in routeGroups"
        :key="group.key"
        variant="outlined"
        class="mx-4 mb-3"
      >
        <router-link
          v-slot="{ href }"
          :to="`/routes/${group.route_id}`"
          custom
        >
          <a
            :href="href"
            class="route-header d-flex align-center pa-3"
            :aria-label="`Timetable for route ${routeNumber(group.route_id)}`"
            @click="openRoute($event, group)"
          >
            <RouteBadge :route-id="group.route_id" :style="transitionName(group, 'route-number')" />
            <div class="ml-3">
              <div class="text-title-medium" :style="transitionName(group, 'route-name')">
                {{ group.route_long_name }}
              </div>
              <div
                v-if="group.agency_name && group.agency_name !== LOCAL_AGENCY"
                class="text-body-small text-medium-emphasis"
              >
                {{ group.agency_name }}
              </div>
            </div>
            <v-icon icon="mdi-chevron-right" class="ml-auto pl-2" />
          </a>
        </router-link>
        <v-divider />
        <div v-if="!group.buses.length" class="d-flex align-start pa-3 text-body-medium text-medium-emphasis">
          <v-icon icon="mdi-clock-outline" size="small" class="mr-2 mt-1" />
          <div>
            <div>No upcoming arrivals</div>
            <div class="text-body-small">
              {{ describeNextArrival(group.nextArrival, today) }}
            </div>
          </div>
        </div>
        <v-list v-else density="compact" lines="two" class="py-0">
          <TransitionGroup name="arrival">
            <v-list-item
              v-for="bus in group.buses"
              :key="bus.bus"
              :active="bus.bus === selectedBusId"
              color="primary"
              @click="$emit('bus-click', bus)"
            >
              <!-- kept beside the title so it stays put when the details open below -->
              <div class="d-flex align-center">
                <div class="flex-grow-1 min-width-0">
                  <v-list-item-title>{{ bus.headsign }}</v-list-item-title>
                  <v-list-item-subtitle>
                    <BusLink :bus="bus.bus" :style="transitionName(group, `bus-${bus.bus}`)" /> · {{ positionLabel(bus) }}
                  </v-list-item-subtitle>
                </div>
                <div v-if="bus.etaMinutes !== null" class="text-right flex-shrink-0 ml-2">
                  <div class="text-title-medium">
                    {{ bus.etaMinutes < 1 ? 'Due' : `≈ ${bus.etaMinutes} min` }}
                  </div>
                  <v-chip
                    :color="scheduleStatus(bus.offsetMinutes).color"
                    size="x-small"
                    variant="tonal"
                  >
                    {{ scheduleStatus(bus.offsetMinutes).label }}
                  </v-chip>
                </div>
              </div>
              <v-expand-transition>
                <div v-if="bus.bus === selectedBusId" class="bus-details text-body-medium">
                  <div v-if="selectedBusProgress?.stopsAway">
                    <v-icon icon="mdi-map-marker-distance" size="small" class="mr-1" />
                    <b>{{ formatStopsAway(selectedBusProgress.stopsAway) }}</b>
                  </div>
                  <div v-if="selectedBusProgress?.nextStopName">
                    <v-icon icon="mdi-bus-stop" size="small" class="mr-1" />
                    Next stop: {{ selectedBusProgress.nextStopName }}
                  </div>
                  <div>
                    <v-icon icon="mdi-clock-outline" size="small" class="mr-1" />
                    Scheduled here at {{ formatScheduledTime(bus.scheduledTime) }}
                  </div>
                  <v-btn
                    :to="`/trips/${bus.trip_id}`"
                    block
                    variant="tonal"
                    color="primary"
                    class="mt-3"
                    @click.stop
                  >
                    Trip details
                  </v-btn>
                </div>
              </v-expand-transition>
            </v-list-item>
          </TransitionGroup>
        </v-list>
      </v-card>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* anchors the cards while they fade out */
.stop-details {
  position: relative;
}

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
  padding-top: 8px;
}

.bus-details > div:not(:last-child) {
  margin-bottom: 2px;
}

@media (prefers-reduced-motion: reduce) {
  .expand-transition-enter-active,
  .expand-transition-leave-active {
    transition: none !important;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .arrival-enter-active {
    transition: opacity 400ms ease-out, transform 400ms ease-out;
  }

  /* rows already in the list slide to make room instead of jumping */
  .arrival-move {
    transition: transform 400ms ease;
  }

  .arrival-enter-from {
    opacity: 0;
    transform: translateY(-8px);
  }

  /* taken out of the flow so the rows below can slide up while it fades */
  .arrival-leave-active {
    left: 0;
    position: absolute;
    right: 0;
    transition: opacity 250ms ease-in;
  }

  .arrival-leave-to {
    opacity: 0;
  }
}
</style>
