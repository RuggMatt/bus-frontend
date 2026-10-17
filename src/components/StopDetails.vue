<script setup>
import { routeNumber } from '../utils/routes';
import { bayName, describePlatforms, sortBays } from '../utils/stations';
import { useStops } from '../composables/useStops';
import { useStationHeadsigns } from '../composables/useStationHeadsigns';
import StopArrivalsList from './StopArrivalsList.vue';
import StationBay from './StationBay.vue';
import { computed, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

const props = defineProps({
  stop: {
    type: Object,
    required: true,
  },
  /** @type {import('vue').PropType<import('../composables/useStopArrivals').StopRouteGroup[]>} */
  routeGroups: {
    type: Array,
    default: () => [],
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  isError: {
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
  // an LRT station's other platform, loaded alongside so it can be swiped to
  otherStop: {
    type: Object,
    default: null,
  },
  /** @type {import('vue').PropType<import('../composables/useStopArrivals').StopRouteGroup[]>} */
  otherRouteGroups: {
    type: Array,
    default: () => [],
  },
  otherIsLoading: {
    type: Boolean,
    default: false,
  },
});

defineEmits(["close", "bus-click", "bay-route-groups"]);

const router = useRouter();

// --- the other platforms or bays of the stop's station ---
const { keyedStops } = useStops();
const { platformStops, headsignRows } = useStationHeadsigns(() => props.stop);

const platforms = computed(() =>
  headsignRows.value ? describePlatforms(platformStops.value, headsignRows.value) : []);
// an LRT station's two platforms are its two directions, so they get a toggle
const directionPlatforms = computed(() =>
  platforms.value.length === 2 && platforms.value.every((platform) => platform.rail));

/** @param {import('../utils/stations').Platform} platform */
const platformLabel = (platform) =>
  platform.headsigns.length ? `To ${platform.headsigns[0]}` : `Stop ${platform.stop_code}`;

const stationName = computed(() =>
  (props.stop.parent_station && keyedStops.value[props.stop.parent_station]?.stop_name) || '');

// a transit centre's bays are all listed at once, each under its own name ("Bay A") when it
// has one, else its stop number
const bays = computed(() => {
  if (!platforms.value.length || directionPlatforms.value) return [];
  const routesOf = new Map(platforms.value.map((platform) => [platform.stop_id, platform.routeIds]));
  const nameOf = (/** @type {import('../api').BusStop} */ stop) => bayName(stop, stationName.value);
  return sortBays(platformStops.value, nameOf).map((stop) => {
    const name = nameOf(stop);
    const code = `Stop ${stop.stop_code || stop.stop_id}`;
    const routeIds = routesOf.get(stop.stop_id) ?? [];
    const routes = routeIds.length ? `${routeIds.length > 1 ? 'Routes' : 'Route'} ${routeIds.map(routeNumber).join(', ')}` : '';
    return {
      stop,
      title: name ?? code,
      subtitle: [name ? code : null, routes].filter(Boolean).join(' · '),
    };
  });
});

const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** @type {import('vue').Ref<HTMLElement | null>} */
const baysList = ref(null);
// a bay picked on the map, or from its heading, is brought into view
watch(() => bays.value.length && props.stop.stop_id, async (stopId) => {
  if (!stopId) return;
  await nextTick();
  if (bays.value[0]?.stop.stop_id === stopId) return;
  baysList.value?.querySelector(`[data-stop-id="${CSS.escape(stopId)}"]`)
    ?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' });
});

// --- switching an LRT station's direction slides the lists, following a swipe ---
const SETTLE_MS = 220;
// how far, as a share of the width, a swipe must go to switch on release
const COMMIT_SHARE = 0.25;
// or how fast, in px per ms, for a flick
const FLICK_SPEED = 0.4;
// a touch must move this far before it's known to be a swipe or a scroll
const AXIS_LOCK_PX = 8;

/** @type {import('vue').Ref<HTMLElement | null>} */
const viewport = ref(null);
// how far the lists are moved sideways, in px
const offset = ref(0);
// the other platform's side: 1 to the right, -1 to the left
const otherSide = ref(1);
// whether the other platform's list is drawn beside the stop's
const showOther = ref(false);
// whether the lists are animating to rest, rather than following a finger
const settling = ref(false);
/** @type {string | null} where the lists are sliding to, switched to once they're there */
let pendingStopId = null;
// set from switching until the new stop shows, so nothing resets the lists in between
let navigating = false;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let settleTimer;

const canSlide = computed(() => directionPlatforms.value && !!props.otherStop);

const width = () => viewport.value?.clientWidth || window.innerWidth;

/**
 * Slides the lists to rest: across to the other platform, or back.
 * @param {boolean} commit
 */
const settle = (commit) => {
  settling.value = true;
  pendingStopId = commit ? props.otherStop?.stop_id ?? null : null;
  const target = commit ? -otherSide.value * width() : 0;
  // nothing to animate when already there
  if (offset.value === target) onSettled();
  else offset.value = target;
  // in case the transition never ends, e.g. the tab was hidden
  clearTimeout(settleTimer);
  settleTimer = setTimeout(onSettled, SETTLE_MS + 100);
};

const onSettled = () => {
  if (!settling.value || navigating) return;
  clearTimeout(settleTimer);
  if (pendingStopId) {
    // the lists reset once the new stop is showing, in the watch below
    navigating = true;
    router.replace(`/stops/${encodeURIComponent(pendingStopId)}`);
    pendingStopId = null;
    return;
  }
  settling.value = false;
  showOther.value = false;
};

// the stop's own list now shows what slid in, so put everything back in place unseen
watch(() => props.stop.stop_id, () => {
  navigating = false;
  clearTimeout(settleTimer);
  settling.value = false;
  offset.value = 0;
  showOther.value = false;
});

/**
 * @param {string} stopId
 */
const switchPlatform = async (stopId) => {
  if (!stopId || stopId === props.stop.stop_id) return;
  if (!canSlide.value || reducedMotion || stopId !== props.otherStop?.stop_id) {
    router.replace(`/stops/${encodeURIComponent(stopId)}`);
    return;
  }
  // slides the way the toggle moves
  const ids = platforms.value.map((platform) => platform.stop_id);
  otherSide.value = ids.indexOf(stopId) > ids.indexOf(props.stop.stop_id) ? 1 : -1;
  showOther.value = true;
  await nextTick();
  // a frame with the other list in place first, so the slide animates
  requestAnimationFrame(() => settle(true));
};

/** @type {{x: number, y: number, time: number, axis: 'x' | 'y' | null} | null} */
let touch = null;

/** @param {TouchEvent} event */
const onTouchStart = (event) => {
  if (!canSlide.value || settling.value || event.touches.length !== 1) {
    touch = null;
    return;
  }
  touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, time: event.timeStamp, axis: null };
};

/** @param {TouchEvent} event */
const onTouchMove = (event) => {
  if (!touch) return;
  const dx = event.touches[0].clientX - touch.x;
  const dy = event.touches[0].clientY - touch.y;
  if (!touch.axis) {
    if (Math.abs(dx) < AXIS_LOCK_PX && Math.abs(dy) < AXIS_LOCK_PX) return;
    // a mostly downward drag is a scroll, and leaves the lists alone
    touch.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  if (touch.axis !== 'x') return;
  // with two directions the other one is on whichever side the finger pulls from
  otherSide.value = dx < 0 ? 1 : -1;
  showOther.value = true;
  offset.value = dx;
};

/** @param {TouchEvent} event */
const onTouchEnd = (event) => {
  if (!touch) return;
  const { axis, x, time } = touch;
  touch = null;
  if (axis !== 'x') return;
  const dx = (event.changedTouches[0]?.clientX ?? x) - x;
  const speed = Math.abs(dx) / Math.max(1, event.timeStamp - time);
  settle(Math.abs(dx) > width() * COMMIT_SHARE || (Math.abs(dx) > 40 && speed > FLICK_SPEED));
};
</script>

<template>
  <div class="stop-details">
    <div class="d-flex align-start pa-4">
      <div class="flex-grow-1">
        <!-- a transit centre lists every bay, so it's headed by the station -->
        <div class="text-title-large">
          {{ bays.length && stationName ? stationName : stop.stop_name }}
        </div>
        <div class="text-body-medium text-medium-emphasis">
          {{ bays.length ? `${bays.length} bays` : `Stop ${stop.stop_code || stop.stop_id}` }}
        </div>
      </div>
      <v-btn
        icon="mdi-close"
        variant="text"
        density="comfortable"
        aria-label="Close stop details"
        @click="$emit('close')"
      />
    </div>

    <!-- a transit centre's bays, each with its own buses -->
    <div v-if="bays.length" ref="baysList">
      <StationBay
        v-for="bay in bays"
        :key="bay.stop.stop_id"
        :data-stop-id="bay.stop.stop_id"
        :stop="bay.stop"
        :title="bay.title"
        :subtitle="bay.subtitle"
        :current="bay.stop.stop_id === stop.stop_id"
        :selected-bus-id="selectedBusId"
        :selected-bus-progress="selectedBusProgress"
        class="station-bay"
        @select="switchPlatform($event.stop_id)"
        @bus-click="$emit('bus-click', $event)"
        @route-groups="(stopId, groups) => $emit('bay-route-groups', stopId, groups)"
      />
    </div>

    <!-- an LRT station has a platform per direction -->
    <div v-else-if="directionPlatforms" class="px-4 pb-3">
      <v-btn-toggle
        :model-value="stop.stop_id"
        mandatory
        color="primary"
        variant="outlined"
        divided
        density="comfortable"
        class="platform-toggle"
        aria-label="Direction"
        @update:model-value="switchPlatform"
      >
        <v-btn
          v-for="platform in platforms"
          :key="platform.stop_id"
          :value="platform.stop_id"
          class="text-none"
        >
          <span class="text-truncate">{{ platformLabel(platform) }}</span>
        </v-btn>
      </v-btn-toggle>
    </div>

    <!-- the stop's list, with the other direction's beside it while swiping between them -->
    <div
      v-if="!bays.length"
      ref="viewport"
      class="swipe-viewport"
      :class="{ 'swipe-viewport--slidable': canSlide }"
      @touchstart.passive="onTouchStart"
      @touchmove.passive="onTouchMove"
      @touchend.passive="onTouchEnd"
      @touchcancel.passive="onTouchEnd"
    >
      <div
        class="swipe-track"
        :class="{ 'swipe-track--settling': settling }"
        :style="offset ? { transform: `translateX(${offset}px)` } : undefined"
        @transitionend.self="onSettled"
      >
        <StopArrivalsList
          :stop="stop"
          :route-groups="routeGroups"
          :is-loading="isLoading"
          :is-error="isError"
          :selected-bus-id="selectedBusId"
          :selected-bus-progress="selectedBusProgress"
          @bus-click="$emit('bus-click', $event)"
        />
        <StopArrivalsList
          v-if="showOther && otherStop"
          class="swipe-other"
          :style="{ left: `${otherSide * 100}%` }"
          :stop="otherStop"
          :route-groups="otherRouteGroups"
          :is-loading="otherIsLoading"
          aria-hidden="true"
          inert
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* room for the heading to scroll in under */
.station-bay {
  scroll-margin-top: 8px;
}

.station-bay + .station-bay {
  margin-top: 8px;
}

/* long headsigns share the width instead of pushing past the panel */
.platform-toggle {
  width: 100%;
}

.platform-toggle .v-btn {
  flex: 1 1 0;
  min-width: 0;
}

/* clips sideways only, so the cards' shadows and fades still show above and below */
.swipe-viewport {
  overflow-x: clip;
}

/* sideways drags are the page's, up and down still scrolls */
.swipe-viewport--slidable {
  touch-action: pan-y;
}

.swipe-track {
  position: relative;
}

.swipe-track--settling {
  transition: transform 220ms cubic-bezier(0.2, 0, 0, 1); /* SETTLE_MS */
}

.swipe-other {
  position: absolute;
  top: 0;
  width: 100%;
}
</style>
