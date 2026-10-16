<script setup>
import { useRoutes } from '../composables/useRoutes';
import { ref, computed } from 'vue';
import { useBuses } from '../composables/useBuses';
import { useRoute, useRouter } from 'vue-router';
import { keepPreviousData, useQuery } from '@tanstack/vue-query';
import { getTripSummaries } from '../api';
import { busesByHeadsign, compareAgencies, filterRoutes, groupRoutesByAgency, routeTypeLabel } from '../utils/routes';
import { useRouteAgencies } from '../composables/useAgencies';
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

const pageRoute = useRoute();

/**
 * A filter kept in the URL, so reloads and shared links keep it.
 * @param {string} key
 */
const queryFilter = (key) => computed({
  get: () => {
    const value = pageRoute.query[key];
    return typeof value === 'string' && value ? value : null;
  },
  /** @param {string | null | undefined} value */
  set: (value) => {
    router.replace({ query: { ...pageRoute.query, [key]: value || undefined } });
  },
});

const typeFilter = queryFilter('type');
const agencyFilter = queryFilter('agency');
const liveParam = queryFilter('live');
const disruptedParam = queryFilter('disrupted');
const liveOnly = computed({
  get: () => liveParam.value === '1',
  set: (on) => { liveParam.value = on ? '1' : null; },
});
const disruptedOnly = computed({
  get: () => disruptedParam.value === '1',
  set: (on) => { disruptedParam.value = on ? '1' : null; },
});

// the routes dataset has no agency, so it comes from the schedule
const { agencyByRoute, isPending: agenciesPending } = useRouteAgencies();

const agencyOptions = computed(() => [...new Set(agencyByRoute.value.values())].sort(compareAgencies));

const typeOptions = computed(() =>
  [...new Set((routes.value ?? []).map((r) => r.route_type))]
    .sort()
    .reverse()
    .map((type) => ({ value: type, title: routeTypeLabel(type) })));

const liveRoutes = computed(() => new Set(busesByRoute.value.keys()));

const filtersActive = computed(() =>
  !!(typeFilter.value || agencyFilter.value || liveOnly.value || disruptedOnly.value));

const clearFilters = () => {
  search.value = '';
  router.replace({ query: { ...pageRoute.query, type: undefined, agency: undefined, live: undefined, disrupted: undefined } });
};

const filteredRoutes = computed(() =>
  filterRoutes(
    routes.value ?? [],
    {
      search: search.value ?? '',
      type: typeFilter.value,
      agency: agencyFilter.value,
      live: liveOnly.value,
      disrupted: disruptedOnly.value,
    },
    { agencies: agencyByRoute.value, liveRoutes: liveRoutes.value, disruptedRoutes: disruptedRoutes.value },
  ));

const agencyGroups = computed(() => groupRoutesByAgency(filteredRoutes.value, agencyByRoute.value));

// grouping waits for the agencies too, so the list doesn't reshuffle when they arrive
const listLoading = computed(() => !routes.value || agenciesPending.value);
</script>
<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-headline-large mb-4">
          Routes
        </h1>
        <v-text-field
          v-model="search"
          label="Search by Route Name or ID"
          prepend-inner-icon="mdi-magnify"
          clearable
          hide-details
        />
        <div class="filters d-flex flex-wrap align-center ga-2 mt-3 mb-2">
          <v-select
            v-model="agencyFilter"
            :items="agencyOptions"
            :loading="agenciesPending"
            placeholder="All agencies"
            aria-label="Agency"
            prepend-inner-icon="mdi-domain"
            density="compact"
            variant="outlined"
            class="agency-select"
            clearable
            hide-details
            persistent-placeholder
          />
          <v-chip-group
            v-model="typeFilter"
            selected-class="text-primary"
            filter
            class="py-0"
            aria-label="Vehicle type"
          >
            <v-chip
              v-for="option in typeOptions"
              :key="option.value"
              :value="option.value"
              variant="outlined"
              :prepend-icon="option.title === 'LRT' ? 'mdi-train' : 'mdi-bus'"
            >
              {{ option.title }}
            </v-chip>
          </v-chip-group>
          <v-chip
            :variant="liveOnly ? 'tonal' : 'outlined'"
            :color="liveOnly ? 'primary' : undefined"
            :prepend-icon="liveOnly ? 'mdi-check' : 'mdi-access-point'"
            :aria-pressed="liveOnly"
            @click="liveOnly = !liveOnly"
          >
            Running now
          </v-chip>
          <v-chip
            :variant="disruptedOnly ? 'tonal' : 'outlined'"
            :color="disruptedOnly ? 'warning' : undefined"
            :prepend-icon="disruptedOnly ? 'mdi-check' : 'mdi-alert'"
            :aria-pressed="disruptedOnly"
            @click="disruptedOnly = !disruptedOnly"
          >
            Disruptions
          </v-chip>
        </div>
        <v-skeleton-loader v-if="listLoading" type="list-item@8" class="route-list-loader" aria-label="Loading routes" />
        <div v-else class="d-flex align-center text-body-medium text-medium-emphasis mb-2 px-1">
          {{ filteredRoutes.length }} {{ filteredRoutes.length === 1 ? 'route' : 'routes' }}
          <v-btn
            v-if="filtersActive"
            variant="text"
            size="small"
            color="primary"
            class="ml-auto"
            @click="clearFilters"
          >
            Clear filters
          </v-btn>
        </div>
        <div v-if="!listLoading && !filteredRoutes.length" class="text-medium-emphasis pa-4 text-center">
          No routes match
        </div>
        <template v-for="group in agencyGroups" v-else-if="!listLoading" :key="group.agency ?? ''">
          <h2
            v-if="group.agency || agencyGroups.length > 1"
            class="text-title-small text-medium-emphasis mt-4 mb-1 px-2"
          >
            {{ group.agency ?? 'Other' }}
          </h2>
          <v-card variant="outlined">
            <template v-for="(route, index) in group.routes" :key="route.route_id">
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
                <div class="flex-grow-1 min-width-0">
                  <div class="text-body-large" :style="transitionName(route.route_id, 'route-name')">
                    {{ route.route_long_name }}
                  </div>
                </div>
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
                  <div v-for="headsignGroup in headsignGroups" v-else :key="headsignGroup.headsign ?? ''" class="mb-1">
                    <div class="text-title-small">
                      {{ headsignGroup.headsign ?? 'Not in the current schedule' }}
                    </div>
                    <v-chip
                      v-for="bus in headsignGroup.buses"
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
                    size="large"
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
        </template>
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

.agency-select {
  flex: 1 1 220px;
  max-width: 320px;
}

/* on phones the agency takes the whole line, with the chips under it */
@media (max-width: 599px) {
  .agency-select {
    flex-basis: 100%;
    max-width: none;
  }
}

.route-list-loader {
  background: transparent;
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
