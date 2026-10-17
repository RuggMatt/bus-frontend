<script setup>
import { useStopArrivals } from '../composables/useStopArrivals';
import StopArrivalsList from './StopArrivalsList.vue';
import { onBeforeUnmount, toRef, watch } from 'vue';

// one bay of a transit centre, with its own arrivals, listed with the station's others
const props = defineProps({
  stop: {
    type: Object,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  subtitle: {
    type: String,
    default: '',
  },
  // the bay the page was opened at
  current: {
    type: Boolean,
    default: false,
  },
  selectedBusId: {
    type: [Number, String],
    default: null,
  },
  /** @type {import('vue').PropType<{stopsAway: number | null, nextStopName: string | null} | null>} */
  selectedBusProgress: {
    type: Object,
    default: null,
  },
});

const emit = defineEmits(['bus-click', 'select', 'route-groups']);

const { routeGroups, isLoading, isError } = useStopArrivals(toRef(props, 'stop'));

// the page draws every bay's buses on the map
watch(routeGroups, (groups) => emit('route-groups', props.stop.stop_id, groups), { immediate: true });
onBeforeUnmount(() => emit('route-groups', props.stop.stop_id, []));
</script>

<template>
  <section class="station-bay" :aria-label="title">
    <button
      v-ripple
      type="button"
      class="bay-header d-flex align-center ga-2 px-4 py-2 mb-2"
      :class="{ 'bay-header--current': current }"
      :aria-current="current ? 'location' : undefined"
      @click="$emit('select', stop)"
    >
      <v-icon icon="mdi-bus-stop" size="small" :color="current ? 'primary' : undefined" class="flex-shrink-0" />
      <div class="min-width-0 text-left">
        <h3 class="text-title-medium" :class="{ 'text-primary': current }">
          {{ title }}
        </h3>
        <div v-if="subtitle" class="text-body-small text-medium-emphasis">
          {{ subtitle }}
        </div>
      </div>
    </button>
    <StopArrivalsList
      :stop="stop"
      :route-groups="routeGroups"
      :is-loading="isLoading"
      :is-error="isError"
      :selected-bus-id="selectedBusId"
      :selected-bus-progress="selectedBusProgress"
      @bus-click="$emit('bus-click', $event)"
    />
  </section>
</template>

<style scoped>
.bay-header {
  background: none;
  border: 0;
  border-left: 4px solid transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  width: 100%;
}

.bay-header h3 {
  margin: 0;
}

.bay-header:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

/* the bay the page was opened at, also picked out on the map */
.bay-header--current {
  border-left-color: rgb(var(--v-theme-primary));
}

.min-width-0 {
  min-width: 0;
}
</style>
