<script setup>
// @ts-check
import { computed, nextTick, ref } from 'vue';

/** @typedef {{stop_id: string, name: string, code: string}} RouteStop */

const props = defineProps({
    // the route's stops in order, along the trip most of its buses here take
    stops: {
        type: /** @type {import('vue').PropType<RouteStop[]>} */ (Array),
        required: true,
    },
    // where the shown stop is in `stops`, -1 before they load
    index: {
        type: Number,
        required: true,
    },
    // shown until the stops load
    name: {
        type: String,
        required: true,
    },
    code: {
        type: String,
        required: true,
    },
});

const emit = defineEmits(['select']);

const menu = ref(false);

const previous = computed(() => (props.index > 0 ? props.stops[props.index - 1] : null));
const next = computed(() => (props.index !== -1 ? props.stops[props.index + 1] ?? null : null));

/** @param {string} stopId */
const pick = (stopId) => {
    menu.value = false;
    if (stopId !== props.stops[props.index]?.stop_id) emit('select', stopId);
};

// a route has dozens of stops, so start the list at this one
const showCurrent = async () => {
    await nextTick();
    document.querySelector('.stop-picker-item--current')?.scrollIntoView({ block: 'center' });
};
</script>

<template>
  <div class="stop-picker d-flex align-center ga-1">
    <v-btn
      icon="mdi-chevron-left"
      variant="text"
      aria-label="Previous stop"
      :title="previous ? `Previous stop: ${previous.name}` : undefined"
      :disabled="!previous"
      @click="previous && pick(previous.stop_id)"
    />
    <v-menu v-model="menu" location="bottom center" max-height="400" @after-enter="showCurrent">
      <template #activator="{ props: activator }">
        <button
          v-ripple
          v-bind="activator"
          type="button"
          class="stop-picker__current flex-grow-1 min-width-0 pa-2"
          aria-label="Pick another stop on this route"
          :disabled="!stops.length"
        >
          <span class="d-flex align-center justify-center">
            <span class="text-title-medium stop-picker__name">{{ name }}</span>
            <v-icon v-if="stops.length" icon="mdi-menu-down" class="ml-1" />
          </span>
          <span class="d-block text-body-small text-medium-emphasis">Stop {{ code }}</span>
        </button>
      </template>
      <v-list density="compact" :selected="index === -1 ? [] : [index]">
        <v-list-item
          v-for="(stop, position) in stops"
          :key="`${position}-${stop.stop_id}`"
          :value="position"
          :title="stop.name"
          :subtitle="`Stop ${stop.code}`"
          color="primary"
          :class="{ 'stop-picker-item--current': position === index }"
          @click="pick(stop.stop_id)"
        />
      </v-list>
    </v-menu>
    <v-btn
      icon="mdi-chevron-right"
      variant="text"
      aria-label="Next stop"
      :title="next ? `Next stop: ${next.name}` : undefined"
      :disabled="!next"
      @click="next && pick(next.stop_id)"
    />
  </div>
</template>

<style scoped>
.stop-picker__current {
  background: none;
  border: 0;
  border-radius: 4px;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: center;
}

.stop-picker__current:not(:disabled):hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.stop-picker__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.min-width-0 {
  min-width: 0;
}
</style>
