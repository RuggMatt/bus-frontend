<script setup>
import NewBusMap from '../components/NewBusMap.vue';
import BusDetails from '../components/BusDetails.vue';
import { ref, watch } from 'vue';
import { useBusTrip } from '../composables/useBusTrip';
import { useDisplay } from 'vuetify';
import { useBuses } from '../composables/useBuses';
import { rememberedHomeView } from '../plugins/sharedMap';

const { mdAndUp } = useDisplay();
const { buses } = useBuses();

// coming back to the map reselects the bus the user left from, with its latest position
const restoreBusId = rememberedHomeView?.busId ?? null;
const restoredBus = restoreBusId === null
  ? null
  : buses.value?.find((candidate) => String(candidate.bus) === String(restoreBusId)) ?? null;

// opened from the start, so the map already has its final size when it flies back
const showBottomSheet = ref(Boolean(restoredBus) && !mdAndUp.value);
/** @type {import('vue').Ref<import('../api').Bus | null>} */
const bus = ref(restoredBus);

const { trip, isError } = useBusTrip(bus);

const showRouteNotFound = ref(false);
// getTrip resolves to null when the open data API has no matching trip
watch([trip, isError, bus], () => {
  showRouteNotFound.value = Boolean(bus.value) && (trip.value === null || isError.value);
})

// swipe down on the sheet to dismiss it; only when its content isn't scrolled down
const DISMISS_DISTANCE = 80;
const dragStartY = ref(null);
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
};

const onSheetTouchMove = (event) => {
  if (dragStartY.value === null) return;
  dragOffset.value = Math.max(0, event.touches[0].clientY - dragStartY.value);
};

const onSheetTouchEnd = () => {
  if (dragOffset.value > DISMISS_DISTANCE) {
    showBottomSheet.value = false;
  }
  dragStartY.value = null;
  dragOffset.value = 0;
};

const viewBusDetails = (clickedBus) => {
    bus.value = clickedBus;
    if (!mdAndUp.value) {
      showBottomSheet.value = Boolean(clickedBus);
    }
}
</script>
<template>
  <div class="home-layout">
    <!-- Desktop: Left Sidebar -->
    <div v-if="bus && mdAndUp" class="bus-details-panel">
      <VCard class="rounded-0 h-100">
        <BusDetails :bus="bus" />
      </VCard>
    </div>

    <!-- Full Screen Map -->
    <div class="map-container">
      <NewBusMap :restore-bus-id="restoredBus?.bus ?? null" @bus-details="viewBusDetails($event)" />
    </div>

    <!-- Mobile: Bottom Sheet -->
    <!-- non-modal so the map can still be panned and zoomed; tapping the map closes it -->
    <VBottomSheet
      v-model="showBottomSheet"
      :scrim="false"
      persistent
      no-click-animation
      :retain-focus="false"
      scroll-strategy="none"
    >
      <VCard
        class="rounded-t-lg"
        :class="{ 'sheet-dragging': dragStartY !== null }"
        :style="{ transform: dragOffset ? `translateY(${dragOffset}px)` : undefined }"
        @touchstart.passive="onSheetTouchStart"
        @touchmove.passive="onSheetTouchMove"
        @touchend="onSheetTouchEnd"
        @touchcancel="onSheetTouchEnd"
      >
        <BusDetails v-if="bus" :bus="bus" />
      </VCard>
    </VBottomSheet>

    <VSnackbar v-model="showRouteNotFound" location="bottom" :timeout="3000" color="error">
      Route could not be found
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
}
</style>
