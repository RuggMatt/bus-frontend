<script setup>
// @ts-check
import { useQuery } from '@tanstack/vue-query';
import { getRecentTripData, getTrip, getBusStopTimes } from '../api';
import { useStops } from '../composables/useStops';
import { computed } from 'vue';

const props = defineProps({
    tripId: {
        type: [String, Number],
        required: true,
    }
})

const { keyedStops } = useStops();

const { data, error, isLoading } = useQuery({
    queryKey: ['trip', props.tripId],
    queryFn: () => getRecentTripData(props.tripId),
    enabled: !!props.tripId,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
})

const { data: tripData } = useQuery({
    queryKey: ['trip-data', props.tripId],
    queryFn: () => getTrip(props.tripId),
    enabled: !!props.tripId,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
})

// route data is a list of stops along this trip
const { data: routeData } = useQuery({
    queryKey: ['route-data', props.tripId],
    queryFn: () => getBusStopTimes(props.tripId),
    enabled: () => !!props.tripId,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
})

const groupedTripData = computed(() => {
    if (!data.value) return [];
    /** @type {typeof data.value[number][][]} */
    const groups = [];
    // Group data points by 30-minute gaps in timestamp
    /** @type {Array<typeof data.value[number]>} */
    let currentGroup = [];
    let lastTimestamp = null;
    for (const datum of data.value) {
        if (
            lastTimestamp === null ||
            Math.abs(datum.timestamp - lastTimestamp) > 1800 // 30 minutes in seconds
        ) {
            if (currentGroup.length > 0) {
                groups.push(currentGroup);
            }
            currentGroup = [datum];
        } else {
            currentGroup.push(datum);
        }
        lastTimestamp = datum.timestamp;
    }
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    return groups;
})

/**
 * Converts a HH:MM:SS 24-hour time string to a readable 12-hour format (e.g. "7:32 PM")
 * @param {string} time
 * @returns {string}
 */
function formatTime(time) {
    if (!time) return ''
    const [hourStr, minuteStr] = time.split(':')
    let hour = parseInt(hourStr, 10)
    const minute = minuteStr
    const ampm = hour >= 12 ? 'PM' : 'AM'
    hour = hour % 12 || 12
    return `${hour}:${minute} ${ampm}`
}

/**
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 */
const distance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3; // metres
    const φ1 = lat1 * Math.PI/180; // φ, λ in radians
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; // in metres
}

/**
 * Estimates the actual arrival time for a given stop.
 * @param {string} stopId
 * @returns {number | null} Unix epoch time in seconds
 */
function estimatedActualArrivalTime(stopId) {
    const stop = keyedStops.value?.[stopId];
    if (!stop) {
        return null;
    }
    if (!data.value || data.value.length === 0) {
        return null;
    }
    const groupedData = groupedTripData.value?.slice(-1)[0];
    if (!groupedData || groupedData.length === 0) {
        return null;
    }
    console.log(groupedData);
    let maxEstimateDistance = 1000; // meters
    let nearestData = groupedData[0];
    let nearestDistance = distance(stop.stop_lat, stop.stop_lon, nearestData.lat, nearestData.long);
    for (const datum of groupedData) {
        const datumDistance = distance(stop.stop_lat, stop.stop_lon, datum.lat, datum.long);
        if (datumDistance < nearestDistance) {
            nearestData = datum;
            nearestDistance = datumDistance;
        }
    }
    if (nearestDistance > maxEstimateDistance) {
        return null;
    }
    return nearestData.timestamp;
}

/**
 *
 *
 */
function formatSubtitle(stop) {
    const scheduledTime = formatTime(stop.arrival_time_fixed);
    const estimatedActualTime = convertUnixEpochToTime(estimatedActualArrivalTime(stop.stop_id));
    if (estimatedActualTime === null) {
        return scheduledTime;
    }
    return `${scheduledTime} (Estimated Actual: ${estimatedActualTime || 'N/A'})`;
}

/**
 * @param {number|null} unixEpoch
 * @returns {string|null}
 */
function convertUnixEpochToTime(unixEpoch) {
    if (!unixEpoch) return null;
    const date = new Date(unixEpoch * 1000);
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}


</script>
<template>
  <v-container>
    <div v-if="isLoading">
      Loading...
    </div>
    <div v-else-if="error">
      Error: {{ error.message }}
    </div>
    <div v-else>
      <h1>Trip Details for Trip ID: {{ props.tripId }}</h1>
      <p><strong>Route:</strong> {{ tripData?.trip_headsign }}</p>
      <v-list class="mt-3">
        <v-list-item
          v-for="stop in routeData"
          :key="stop.stop_id"
          :title="keyedStops[stop.stop_id]?.stop_name || stop.stop_id"
          :subtitle="formatSubtitle(stop)"
          prepend-icon="mdi-bus-stop"
        />
      </v-list>
    </div>
  </v-container>
</template>