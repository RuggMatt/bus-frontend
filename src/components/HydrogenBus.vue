<template>
  <v-container style="max-width: 450px; width: 100%; margin: 0 auto; padding: 0; overflow: hidden; max-height: 100vh">
    <v-list
      id="bus-list"
      max-width="450"
      style="height: 94vh; box-sizing: border-box; overflow: auto; margin: 0 auto;"
    >
      <v-list-item>
        <v-btn
          block
          color="primary"
          :disabled="loading"
          @click="refresh"
        >
          {{ loading ? 'REFRESHING' : 'REFRESH' }}
        </v-btn>
      </v-list-item>

      <template v-if="buses.length && !loading">
        <template v-for="bus in buses" :key="bus.bus">
          <v-list-item>
            <v-list-item-title>
              <b>{{ bus.route?.route_id }}</b>
            </v-list-item-title>
            <v-list-item-subtitle>{{ bus.route?.trip_headsign }} - {{ bus.bus }}</v-list-item-subtitle>
            <template #append>
              <div style="text-align: center;">
                <span style="font-size: 2em;">{{ Number(bus.dist / 0.005).toFixed(0) }}</span>
                <br>min.
              </div>
            </template>
          </v-list-item>
        </template>
      </template>

      <v-list-item v-else-if="locating">
        Locating...
      </v-list-item>
      <v-list-item v-else-if="loading">
        Loading...
      </v-list-item>
      <v-list-item v-else>
        No Hydrogen Buses
      </v-list-item>
    </v-list>
  </v-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { getHydrogenBuses } from '../api/index.js';
import { getTrip } from '../api/index.js';

const REFRESH_INTERVAL = 60000;

const buses = ref([]);
const loading = ref(false);
const locating = ref(false);

let userLat = 53.5212;
let userLng = -113.5213;
let intervalId = null;

const getLocation = () =>
  new Promise((resolve) => {
    locating.value = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLat = pos.coords.latitude;
        userLng = pos.coords.longitude;
        locating.value = false;
        resolve();
      },
      () => {
        locating.value = false;
        resolve();
      }
    );
  });

const refresh = async () => {
  loading.value = true;
  await getLocation();

  try {
    const raw = await getHydrogenBuses();
    const withRoutes = await Promise.all(
      raw.map(async (bus) => {
        bus.route = await getTrip(bus.trip);
        bus.dist = Math.sqrt((userLat - bus.lat) ** 2 + (userLng - bus.long) ** 2);
        return bus;
      })
    );
    withRoutes.sort((a, b) => a.dist - b.dist);
    buses.value = withRoutes;
  } finally {
    loading.value = false;
  }
};

onMounted(() => {
  refresh();
  intervalId = setInterval(refresh, REFRESH_INTERVAL);
});

onUnmounted(() => {
  clearInterval(intervalId);
});
</script>
