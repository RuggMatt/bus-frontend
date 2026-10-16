<script setup>
import { useRoutes } from '../composables/useRoutes';
import { ref, computed } from 'vue';
import { useBuses } from '../composables/useBuses';
import { useRouter } from 'vue-router';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { getTripSummaries } from '../api';
import { busesByHeadsign } from '../utils/routes';
import RouteBadge from '../components/RouteBadge.vue';
import { transitionLinkClick } from '../utils/viewTransition';
import { useNowLocal, useServiceAlerts } from '../composables/useServiceAlerts';
import { routesWithActiveAlerts } from '../utils/serviceAlerts';

const { routes } = useRoutes();
const { buses } = useBuses();

// each route's live buses, looked up once per snapshot rather than per row
const busesByRoute = computed(() => {
  /** @type {Map<string, import("../api").Bus[]>} */
  const byRoute = new Map();
  for (const bus of buses.value ?? []) {
    if (!bus.route_id) continue;
    if (!byRoute.has(bus.route_id)) byRoute.set(bus.route_id, []);
    byRoute.get(bus.route_id)?.push(bus);
  }
  return byRoute;
});

/** @type {import('vue').Ref<string | null>} */
const expandedRouteId = ref(null);

/** @param {string} routeId */
const toggleRoute = (routeId) => {
  expandedRouteId.value = expandedRouteId.value === routeId ? null : routeId;
};

const expandedBuses = computed(() =>
  expandedRouteId.value ? busesByRoute.value.get(expandedRouteId.value) ?? [] : []);

// the expanded route's headsigns, shared with the bus page and finders
const tripIds = computed(() => [...new Set(expandedBuses.value.map((bus) => String(bus.trip)))].sort());
const { data: tripSummaries, isFetching: summariesFetching } = useQuery({
  queryKey: computed(() => ['trip-summaries', tripIds.value]),
  queryFn: () => getTripSummaries(tripIds.value),
  enabled: () => tripIds.value.length > 0,
  staleTime: Infinity,
  placeholderData: keepPreviousData,
});

// kept data covers a refresh, but another route's needs its own lookup first
const summariesLoading = computed(() => {
  const known = new Set((tripSummaries.value ?? []).map((summary) => String(summary.trip_id)));
  return summariesFetching.value && tripIds.value.some((tripId) => !known.has(tripId));
});

const headsignGroups = computed(() =>
  expandedRouteId.value
    ? busesByHeadsign(expandedBuses.value, tripSummaries.value ?? [], expandedRouteId.value)
    : []);

const router = useRouter();

const serviceAlerts = useServiceAlerts();
const nowLocal = useNowLocal();
const disruptedRoutes = computed(() => routesWithActiveAlerts(serviceAlerts.value, nowLocal.value));

// only the tapped route's elements are named, as each name must be unique on the page
/** @type {import('vue').Ref<string | null>} */
const transitionRouteId = ref(null);

/**
 * @param {string} routeId
 * @param {string} name
 */
const transitionName = (routeId, name) =>
  routeId === transitionRouteId.value ? { viewTransitionName: name } : undefined;

/**
 * Morphs the route number and name into the route page, which shows the name from
 * history state until its own routes query loads.
 *
 * @param {MouseEvent} event
 * @param {import('../api').Route} route
 */
const openRoute = (event, route) =>
  transitionLinkClick(
    event,
    router,
    { path: `/routes/${route.route_id}`, state: { routeLongName: route.route_long_name } },
    (named) => { transitionRouteId.value = named ? route.route_id : null; },
  );

const search = ref('');
const filteredRoutes = computed(() => {
  if (!routes.value) return [];
  const term = search.value.trim().toLowerCase();
  if (!term) return routes.value;
  return routes.value.filter(route => {
    return (
      (route.route_long_name && route.route_long_name.toLowerCase().includes(term)) ||
      (route.route_id && route.route_id.toLowerCase().includes(term))
    );
  });
});
</script>
<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-headline-large mb-4">
          Bus Routes
        </h1>
        <v-text-field
          v-model="search"
          label="Search by Route Name or ID"
          prepend-inner-icon="mdi-magnify"
          class="mb-4"
          clearable
        />
        <v-card variant="outlined">
          <template v-for="(route, index) in filteredRoutes" :key="route.route_id">
            <v-divider v-if="index > 0" />
            <div
              v-ripple
              class="route-row d-flex align-center pa-3"
              :class="{ 'route-row--expanded': expandedRouteId === route.route_id }"
              role="button"
              tabindex="0"
              :aria-expanded="expandedRouteId === route.route_id"
              @click="toggleRoute(route.route_id)"
              @keydown.enter.prevent="toggleRoute(route.route_id)"
              @keydown.space.prevent="toggleRoute(route.route_id)"
            >
              <RouteBadge
                :route-id="route.route_id"
                size="small"
                class="mr-2 flex-shrink-0"
                :style="transitionName(route.route_id, 'route-number')"
              />
              <v-icon
                v-if="disruptedRoutes.has(route.route_id)"
                v-tooltip="'Service disruption'"
                icon="mdi-alert"
                color="warning"
                size="small"
                class="mr-2 flex-shrink-0"
                aria-label="Service disruption"
                role="img"
              />
              <span class="text-body-large flex-grow-1 min-width-0" :style="transitionName(route.route_id, 'route-name')">{{ route.route_long_name }}</span>
              <span
                v-if="busesByRoute.get(route.route_id)?.length"
                class="text-body-medium text-medium-emphasis flex-shrink-0 ml-2 text-no-wrap"
                :aria-label="`${busesByRoute.get(route.route_id)?.length} active buses`"
              >
                <v-icon icon="mdi-bus" size="small" />
                {{ busesByRoute.get(route.route_id)?.length }}
              </span>
            </div>
            <v-expand-transition>
              <div v-if="expandedRouteId === route.route_id" class="route-details text-body-medium px-3 pb-3">
                <div v-if="!expandedBuses.length" class="text-medium-emphasis">
                  No buses on this route right now
                </div>
                <v-skeleton-loader v-else-if="summariesLoading" type="text" class="group-loader" />
                <div v-for="group in headsignGroups" v-else :key="group.headsign ?? ''" class="mb-1">
                  <div class="text-title-small">
                    {{ group.headsign ?? 'Not in the current schedule' }}
                  </div>
                  <v-chip
                    v-for="bus in group.buses"
                    :key="bus.bus"
                    :to="`/buses/${encodeURIComponent(bus.bus)}`"
                    class="mr-1 mt-1"
                    color="primary"
                    size="small"
                    prepend-icon="mdi-bus"
                  >
                    {{ bus.bus }}
                  </v-chip>
                </div>
                <v-btn
                  :href="`/routes/${route.route_id}`"
                  block
                  variant="tonal"
                  color="primary"
                  class="mt-3"
                  @click="openRoute($event, route)"
                >
                  View details
                </v-btn>
              </div>
            </v-expand-transition>
          </template>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
<style scoped>
.min-width-0 {
  min-width: 0;
}

.route-row {
  cursor: pointer;
}

.route-row:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.route-row--expanded,
.route-row--expanded:hover,
.route-details {
  background: rgba(var(--v-theme-primary), 0.08);
}

.group-loader {
  background: transparent;
  max-width: 240px;
}

@media (prefers-reduced-motion: reduce) {
  .expand-transition-enter-active,
  .expand-transition-leave-active {
    transition: none !important;
  }
}
</style>
