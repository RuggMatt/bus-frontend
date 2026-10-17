<script setup>
import { LOCAL_AGENCY, headsignWithoutRoute, routeColor, routeNumber } from '../utils/routes';
import { transitionLinkClick } from '../utils/viewTransition';
import { formatScheduledTime, scheduleStatus } from '../utils/busStatus';
import { formatDistance } from '../utils/geo';
import { describeNextArrival } from '../utils/nextArrival';
import { edmontonNow } from '../utils/serviceTime';
import RouteBadge from './RouteBadge.vue';
import TrainTimes from './TrainTimes.vue';
import BusLink from './BusLink.vue';
import ServiceAlertCard from './ServiceAlertCard.vue';
import { useNowLocal, useServiceAlerts } from '../composables/useServiceAlerts';
import { useStationHeadsigns } from '../composables/useStationHeadsigns';
import { alertsForStop } from '../utils/serviceAlerts';
import { getRouteStopStats } from '../api';
import { typicalStatus } from '../utils/delayStats';
import { hasDelayStats } from '../utils/stopRoutes';
import RouteStopStats from './RouteStopStats.vue';
import { useQueries } from '@tanstack/vue-query';
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

// one stop's alerts and route cards. The stop panel draws two while swiping between an
// LRT station's directions
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

defineEmits(["bus-click"]);

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
 * Morphs the route number and name into the route's page for this stop. Its own data
 * is usually still loading, so the route's name rides along in history state.
 *
 * @param {MouseEvent} event
 * @param {import('../composables/useStopArrivals').StopRouteGroup} group
 */
const openRoute = (event, group) =>
  transitionLinkClick(
    event,
    router,
    {
      path: stopRoutePath(group),
      query: agencyQuery(group),
      state: { routeLongName: group.route_long_name },
    },
    (named) => { transitionKey.value = named ? group.key : null; },
  );

/**
 * The route's page for this stop: its times here, by day, and how late it usually is.
 * @param {import('../composables/useStopArrivals').StopRouteGroup} group
 */
const stopRoutePath = (group) => `/stops/${props.stop.stop_id}/routes/${group.route_id}`;

// route ids are only unique within an agency, so a regional route says which
/** @param {import('../composables/useStopArrivals').StopRouteGroup} group */
const agencyQuery = (group) =>
  (group.agency_name && group.agency_name !== LOCAL_AGENCY ? { agency: group.agency_name } : {});

/** @param {import('../composables/useStopArrivals').StopBus} bus */
const positionLabel = (bus) => {
  const distance = formatDistance(bus.distance);
  if (bus.passed === null) return `${distance} from stop`;
  return bus.passed ? `Passed ${distance} ago` : `${distance} away`;
};

// where each route usually goes from here, for when nothing is on the way
const { usualHeadsigns } = useStationHeadsigns(() => props.stop);

/**
 * Where a route's next buses or trains go, the most common of them, or else where it
 * usually goes from this stop. Without the route number, as the badge is beside it.
 * @param {import('../composables/useStopArrivals').StopRouteGroup} group
 * @returns {string | null}
 */
const groupHeadsign = (group) => {
  const upcoming = [...group.buses.map((bus) => bus.headsign), ...group.upcoming.map((arrival) => arrival.headsign)];
  /** @type {Map<string, number>} */
  const counts = new Map();
  upcoming.filter(Boolean).forEach((headsign) => counts.set(headsign, (counts.get(headsign) ?? 0) + 1));
  const headsign = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0]
    ?? usualHeadsigns.value.get(`${props.stop.stop_id}|${group.agency_name}|${group.route_id}`);
  return headsign ? headsignWithoutRoute(headsign, group.route_id) : null;
};

/**
 * A bus's headsign, only when it's not the one its card is titled with.
 * @param {import('../composables/useStopArrivals').StopRouteGroup} group
 * @param {import('../composables/useStopArrivals').StopBus} bus
 */
const otherHeadsign = (group, bus) => {
  const headsign = headsignWithoutRoute(bus.headsign || '', group.route_id);
  return headsign && headsign !== groupHeadsign(group) ? headsign : null;
};

// a week of delays per route here, for the "Usually …" chip and its histogram. Worked
// out nightly, so there's nothing new to fetch for a while
const STATS_STALE_MS = 60 * 60 * 1000;
const statsGroups = computed(() => props.routeGroups.filter(hasDelayStats));
const statsQueries = useQueries({
  queries: computed(() =>
    statsGroups.value.map((group) => ({
      // shared with the trip page's stop details
      queryKey: ['route-stop-stats', group.route_id, props.stop.stop_id, null],
      queryFn: () => getRouteStopStats(group.route_id, props.stop.stop_id),
      staleTime: STATS_STALE_MS,
    })),
  ),
});
const statsByKey = computed(() => {
  /** @type {Map<string, Awaited<ReturnType<typeof getRouteStopStats>>>} */
  const map = new Map();
  statsGroups.value.forEach((group, index) => {
    const stats = statsQueries.value[index]?.data;
    if (stats?.count && stats.mean !== null) map.set(group.key, stats);
  });
  return map;
});

// the routes whose histogram is open
const openStats = ref(new Set());
watch(() => props.stop.stop_id, () => {
  openStats.value = new Set();
});
/** @param {string} key */
const toggleStats = (key) => {
  const next = new Set(openStats.value);
  if (!next.delete(key)) next.add(key);
  openStats.value = next;
};

/** @param {number} stopsAway */
// "Next stop" would read twice beside the next stop's name
const formatStopsAway = (stopsAway) => (stopsAway === 1 ? 'This stop is next' : `${stopsAway} stops away`);
</script>

<template>
  <div class="stop-arrivals">
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
        <!-- the link covers the whole header from underneath, so the stats chip can sit
             beside the headsign without a button inside a link -->
        <div
          class="route-header d-flex align-center pa-3"
          :class="{ 'route-header--line': group.rail }"
          :style="group.rail && routeColor(group.route_id) ? { borderLeftColor: routeColor(group.route_id) } : undefined"
        >
          <router-link
            v-slot="{ href }"
            :to="{ path: stopRoutePath(group), query: agencyQuery(group) }"
            custom
          >
            <a
              :href="href"
              class="route-header__link"
              :aria-label="group.rail ? `${group.route_long_name} at this stop` : `Route ${routeNumber(group.route_id)} at this stop`"
              @click="openRoute($event, group)"
            />
          </router-link>
          <!-- LRT lines go by name and colour in Edmonton, not number -->
          <RouteBadge v-if="!group.rail" :route-id="group.route_id" :style="transitionName(group, 'route-number')" />
          <!-- where it's going says the direction, which the route's name doesn't -->
          <div class="min-width-0" :class="{ 'ml-3': !group.rail }">
            <div class="route-header__title d-flex align-center flex-wrap">
              <div class="text-title-medium" :style="groupHeadsign(group) ? undefined : transitionName(group, 'route-name')">
                {{ groupHeadsign(group) ?? group.route_long_name }}
              </div>
              <v-chip
                v-if="statsByKey.get(group.key)"
                tag="button"
                type="button"
                :color="typicalStatus(statsByKey.get(group.key).mean).color"
                size="x-small"
                variant="tonal"
                class="route-header__stats"
                :append-icon="openStats.has(group.key) ? 'mdi-chevron-up' : 'mdi-chevron-down'"
                :aria-expanded="openStats.has(group.key)"
                :aria-label="`Usually ${typicalStatus(statsByKey.get(group.key).mean).label.toLowerCase()} here. ${openStats.has(group.key) ? 'Hide' : 'Show'} last week's delays`"
                @click.stop="toggleStats(group.key)"
              >
                Usually {{ typicalStatus(statsByKey.get(group.key).mean).label.toLowerCase() }}
              </v-chip>
            </div>
            <div
              v-if="groupHeadsign(group)"
              class="text-body-small text-medium-emphasis"
              :style="transitionName(group, 'route-name')"
            >
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
        </div>
        <v-expand-transition>
          <div v-if="openStats.has(group.key) && statsByKey.get(group.key)">
            <v-divider />
            <RouteStopStats :stats="statsByKey.get(group.key)" class="pa-3" />
          </div>
        </v-expand-transition>
        <v-divider />
        <!-- LRT isn't tracked live, so its next few scheduled trains stand in -->
        <div v-if="group.upcoming.length" class="pa-3">
          <TrainTimes :arrivals="group.upcoming" :color="routeColor(group.route_id)" />
          <div class="d-flex align-center text-body-small text-medium-emphasis mt-2">
            <v-icon icon="mdi-calendar-clock" size="x-small" class="mr-1" />
            Scheduled, not live
          </div>
        </div>
        <v-skeleton-loader v-else-if="group.upcomingLoading" type="list-item-two-line" class="train-loader" />
        <div v-else-if="!group.buses.length" class="d-flex align-start pa-3 text-body-medium text-medium-emphasis">
          <v-icon icon="mdi-clock-outline" size="small" class="mr-2 mt-1" />
          <div>
            <div>No upcoming arrivals</div>
            <div class="text-body-small">
              {{ describeNextArrival(group.nextArrival, today, group.rail ? 'train' : 'bus') }}
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
                  <!-- the card is titled with where they go, so a bus only says so when it differs -->
                  <template v-if="otherHeadsign(group, bus)">
                    <v-list-item-title>{{ otherHeadsign(group, bus) }}</v-list-item-title>
                    <v-list-item-subtitle>
                      <BusLink :bus="bus.bus" :style="transitionName(group, `bus-${bus.bus}`)" /> · {{ positionLabel(bus) }}
                    </v-list-item-subtitle>
                  </template>
                  <template v-else>
                    <v-list-item-title>
                      <BusLink :bus="bus.bus" :style="transitionName(group, `bus-${bus.bus}`)" />
                    </v-list-item-title>
                    <v-list-item-subtitle>{{ positionLabel(bus) }}</v-list-item-subtitle>
                  </template>
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
                    size="large"
                    height="50"
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
.stop-arrivals {
  position: relative;
}

.route-header {
  position: relative;
}

.route-header__link {
  position: absolute;
  inset: 0;
  color: inherit;
}

.route-header__link:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: -2px;
}

.route-header__title {
  column-gap: 8px;
}

/* above the link, so tapping it opens the histogram instead */
.route-header__stats {
  position: relative;
  z-index: 1;
}

/* a bar in the line's colour, as on the LRT maps */
.route-header--line {
  border-left: 6px solid rgb(var(--v-theme-primary));
}

.route-header:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.min-width-0 {
  min-width: 0;
}

.train-loader {
  background: transparent;
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
