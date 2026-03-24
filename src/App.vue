<template>
  <v-app>
    <v-app-bar app>
      <v-app-bar-nav-icon variant="text" @click.stop="drawer = !drawer" />
      <v-app-bar-title>
        Edmonton Bus Data
      </v-app-bar-title>
    </v-app-bar>
    <v-navigation-drawer v-model="drawer">
      <v-list>
        <v-list-item nav to="/" prepend-icon="mdi-home">
          Home
        </v-list-item>
        <v-divider />
        <v-list-subheader>
          Electric
        </v-list-subheader>
        <v-list-item nav to="/electric" prepend-icon="mdi-map-marker">
          Electric Bus Finder
        </v-list-item>
        <v-list-item nav to="/electric-bus-stats" prepend-icon="mdi-chart-bar">
          Electric Bus Stats
        </v-list-item>
        <v-divider />
        <v-list-subheader>
          Hydrogen
        </v-list-subheader>
        <v-list-item nav to="/hydrogen" prepend-icon="mdi-map-marker">
          Hydrogen Bus Finder
        </v-list-item>
        <v-list-item nav to="/hydrogen-bus-stats" prepend-icon="mdi-chart-bar">
          Hydrogen Bus Stats
        </v-list-item>
        <v-divider />
        <v-list-item nav to="/about" prepend-icon="mdi-information-outline">
          About
        </v-list-item>
      </v-list>
    </v-navigation-drawer>
    <v-main app>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup>
import { ref } from 'vue';

const drawer = ref(false);
</script>