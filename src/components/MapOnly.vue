<script setup>
import 'leaflet/dist/leaflet';
import 'leaflet';
import '../plugins/AnimatedMarker';
import electric from '../assets/elec.png'
import logo from '../assets/bus.png'
import { onMounted, watch } from 'vue';

// import 'leaflet/dist/leaflet.css'
const props = defineProps({
    buses: {
        type: Array,
        required: true,
    },
});

const LeafIcon = L.Icon.extend({
    options: {
        iconSize:     [25, 25],
    }
})
const elec = new LeafIcon({
    iconUrl: electric
})
const icon = new LeafIcon({
    iconUrl: logo
});
let map = null

const createMap = () => {
    console.log("creating map");
    console.log(L);
    map = L.map('test', {
        center: [53.5150, -113.4757],
        zoom: 12,
    });
    L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}/?{accessToken}', {
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        maxZoom: 18,
        minZoom: 10,
        bounds: [[53.6, -113.7], [53.33, -113.3]],
        id: 'mapbox/streets-v11',
        tileSize: 512,
        zoomOffset: -1,
        accessToken: `access_token=${import.meta.env.VITE_APP_MAPBOX_ACCESS_TOKEN}`
    }).addTo(map)
}

const cachedBuses = {};


const centerOnBus = (bus) => {
    console.log("centering on bus", bus);
    map.setView([bus.lat, bus.long], 15);
}

defineExpose({
    centerOnBus,
})

/**
 * Given a list of new buses, removes the buses from the map that are no longer 
 * returned by the API
 * 
 * @param {{bus: string}[]} newBuses 
 */
const removeOldBuses = (newBuses) => {
    // create hash map for faster searching
    const newBusHashMap = newBuses.reduce((acc, bus) => {
        acc[bus.bus] = true;
        return acc;
    }, /** @type {Record<string, true>} */ ({}));
    // remove old buses
    for (const index in cachedBuses) {
        if (!(index in newBusHashMap)) {
            cachedBuses[index].remove();
            delete cachedBuses[index];
        }
    }
}

const updateBuses = () => {
    removeOldBuses(props.buses);
    for (let bus of props.buses) {
        // add new ones
        if (cachedBuses[bus.bus]) {
            // bus already in list
            let prev = cachedBuses[bus.bus];
            let line = L.polyline([prev.getLatLng(), [bus.lat, bus.long]])
            prev.remove();
            let newMarker = L.animatedMarker(line.getLatLngs(), {title: bus.bus, icon: bus.bus >= 8000 ? elec : icon}).addTo(map)
            // newMarker.on("click", () => handleBusClick(bus));
            cachedBuses[bus.bus] = newMarker;
        } else {
            // bus not in list
            let marker = L.marker([bus.lat, bus.long], {title: bus.bus, icon: bus.bus >= 8000 ? elec : icon}).addTo(map)
            // marker.on("click", () => handleBusClick(bus))
            cachedBuses[bus.bus] = marker;
        }
    }
}

onMounted(() => {
    createMap();
});

watch(() => props.buses, () => {
    updateBuses();
}, {immediate: true})
</script>
<template>
  <div class="h-100">
    <div id="test" class="map h-100" />
  </div>
</template>
<style scoped>
.h-100 {
    height: 100%;
}
</style>