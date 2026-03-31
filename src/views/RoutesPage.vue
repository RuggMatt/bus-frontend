<script setup>
import { useRoutes } from '../composables/useRoutes';
import { ref, computed } from 'vue';
import { useBuses } from '../composables/useBuses';

const { routes } = useRoutes();
const { buses } = useBuses();
// const { trips } = useTrips();


const getCurrentBusesOnRoute = (routeId) => {
  if (!buses.value || !routes.value) return "";
  return buses.value.filter(bus => bus.route_id === routeId).map(e => e.bus).join(", ")
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
        <h1 class="text-h4 mb-4">Bus Routes</h1>
        <v-text-field
          v-model="search"
          label="Search by Route Name or ID"
          prepend-inner-icon="mdi-magnify"
          class="mb-4"
          clearable
        />
        <v-list two-line>
          <template v-for="route in filteredRoutes" :key="route.route">
            <v-list-item :to="`/route/${route.route}`">
              <v-list-item-content>
                <v-list-item-title>{{ route.route_id }} - {{ route.route_long_name }}</v-list-item-title>
                <v-list-item-subtitle>
                  {{ getCurrentBusesOnRoute(route.route_id) }}
                </v-list-item-subtitle>
              </v-list-item-content>
            </v-list-item>
            <v-divider />
          </template>
        </v-list>
      </v-col>
    </v-row>
  </v-container>
</template>