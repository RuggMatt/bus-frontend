<template>
  <v-app>
    <v-navigation-drawer v-if="!mobile" permanent :rail="rail">
      <v-list nav>
        <template v-for="(section, index) in navSections" :key="index">
          <v-divider v-if="index > 0" />
          <v-list-subheader v-if="section.title && !rail">
            {{ section.title }}
          </v-list-subheader>
          <v-list-item
            v-for="item in section.items"
            :key="item.to"
            nav
            :to="item.to"
            :prepend-icon="item.icon"
            :title="item.title"
            :active="item.tab ? activeTab === item.tab : undefined"
          >
            <v-tooltip activator="parent" location="end" :disabled="!rail">
              {{ item.title }}
            </v-tooltip>
          </v-list-item>
        </template>
      </v-list>
      <template #append>
        <v-list nav>
          <v-list-item
            nav
            :prepend-icon="rail ? 'mdi-chevron-right' : 'mdi-chevron-left'"
            title="Collapse"
            @click="rail = !rail"
          >
            <v-tooltip activator="parent" location="end" :disabled="!rail">
              Expand
            </v-tooltip>
          </v-list-item>
        </v-list>
      </template>
    </v-navigation-drawer>
    <v-main>
      <router-view />
    </v-main>
    <template v-if="mobile">
      <v-bottom-navigation grow :height="76" :model-value="activeTab">
        <v-btn
          v-for="item in tabItems"
          :key="item.tab"
          :value="item.tab"
          :to="item.to"
          :active="activeTab === item.tab"
        >
          <v-icon :icon="item.icon" size="32" />
          {{ item.title }}
        </v-btn>
        <v-btn value="more" :active="activeTab === 'more'" @click="moreOpen = true">
          <v-icon icon="mdi-dots-horizontal" size="32" />
          More
        </v-btn>
      </v-bottom-navigation>
      <v-bottom-sheet v-model="moreOpen">
        <v-card class="rounded-t-lg">
          <v-list nav>
            <template v-for="(section, index) in moreSections" :key="index">
              <v-divider v-if="index > 0" />
              <v-list-subheader v-if="section.title">
                {{ section.title }}
              </v-list-subheader>
              <v-list-item
                v-for="item in section.items"
                :key="item.to"
                nav
                :to="item.to"
                :prepend-icon="item.icon"
                :title="item.title"
                @click="moreOpen = false"
              />
            </template>
          </v-list>
        </v-card>
      </v-bottom-sheet>
    </template>
  </v-app>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';

const { mobile } = useDisplay();
const route = useRoute();
// desktop keeps the drawer open and collapses it to icons, mobile uses bottom tabs instead
const rail = ref(true);
const moreOpen = ref(false);

// items with a tab are the main sections, the rest go under "More" on mobile
const navSections = [
  {
    items: [
      { title: 'Buses', to: '/', icon: 'mdi-bus', tab: 'buses' },
      { title: 'Stops', to: '/stops', icon: 'mdi-bus-stop', tab: 'stops' },
      { title: 'Routes', to: '/routes', icon: 'mdi-routes', tab: 'routes' },
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
    title: 'History',
    items: [{ title: 'Delays', to: '/delays', icon: 'mdi-clock-alert-outline' }],
  },
  {
    items: [{ title: 'About', to: '/about', icon: 'mdi-information-outline' }],
  },
];

const tabItems = navSections.flatMap((section) => section.items).filter((item) => item.tab);
const moreSections = navSections
  .map((section) => ({ ...section, items: section.items.filter((item) => !item.tab) }))
  .filter((section) => section.items.length > 0);

// by path, so detail pages light up their section's tab (trips belong to routes)
const activeTab = computed(() => {
  const path = route.path;
  // a mistyped /trips/… address isn't in any section
  if (route.name === 'Not Found') return null;
  if (path === '/' || path.startsWith('/buses/')) return 'buses';
  if (path.startsWith('/stops')) return 'stops';
  if (path.startsWith('/routes') || path.startsWith('/trips')) return 'routes';
  return 'more';
});
</script>
<style>
/* shared elements morph between pages, see utils/viewTransition.js */
::view-transition-group(*) {
  animation-duration: 300ms;
  animation-timing-function: ease;
}

/* the map shared between pages, see plugins/sharedMap.js */
.shared-map {
  view-transition-name: shared-map;
}

/* crops rather than stretches between the full-screen and card boxes, keeping the centre */
::view-transition-old(shared-map),
::view-transition-new(shared-map) {
  height: 100%;
  object-fit: cover;
  overflow: clip;
}
</style>
