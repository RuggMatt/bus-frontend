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
      <VCard class="rounded-t-lg">
        <BusDetails v-if="bus" :bus="bus" />
      </VCard>
    </VBottomSheet>

    <VSnackbar v-model="showRouteNotFound" location="bottom" :timeout="3000" color="error">
      Route could not be found
    </VSnackbar>
  </div>
</template>

<style scoped>
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
