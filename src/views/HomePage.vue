<script setup>
import NewBusMap from '../components/NewBusMap.vue';
import BusDetails from '../components/BusDetails.vue';
import { ref, watch } from 'vue';
import { useBusTrip } from '../composables/useBusTrip';
import { useDisplay } from 'vuetify';

const { mdAndUp } = useDisplay();
const showBottomSheet = ref(false);
/** @type {import('vue').Ref<import('../api').Bus | null>} */
const bus = ref(null);

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
      <NewBusMap @bus-details="viewBusDetails($event)" />
    </div>

    <!-- Mobile: Bottom Sheet -->
    <VBottomSheet v-model="showBottomSheet">
      <VCard width="360" class="mx-auto rounded-t-lg">
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
