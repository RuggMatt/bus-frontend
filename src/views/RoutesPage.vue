<script setup>
import { useRoutes } from '../composables/useRoutes';
import { ref, computed } from 'vue';
import { useBuses } from '../composables/useBuses';
import { RouterLink, useRouter } from 'vue-router';
import RouteBadge from '../components/RouteBadge.vue';
import { transitionLinkClick } from '../utils/viewTransition';
import { useNowLocal, useServiceAlerts } from '../composables/useServiceAlerts';
import { routesWithActiveAlerts } from '../utils/serviceAlerts';

const { routes } = useRoutes();
const { buses } = useBuses();
// const { trips } = useTrips();

/**
 * @return {import("../api").Bus[]}
 */
const getCurrentBusesOnRoute = (routeId) => {
  if (!buses.value || !routes.value) return "";
  return buses.value.filter(bus => bus.route_id === routeId)
};

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
        <v-list two-line>
          <template v-for="route in filteredRoutes" :key="route.route">
            <v-list-item>
              <v-list-item-content>
                <v-list-item-title>
                  <RouteBadge
                    :route-id="route.route_id"
                    size="small"
                    class="mr-2"
                    :style="transitionName(route.route_id, 'route-number')"
                  /><v-icon
                    v-if="disruptedRoutes.has(route.route_id)"
                    v-tooltip="'Service disruption'"
                    icon="mdi-alert"
                    color="warning"
                    size="small"
                    class="mr-2"
                    aria-label="Service disruption"
                    role="img"
                  /><span :style="transitionName(route.route_id, 'route-name')">{{ route.route_long_name }}</span>
                </v-list-item-title>
                <v-list-item-subtitle>
                  <router-link v-for="bus in getCurrentBusesOnRoute(route.route_id)" :key="bus.bus" :to="`/buses/${encodeURIComponent(bus.bus)}`">
                    <v-chip class="ma-1" color="primary" text-color="white" small>
                      {{ bus.bus }}
                    </v-chip>
                  </router-link>
                </v-list-item-subtitle>
              </v-list-item-content>
              <template #append>
                <v-btn
                  icon
                  :href="`/routes/${route.route_id}`"
                  :aria-label="`Route ${route.route_long_name}`"
                  @click="openRoute($event, route)"
                >
                  <v-icon>mdi-chevron-right</v-icon>
                </v-btn>
              </template>
            </v-list-item>
            <v-divider />
          </template>
        </v-list>
      </v-col>
    </v-row>
  </v-container>
</template>