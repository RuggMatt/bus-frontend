<script setup>
import { LOCAL_AGENCY, headsignWithoutRoute, routeColor, routeNumber } from '../utils/routes';
import { describePlatforms, mainHeadsigns, stationStops } from '../utils/stations';
import { getStopHeadsigns } from '../api';
import { useStops } from '../composables/useStops';
import { useQuery } from '@tanstack/vue-query';
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

// --- the other platforms or bays of the stop's station ---
const { stops, keyedStops } = useStops();
const platformStops = computed(() => stationStops(props.stop, stops.value ?? []));

// where each route goes from here (and from the station's other platforms, to tell them apart)
const headsignStopIds = computed(() =>
  (platformStops.value.length ? platformStops.value.map((stop) => stop.stop_id) : [props.stop.stop_id]).sort());
const { data: headsignRows } = useQuery({
  queryKey: computed(() => ['stop-headsigns', headsignStopIds.value.join(',')]),
  queryFn: () => getStopHeadsigns(headsignStopIds.value),
  staleTime: Infinity,
});
const usualHeadsigns = computed(() => mainHeadsigns(headsignRows.value ?? []));

const platforms = computed(() =>
  headsignRows.value ? describePlatforms(platformStops.value, headsignRows.value) : []);
// an LRT station's two platforms are its two directions, so they get a toggle
const directionPlatforms = computed(() =>
  platforms.value.length === 2 && platforms.value.every((platform) => platform.rail));

/** @param {import('../utils/stations').Platform} platform */
const platformLabel = (platform) =>
  platform.headsigns.length ? `To ${platform.headsigns[0]}` : `Stop ${platform.stop_code}`;

// a transit centre's bays by their routes, and where they go when two bays share routes
const bayLabels = computed(() => {
  const routeLabel = (/** @type {import('../utils/stations').Platform} */ platform) =>
    platform.routeIds.length ? platform.routeIds.map(routeNumber).join(', ') : `Stop ${platform.stop_code}`;
  const counts = new Map();
  platforms.value.forEach((platform) => counts.set(routeLabel(platform), (counts.get(routeLabel(platform)) ?? 0) + 1));
  return new Map(platforms.value.map((platform) => {
    const label = routeLabel(platform);
    const shared = counts.get(label) > 1 && platform.headsigns.length;
    return [platform.stop_id, shared ? `${label} to ${platform.headsigns[0]}` : label];
  }));
});

const stationName = computed(() =>
  (props.stop.parent_station && keyedStops.value[props.stop.parent_station]?.stop_name) || 'this station');

/** @param {string} stopId */
const switchPlatform = (stopId) => {
  if (stopId && stopId !== props.stop.stop_id) router.replace(`/stops/${encodeURIComponent(stopId)}`);
};

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

    <!-- an LRT station has a platform per direction, and a transit centre a stop per bay -->
    <div v-if="platforms.length" class="px-4 pb-3">
      <v-btn-toggle
        v-if="directionPlatforms"
        :model-value="stop.stop_id"
        mandatory
        color="primary"
        variant="outlined"
        divided
        density="comfortable"
        class="platform-toggle"
        aria-label="Direction"
        @update:model-value="switchPlatform"
      >
        <v-btn
          v-for="platform in platforms"
          :key="platform.stop_id"
          :value="platform.stop_id"
          class="text-none"
        >
          <span class="text-truncate">{{ platformLabel(platform) }}</span>
        </v-btn>
      </v-btn-toggle>
      <template v-else>
        <div class="text-body-small text-medium-emphasis mb-1">
          Stops at {{ stationName }}
        </div>
        <div class="d-flex flex-wrap ga-1">
          <v-chip
            v-for="platform in platforms"
            :key="platform.stop_id"
            :color="platform.stop_id === stop.stop_id ? 'primary' : undefined"
            :variant="platform.stop_id === stop.stop_id ? 'flat' : 'outlined'"
            :aria-current="platform.stop_id === stop.stop_id ? 'location' : undefined"
            :title="`Stop ${platform.stop_code}`"
            size="small"
            @click="switchPlatform(platform.stop_id)"
          >
            {{ bayLabels.get(platform.stop_id) }}
          </v-chip>
        </div>
      </template>
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
            :class="{ 'route-header--line': group.rail }"
            :style="group.rail && routeColor(group.route_id) ? { borderLeftColor: routeColor(group.route_id) } : undefined"
            :aria-label="group.rail ? `Timetable for the ${group.route_long_name}` : `Timetable for route ${routeNumber(group.route_id)}`"
            @click="openRoute($event, group)"
          >
            <!-- LRT lines go by name and colour in Edmonton, not number -->
            <RouteBadge v-if="!group.rail" :route-id="group.route_id" :style="transitionName(group, 'route-number')" />
            <!-- where it's going says the direction, which the route's name doesn't -->
            <div class="min-width-0" :class="{ 'ml-3': !group.rail }">
              <div v-if="groupHeadsign(group)" class="text-title-medium">
                {{ groupHeadsign(group) }}
              </div>
              <div
                :class="groupHeadsign(group) ? 'text-body-small text-medium-emphasis' : 'text-title-medium'"
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
          </a>
        </router-link>
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

/* long headsigns share the width instead of pushing past the panel */
.platform-toggle {
  width: 100%;
}

.platform-toggle .v-btn {
  flex: 1 1 0;
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
