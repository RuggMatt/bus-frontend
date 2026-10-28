<script setup>
import NewBusMap from '../components/NewBusMap.vue';
import BusDetails from '../components/BusDetails.vue';
import TimeTravelChip from '../components/TimeTravelChip.vue';
import MapSearch from '../components/MapSearch.vue';
import StopPanel from '../components/StopPanel.vue';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useBusTrip } from '../composables/useBusTrip';
import { useDisplay } from 'vuetify';
import { useMapBuses } from '../composables/useBuses';
import { navigatingByHistory, rememberedHomeView } from '../plugins/sharedMap';
import { parseTravelTime } from '../utils/timeTravel';

const props = defineProps({
  // /stops/:stopId opens the stop's upcoming buses over the same map
  stopId: {
    type: String,
    default: null,
  },
});

const { mdAndUp } = useDisplay();
const route = useRoute();
const router = useRouter();

// time travel: the time in ?at=, so going back to the map comes back to it too
const at = computed({
  get: () => (parseTravelTime(route.query.at) ? /** @type {string} */ (route.query.at) : null),
  set: (value) => {
    const { at: _old, ...query } = route.query;
    // replaced rather than pushed, so stepping through times doesn't fill the history
    router.replace({ query: value ? { ...query, at: value } : query });
  },
});
const { buses, loading: loadingBuses, isError: busesError } = useMapBuses(at);

// nothing was recorded then, e.g. before collection started or in an outage
const showNoBuses = ref(false);
watch(buses, (shown) => {
  showNoBuses.value = Boolean(at.value) && Array.isArray(shown) && shown.length === 0;
});

// going back to the map (not opening it from a tab or link) reselects the bus the user left from, with its latest position
const restoreBusId = navigatingByHistory ? rememberedHomeView?.busId ?? null : null;
const restoredBus = restoreBusId === null
  ? null
  : buses.value?.find((candidate) => String(candidate.bus) === String(restoreBusId)) ?? null;

/** @type {import('vue').Ref<import('../api').Bus | null>} */
const bus = ref(restoredBus);
// on a phone the bus or stop opens in a sheet, from the start when restored so the map
// already has its final size when it flies back
const showBottomSheet = computed(() => !mdAndUp.value && Boolean(bus.value || props.stopId));

const { trip, isError } = useBusTrip(bus, { pastPosition: () => Boolean(at.value) });

const showRouteNotFound = ref(false);
// getTrip resolves to null when the open data API has no matching trip
watch([trip, isError, bus], () => {
  showRouteNotFound.value = Boolean(bus.value) && (trip.value === null || isError.value);
})

// swipe down on the sheet to dismiss it; only when its content isn't scrolled down
const DISMISS_DISTANCE = 80;
const dragStartY = ref(null);
const dragStartX = ref(0);
const dragOffset = ref(0);

const scrolledAncestor = (el, stop) => {
  for (let node = el; node && node !== stop; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return stop.scrollTop > 0;
};

const onSheetTouchStart = (event) => {
  dragStartY.value = scrolledAncestor(event.target, event.currentTarget)
    ? null
    : event.touches[0].clientY;
  dragStartX.value = event.touches[0].clientX;
};

const onSheetTouchMove = (event) => {
  if (dragStartY.value === null) return;
  const dy = event.touches[0].clientY - dragStartY.value;
  // a sideways swipe is the stop panel's, between an LRT station's directions
  if (!dragOffset.value && Math.abs(event.touches[0].clientX - dragStartX.value) > Math.abs(dy)) {
    dragStartY.value = null;
    return;
  }
  dragOffset.value = Math.max(0, dy);
  // the drag is the sheet's, so Chrome mustn't take it as pull to refresh
  if (dragOffset.value > 0 && event.cancelable) event.preventDefault();
};

// and with the sheet open, the page itself doesn't pull to refresh either, in case a
// drag starts outside the sheet's handlers
const setPullToRefresh = (enabled) => {
  document.documentElement.style.overscrollBehaviorY = enabled ? '' : 'none';
};
watch(showBottomSheet, (open) => setPullToRefresh(!open), { immediate: true });
onBeforeUnmount(() => setPullToRefresh(true));

const onSheetTouchEnd = () => {
  if (dragOffset.value > DISMISS_DISTANCE) {
    closeSelection();
  }
  dragStartY.value = null;
  dragOffset.value = 0;
};

/** @type {import('vue').Ref<{clearSelection: () => void, showPoint: (lat: number, lng: number) => void} | null>} */
const busMap = ref(null);

// --- a stop, opened from the map or the search ---
/** @type {import('vue').Ref<(string | number)[] | null>} the buses on their way to the open stop */
const stopBusIds = ref(null);
/** @type {import('vue').Ref<string | number | null>} a bus picked in the stop's list */
const stopBusId = ref(null);
watch(() => props.stopId, () => {
  stopBusIds.value = null;
  stopBusId.value = null;
});

/** @param {import('../api').BusStop} stop */
const openStop = (stop) => {
  // the map lets go of the bus, so its route line goes and the stop's buses show
  if (bus.value) busMap.value?.clearSelection();
  if (stop.stop_id !== props.stopId) router.push(`/stops/${encodeURIComponent(stop.stop_id)}`);
};

const closeStop = () => {
  if (props.stopId) router.push('/');
};

/** @param {import('../composables/useStopArrivals').StopBus | null} stopBus */
const showStopBus = (stopBus) => {
  stopBusId.value = stopBus?.bus ?? null;
  if (stopBus) busMap.value?.showPoint(stopBus.lat, stopBus.long);
};

// however the sheet closes (swiped away included), the map lets go of the bus, so its
// route line goes and every bus shows again
const closeSelection = () => {
  if (bus.value) busMap.value?.clearSelection();
  else closeStop();
};

// how tall the open sheet is, so the map can fit the bus's route above it
const sheetCard = ref(null);
const sheetHeight = ref(0);
const sheetObserver = new ResizeObserver(([entry]) => {
  sheetHeight.value = entry.target.getBoundingClientRect().height;
});
watch(() => sheetCard.value?.$el, (el, oldEl) => {
  if (oldEl) sheetObserver.unobserve(oldEl);
  if (el) sheetObserver.observe(el);
});
onBeforeUnmount(() => sheetObserver.disconnect());

const viewBusDetails = (clickedBus) => {
    bus.value = clickedBus;
    // a bus and a stop don't share the panel
    if (clickedBus) closeStop();
}
</script>
<template>
  <div class="home-layout">
    <!-- Desktop: Left Sidebar -->
    <div v-if="(bus || stopId) && mdAndUp" class="bus-details-panel">
      <VCard class="rounded-0 h-100">
        <BusDetails v-if="bus" :bus="bus" :past="Boolean(at)" />
        <StopPanel
          v-else
          :stop-id="stopId"
          @close="closeStop"
          @buses="stopBusIds = $event"
          @select-bus="showStopBus"
        />
      </VCard>
    </div>

    <!-- Full Screen Map -->
    <div class="map-container">
      <NewBusMap
        ref="busMap"
        :restore-bus-id="restoredBus?.bus ?? null"
        :bottom-inset="showBottomSheet ? sheetHeight : 0"
        :at="at"
        :stop-id="bus ? null : stopId"
        :stop-bus-ids="stopId && !bus ? stopBusIds : null"
        :highlight-bus-id="stopId && !bus ? stopBusId : null"
        @bus-details="viewBusDetails($event)"
        @stop-click="openStop"
        @map-click="closeStop"
      />
      <div class="map-top">
        <MapSearch class="map-search" @select-stop="openStop" />
        <TimeTravelChip v-model="at" :loading="loadingBuses" />
      </div>
    </div>

    <!-- Mobile: Bottom Sheet -->
    <!-- non-modal so the map can still be panned and zoomed; tapping the map closes it -->
    <VBottomSheet
      :model-value="showBottomSheet"
      :scrim="false"
      persistent
      no-click-animation
      :retain-focus="false"
      scroll-strategy="none"
    >
      <VCard
        ref="sheetCard"
        class="rounded-t-lg"
        :class="{ 'sheet-dragging': dragStartY !== null }"
        :style="{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }"
        @touchstart.passive="onSheetTouchStart"
        @touchmove="onSheetTouchMove"
        @touchend="onSheetTouchEnd"
        @touchcancel="onSheetTouchEnd"
      >
        <div class="sheet-content">
          <BusDetails v-if="bus" :bus="bus" :past="Boolean(at)" />
          <StopPanel
            v-else-if="stopId && !mdAndUp"
            :stop-id="stopId"
            @close="closeStop"
            @buses="stopBusIds = $event"
            @select-bus="showStopBus"
          />
        </div>
      </VCard>
    </VBottomSheet>

    <VSnackbar v-model="showRouteNotFound" location="bottom" :timeout="3000" color="error">
      Route could not be found
    </VSnackbar>
    <VSnackbar v-model="showNoBuses" location="bottom" :timeout="4000">
      No buses were recorded at that time
    </VSnackbar>
    <VSnackbar :model-value="busesError" location="bottom" :timeout="-1" color="error">
      The buses for that time could not be loaded
    </VSnackbar>
  </div>
</template>

<style scoped>
.sheet-dragging {
  transition: none;
}

.home-layout {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.bus-details-panel {
  width: 360px;
  border-right: 1px solid rgba(0, 0, 0, 0.12);
  overflow-y: auto;
  flex-shrink: 0;
}

.bus-details-panel :deep(.v-card) {
  border-radius: 0;
}

.map-container {
  flex: 1;
  min-width: 0;
  height: 100%;
  position: relative;
}

/* the search and time travel, clear of leaflet's zoom buttons in the top left */
.map-top {
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  gap: 8px;
  left: 56px;
  pointer-events: none;
  position: absolute;
  right: 12px;
  top: 10px;
  z-index: 1;
}

.map-top > * {
  pointer-events: auto;
}

.map-search {
  max-width: 360px;
  width: 100%;
}

/* a stop's list can be long, so it scrolls inside the sheet and leaves the map in view */
.sheet-content {
  max-height: 60dvh;
  overflow-y: auto;
}
</style>
