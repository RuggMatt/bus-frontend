<script setup>
// @ts-check
import { computed, ref } from 'vue';
import { effectLabel, formatAlertPeriod } from '../utils/serviceAlerts';
import RouteBadge from './RouteBadge.vue';

const props = defineProps({
  /** @type {import('vue').PropType<import('../utils/serviceAlerts').AlertTiming>} */
  timing: {
    type: Object,
    required: true,
  },
  // local time, for "Until today at 6:00 PM"
  now: {
    type: String,
    required: true,
  },
  // shows the routes the alert affects, for pages that aren't about one route
  showRoutes: {
    type: Boolean,
    default: false,
  },
});

const expanded = ref(false);

const alert = computed(() => props.timing.alert);
const icon = computed(() => (alert.value.effect === 'STOP_MOVED' ? 'mdi-bus-stop' : 'mdi-sign-direction'));
const when = computed(() => formatAlertPeriod(props.timing, props.now));
const routeIds = computed(() => [...alert.value.routeIds].sort());
// the header often says it all, as with a stop closure
const hasMore = computed(() => !!alert.value.description && alert.value.description !== alert.value.header);
</script>

<template>
  <v-alert
    type="warning"
    variant="tonal"
    density="compact"
    :icon="icon"
    class="service-alert"
  >
    <div class="text-body-large font-weight-medium">
      {{ alert.header || effectLabel(alert.effect) }}
    </div>
    <div class="text-body-small d-flex align-center flex-wrap ga-1 mt-1">
      <v-chip size="x-small" variant="tonal" color="warning">
        {{ effectLabel(alert.effect) }}
      </v-chip>
      <span>{{ when }}</span>
    </div>
    <div v-if="showRoutes && routeIds.length" class="d-flex flex-wrap ga-1 mt-2">
      <router-link
        v-for="routeId in routeIds"
        :key="routeId"
        :to="`/routes/${routeId}`"
        :aria-label="`Route ${routeId}`"
      >
        <RouteBadge :route-id="routeId" size="small" />
      </router-link>
    </div>
    <template v-if="hasMore">
      <div
        class="service-alert__description text-body-medium mt-2"
        :class="{ 'service-alert__description--clamped': !expanded }"
      >
        {{ alert.description }}
      </div>
      <v-btn
        variant="text"
        size="small"
        density="compact"
        class="px-0 mt-1"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Less' : 'More' }}
      </v-btn>
    </template>
  </v-alert>
</template>

<style scoped>
.service-alert__description {
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.service-alert__description--clamped {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
</style>
