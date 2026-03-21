<template>
  <v-app>
    <v-app-bar app>
      <v-app-bar-nav-icon variant="text" @click.stop="drawer = !drawer" />
      <v-app-bar-title>
        Edmonton Bus Data
      </v-app-bar-title>
    </v-app-bar>
    <v-navigation-drawer v-model="drawer">
      <v-list-item nav to="/">
        Home
      </v-list-item>
      <v-list-item nav to="/electric">
        Electric Bus Finder
      </v-list-item>
      <v-list-item nav to="/hydrogen">
        Hydrogen Bus Finder
      </v-list-item>
      <v-list-item nav to="/electric-bus-stats">
        Electric Bus Stats
      </v-list-item>
      <v-list-item nav to="/hydrogen-bus-stats">
        Hydrogen Bus Stats
      </v-list-item>
      <v-list-item nav to="/about">
        About
      </v-list-item>
      <v-list-item nav to="/old">
        Old
      </v-list-item>
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