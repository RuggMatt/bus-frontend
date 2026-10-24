<script setup>
const links = [
  {
    href: 'https://github.com/RuggMatt/bus-frontend',
    icon: 'mdi-github',
    title: 'bus-frontend',
    text: 'the source of this site',
  },
  {
    href: 'https://github.com/RuggMatt/bus-frontend/issues',
    icon: 'mdi-bug-outline',
    title: 'Report an issue',
    text: 'something broken or wrong on the site',
  },
  {
    href: 'https://data.edmonton.ca',
    icon: 'mdi-database',
    title: 'City of Edmonton open data',
    text: 'stops, routes, schedules and service alerts',
  },
  {
    href: 'https://www.edmonton.ca/transit',
    icon: 'mdi-bus',
    title: 'Edmonton Transit Service',
    text: 'the official schedules, fares and service information',
  },
];
</script>

<template>
  <v-container class="about py-8">
    <h1>About</h1>

    <p class="text-body-medium">
      Edmonton Bus Tracker shows where Edmonton Transit's buses are right now, what's due at a stop,
      and how the last few days went. Every trip and bus can be looked at afterwards, with its recorded
      positions and how late it was at each stop.
    </p>

    <h2 class="text-h6 mt-8">
      Where the data comes from
    </h2>
    <p class="text-body-medium">
      Live positions come from the project's own collector, which polls the buses' GPS about every 30
      seconds and keeps a rolling history of the last three days. Schedules, timetables and service
      alerts (detours, stop closures) come from the
      <a href="https://data.edmonton.ca">City of Edmonton's open data</a>, and the map tiles from
      Mapbox. How late each trip was at each stop is worked out overnight from the recorded positions,
      which is why today's delays aren't here yet.
    </p>

    <h2 class="text-h6 mt-8">
      What it isn't
    </h2>
    <p class="text-body-medium">
      This is a personal project, not a service of Edmonton Transit Service or the City of Edmonton.
      Nothing here comes from onboard systems, so arrival times are estimates from a bus's last known
      position and its scheduled speed, and they can be wrong by several minutes. For anything
      time-critical, check
      <a href="https://www.edmonton.ca/transit">the official ETS information</a>.
    </p>

    <h2 class="text-h6 mt-8">
      Found a problem?
    </h2>
    <p class="text-body-medium">
      If something's broken, looks wrong or could be better, please
      <a href="https://github.com/RuggMatt/bus-frontend/issues">open an issue on GitHub</a>.
      A link to the page and what you expected to see helps.
    </p>

    <h2 class="text-h6 mt-8">
      Elsewhere
    </h2>
    <div class="about-links mt-4">
      <v-btn
        v-for="link in links"
        :key="link.href"
        :href="link.href"
        target="_blank"
        rel="noopener"
        variant="tonal"
        color="primary"
        :prepend-icon="link.icon"
        class="about-link text-left"
      >
        <span class="about-link-title">{{ link.title }}</span>
        <span class="about-link-text">{{ link.text }}</span>
      </v-btn>
    </div>

    <p class="text-body-small text-medium-emphasis mt-8">
      Built with Vue 3, Vite, Vuetify, TanStack Vue Query and Leaflet.
    </p>
  </v-container>
</template>

<style scoped>
.about {
  max-width: 640px;
}

.about a {
  color: rgb(var(--v-theme-primary));
}

.about-links {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* the button's own label sits beside the icon, so the two lines stack here */
.about-link {
  height: auto;
  min-width: 0;
  padding: 12px 16px;
}

.about-link :deep(.v-btn__content) {
  align-items: flex-start;
  flex-direction: column;
  gap: 0;
  white-space: normal;
}

.about-link-title {
  font-weight: 500;
  line-height: 1.3;
}

.about-link-text {
  font-size: 0.75rem;
  opacity: 0.7;
  line-height: 1.3;
}
</style>