<script setup>
import NewBusMap from '../components/NewBusMap.vue';
import { ref } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { getTrip } from '../api';
import { useDisplay } from 'vuetify';

const { mdAndUp } = useDisplay();
const showBottomSheet = ref(false);
/** @type {{bus: number, id: number, heading: number, speed: number}} */
const bus = ref(null);

const { data: trip } = useQuery({
  queryKey: ['buses', bus],
  queryFn: () => bus.value ? getTrip(bus.value.trip) : []
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
        <VCardTitle>
          {{ bus.bus }}
        </VCardTitle>
        <VCardSubtitle>
          {{ trip?.trip_headsign }}
        </VCardSubtitle>
        <VCardText>
          On Time<br>
          <b>{{ Math.round(bus.speed * 3.6) }}</b> km/h
        </VCardText>
        <VCardActions>
          <VBtn v-if="trip" :to="`/trips/${trip.trip_id}`">
            View Trip Details
          </VBtn>
        </VCardActions>
      </VCard>
    </div>

    <!-- Full Screen Map -->
    <div class="map-container">
      <NewBusMap @bus-details="viewBusDetails($event)" />
    </div>

    <!-- Mobile: Bottom Sheet -->
    <VBottomSheet v-model="showBottomSheet">
      <VCard width="360" class="mx-auto rounded-t-lg">
        <VCardTitle>
          {{ bus?.bus }}
        </VCardTitle>
        <VCardSubtitle>
          {{ trip?.trip_headsign }}
        </VCardSubtitle>
        <VCardText>
          On Time<br>
          <b>{{ Math.round(bus?.speed * 3.6) }}</b> km/h
        </VCardText>
        <VCardActions>
          <VBtn v-if="trip" :to="`/trips/${trip.trip_id}`">
            View Trip Details
          </VBtn>
        </VCardActions>
      </VCard>
    </VBottomSheet>
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
