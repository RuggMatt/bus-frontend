<template>
  <v-app>
    <v-app-bar app>
      <v-app-bar-nav-icon variant="text" @click.stop="toggleDrawer" />
      <v-app-bar-title>
        Edmonton Bus Data
      </v-app-bar-title>
    </v-app-bar>
    <v-navigation-drawer
      :model-value="mobile ? drawer : true"
      :rail="railed"
      @update:model-value="drawer = $event"
    >
      <v-list nav>
        <template v-for="(section, index) in navSections" :key="index">
          <v-divider v-if="index > 0" />
          <v-list-subheader v-if="section.title && !railed">
            {{ section.title }}
          </v-list-subheader>
          <v-list-item
            v-for="item in section.items"
            :key="item.to"
            nav
            :to="item.to"
            :prepend-icon="item.icon"
          >
            {{ item.title }}
            <v-tooltip activator="parent" location="end" :disabled="!railed">
              {{ item.title }}
            </v-tooltip>
          </v-list-item>
        </template>
      </v-list>
    </v-navigation-drawer>
    <v-main app>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useDisplay } from 'vuetify';

const { mobile } = useDisplay();
// mobile slides the drawer in and out, desktop keeps it open and collapses it to icons
const drawer = ref(false);
const rail = ref(true);
const railed = computed(() => !mobile.value && rail.value);

const navSections = [
  {
    items: [
      { title: 'Home', to: '/', icon: 'mdi-home' },
      { title: 'Bus Routes', to: '/routes', icon: 'mdi-bus' },
      { title: 'Bus Stops', to: '/stops', icon: 'mdi-bus-stop' },
    ],
  },
  {
    title: 'Electric',
    items: [
      { title: 'Electric Bus Finder', to: '/electric', icon: 'mdi-map-marker' },
      { title: 'Electric Bus Stats', to: '/electric-bus-stats', icon: 'mdi-chart-bar' },
    ],
  },
  {
    title: 'Hydrogen',
    items: [
      { title: 'Hydrogen Bus Finder', to: '/hydrogen', icon: 'mdi-map-marker' },
      { title: 'Hydrogen Bus Stats', to: '/hydrogen-bus-stats', icon: 'mdi-chart-bar' },
    ],
  },
  {
    items: [{ title: 'About', to: '/about', icon: 'mdi-information-outline' }],
  },
];

const toggleDrawer = () => {
  if (mobile.value) {
    drawer.value = !drawer.value;
  } else {
    rail.value = !rail.value;
  }
};
</script>