<script setup>
import { useRoutes } from '../composables/useRoutes';
import { ref, computed } from 'vue';
import { useBuses } from '../composables/useBuses';
import { RouterLink } from 'vue-router';

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
        <h1 class="text-h4 mb-4">
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
            <v-list-item >
              <v-list-item-content>
                <v-list-item-title>{{ route.route_id }} - {{ route.route_long_name }}</v-list-item-title>
                <v-list-item-subtitle>
                  <router-link v-for="bus in getCurrentBusesOnRoute(route.route_id)" :key="bus.bus" :to="`/trips/${bus.trip}`">
                    <v-chip class="ma-1" color="primary" text-color="white" small>{{ bus.bus }}</v-chip>
                  </router-link>
                </v-list-item-subtitle>
              </v-list-item-content>
              <template #append>
                <v-btn icon :to="`/routes/${route.route_id}`">
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