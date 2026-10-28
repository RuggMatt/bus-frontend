<script setup>
// One search for a route number or a stop number (or name), over the main map
import RouteBadge from './RouteBadge.vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useRoutes } from '../composables/useRoutes';
import { useStops } from '../composables/useStops';
import { rankSearchResults } from '../utils/mapSearch';

const emit = defineEmits(['select-stop']);

const router = useRouter();
const search = ref('');
// the routes and stops are only fetched once the user starts searching
const wanted = ref(false);
const { routes, isLoading: routesLoading } = useRoutes({ enabled: wanted });
const { stops, keyedStops, isLoading: stopsLoading } = useStops({ enabled: wanted });

const results = computed(() => rankSearchResults(search.value, routes.value ?? [], stops.value ?? []));

/** @param {string | null} value `route:<id>` or `stop:<id>` */
const pick = (value) => {
  if (!value) return;
  search.value = '';
  // a tapped result would otherwise leave the keyboard covering what it opened
  /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
  const [kind, id] = [value.slice(0, value.indexOf(':')), value.slice(value.indexOf(':') + 1)];
  if (kind === 'route') {
    const route = routes.value?.find((candidate) => candidate.route_id === id);
    router.push({ path: `/routes/${encodeURIComponent(id)}`, state: { routeLongName: route?.route_long_name } });
  } else if (keyedStops.value[id]) {
    emit('select-stop', keyedStops.value[id]);
  }
};
</script>

<template>
  <v-autocomplete
    v-model:search="search"
    :model-value="null"
    :items="results"
    item-props
    no-filter
    auto-select-first
    variant="solo"
    density="compact"
    placeholder="Route or stop number"
    enterkeyhint="search"
    aria-label="Search for a route by number, or a stop by number or name"
    prepend-inner-icon="mdi-magnify"
    menu-icon=""
    no-data-text="No matching routes or stops"
    hide-details
    :hide-no-data="!search || routesLoading || stopsLoading"
    :loading="wanted && (routesLoading || stopsLoading)"
    @focus="wanted = true"
    @update:search="wanted = true"
    @update:model-value="pick"
  >
    <template #item="{ props: itemProps, item }">
      <v-list-item v-bind="itemProps">
        <template #prepend>
          <RouteBadge v-if="item.value.startsWith('route:')" :route-id="item.value.slice(6)" size="small" class="mr-4" />
          <v-icon v-else icon="mdi-bus-stop" />
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>
