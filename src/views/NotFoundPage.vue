<script setup>
import { useRoute } from 'vue-router';

const route = useRoute();

const links = [
  { to: '/', icon: 'mdi-map', title: 'Map' },
  { to: '/routes', icon: 'mdi-routes', title: 'Routes' },
];
</script>
<template>
  <v-container class="not-found text-center py-12">
    <v-icon icon="mdi-map-marker-question-outline" size="64" color="medium-emphasis" />
    <h1 class="text-headline-small mt-4">
      Page not found
    </h1>
    <p class="text-body-medium text-medium-emphasis mt-2">
      There's nothing at <span class="not-found-path">{{ route.fullPath }}</span>. It may have
      been mistyped, or the link may be out of date.
    </p>
    <div class="d-flex flex-wrap justify-center ga-2 mt-6">
      <v-btn
        v-for="link in links"
        :key="link.to"
        :to="link.to"
        :prepend-icon="link.icon"
        variant="tonal"
        color="primary"
        size="large"
      >
        {{ link.title }}
      </v-btn>
    </div>
  </v-container>
</template>
<style scoped>
.not-found {
  max-width: 480px;
}

.not-found-path {
  word-break: break-all;
}
</style>
