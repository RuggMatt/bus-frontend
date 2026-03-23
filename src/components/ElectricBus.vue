<template>
  <v-container
    dark
    style="max-width: 450px; width: 100% position: relative; margin: 0 auto; padding: 0; overflow: hidden; max-height: 100vh"
  >
    <div
      id="map"
      style="height: 30vh; max-width: 100%; margin: 0; position: sticky; box-sizing: border-box;"
    />
    <v-list
      id="bus-list"
      dark
      max-width="450"
      style="height: 64vh; box-sizing: border-box; overflow: auto; margin: 0 auto;"
    >
      <v-list-item>
        <v-btn
          block
          small
          color="primary"
          :disabled="loading"
          @click="refresh"
        >
          {{ loading ? `REFRESHING` : 'REFRESH' }}
        </v-btn>
      </v-list-item>
      <template v-if="electricBuses.length && !(loading && firstTime)">
        <v-list-item-group v-model="active">
          <template v-for="bus in electricBuses" :key="bus.bus">
            <v-list-item :id="active == bus.bus ? 'active' : null" :value="bus.bus" dark>
              <v-list-item-content>
                <v-list-item-title>
                  <b>{{ bus.route.route_id }}</b>
                </v-list-item-title>
                <v-list-item-subtitle>{{ bus.route?.trip_headsign }} - {{ bus.bus }}</v-list-item-subtitle>
              </v-list-item-content>
              <v-list-item-action>
                <v-list-item-action-text style="text-align: center;">
                  <span style="font-size: 2em;">{{ Number(bus.dist/0.005).toFixed(0) }}</span>
                  <br>min.
                </v-list-item-action-text>
              </v-list-item-action>
            </v-list-item>
          </template>
        </v-list-item-group>
      </template>
      <v-list-item v-else-if="loading">
        Loading...
      </v-list-item>
      <v-list-item v-else>
        No Electric Buses
      </v-list-item>
    </v-list>
    <v-footer dark style="height: 6vh;">
      <div style="width: 100%; text-align: center;">
        A project by
        <a style="color: white;" href="https://github.com/mattschlosser">Matt Schlosser</a>
      </div>
    </v-footer>
  </v-container>
</template>
<script>
// import { marker } from 'leaflet';
import { getElectricBuses } from '../api';

/* globals google */
let map;

// window.initMap = async () => {
//   map = new google.maps.Map(document.getElementById("map"), {
//     center: { lat, lng },
//     zoom: 10,
//     zoomControl: false,
//     streetViewControl: false,
//     mapTypeControl: false,
//     fullscreenControl: false,
//     styles: [
//       {
//         elementType: "geometry",
//         stylers: [
//           {
//             color: "#212121",
//           },
//         ],
//       },
//       {
//         elementType: "labels.icon",
//         stylers: [
//           {
//             visibility: "off",
//           },
//         ],
//       },
//       {
//         elementType: "labels.text.fill",
//         stylers: [
//           {
//             color: "#757575",
//           },
//         ],
//       },
//       {
//         elementType: "labels.text.stroke",
//         stylers: [
//           {
//             color: "#212121",
//           },
//         ],
//       },
//       {
//         featureType: "administrative",
//         elementType: "geometry",
//         stylers: [
//           {
//             color: "#757575",
//           },
//         ],
//       },
//       {
//         featureType: "administrative.country",
//         elementType: "labels.text.fill",
//         stylers: [
//           {
//             color: "#9e9e9e",
//           },
//         ],
//       },
//       {
//         featureType: "administrative.land_parcel",
//         stylers: [
//           {
//             visibility: "off",
//           },
//         ],
//       },
//       {
//         featureType: "administrative.locality",
//         elementType: "labels.text.fill",
//         stylers: [
//           {
//             color: "#bdbdbd",
//           },
//         ],
//       },
//       {
//         featureType: "poi",
//         elementType: "labels.text.fill",
//         stylers: [
//           {
//             color: "#757575",
//           },
//         ],
//       },
//       {
//         featureType: "poi.park",
//         elementType: "geometry",
//         stylers: [
//           {
//             color: "#181818",
//           },
//         ],
//       },
//       {
//         featureType: "poi.park",
//         elementType: "labels.text.fill",
//         stylers: [
//           {
//             color: "#616161",
//           },
//         ],
//       },
//       {
//         featureType: "poi.park",
//         elementType: "labels.text.stroke",
//         stylers: [
//           {
//             color: "#1b1b1b",
//           },
//         ],
//       },
//       {
//         featureType: "road",
//         elementType: "geometry.fill",
//         stylers: [
//           {
//             color: "#2c2c2c",
//           },
//         ],
//       },
//       {
//         featureType: "road",
//         elementType: "labels.text.fill",
//         stylers: [
//           {
//             color: "#8a8a8a",
//           },
//         ],
//       },
//       {
//         featureType: "road.arterial",
//         elementType: "geometry",
//         stylers: [
//           {
//             color: "#373737",
//           },
//         ],
//       },
//       {
//         featureType: "road.highway",
//         elementType: "geometry",
//         stylers: [
//           {
//             color: "#3c3c3c",
//           },
//         ],
//       },
//       {
//         featureType: "road.highway.controlled_access",
//         elementType: "geometry",
//         stylers: [
//           {
//             color: "#4e4e4e",
//           },
//         ],
//       },
//       {
//         featureType: "road.local",
//         elementType: "labels.text.fill",
//         stylers: [
//           {
//             color: "#616161",
//           },
//         ],
//       },
//       {
//         featureType: "transit",
//         elementType: "labels.text.fill",
//         stylers: [
//           {
//             color: "#757575",
//           },
//         ],
//       },
//       {
//         featureType: "water",
//         elementType: "geometry",
//         stylers: [
//           {
//             color: "#000000",
//           },
//         ],
//       },
//       {
//         featureType: "water",
//         elementType: "labels.text.fill",
//         stylers: [
//           {
//             color: "#3d3d3d",
//           },
//         ],
//       },
//     ],
//   });
// };
const REFRESH_INTERVAL = 60000; // 1 minute
// import goTo from 'vuetify/es5/services';
export default {
  data() {
    return {
      buses: [],
      window,
      map: null,
      loading: false,
      markers: [],
      active: null,
      firstTime: true,
      lat:  53.5212,
      lng: -113.5213,
      i: null, // holder for timer interval
      locating: false,
    };
  },
  computed: {
    electricBuses() {
      return this.buses.filter((e) => e.bus >= 8000);
    },
  },
  watch: {
    active(val) {
      if (val) {
        let bus = this.buses.find(bus => bus.bus == val);
        this.listClickHandler(bus);
      }
    }
  },
  created() {
    // get a list of electric busses
    this.refresh();
    this.i = setInterval(() => this.refresh(), REFRESH_INTERVAL);
  },
  unmounted() {
    document.querySelector('#google-maps')?.remove()
    clearInterval(this.i);
  },
  methods: {
    /**
     * Gets the users location
     */
    async updateUserLocation() {
      this.locating = true;
      await new Promise((res) => {
        // ask for location
        navigator.geolocation.getCurrentPosition(
          // user granted permission
          (locale) => {
            console.log("Permission read")
            this.lat = locale.coords.latitude;
            this.lng = locale.coords.longitude;
            res();
          },
          // user denies permission
          () => res()
        );
      });
      this.locating = false;
    }, 
    updateMarkers(buses) {
      // mark each marker as not updated
      Object.keys(this.markers).forEach(
        (key) => (this.markers[key].updated = false)
      );
      // update each marker that exists
      buses.forEach(({ lat, long: lng, bus }) => {
        if (this.active == bus) {
          map.setCenter({ lat, lng });
        }
        let marker = this.markers[bus];
        if (marker) {
          marker.setPosition({ lat, lng });
          marker.updated = true;
        } else {
          marker = new google.maps.Marker({
            position: { lat, lng },
            map,
          });
          marker.bus = bus;
          marker.addListener('click', () => {
            this.active = bus
            this.$nextTick(() =>
              this.$vuetify.goTo('#active', {container: '#bus-list'})
            )
          });
          marker.updated = true;
          this.markers[bus] = marker;
        }
      });
      // remove the markers that were not updated
      Object.keys(this.markers).forEach((key) => {
        let marker = this.markers[key];
        if (!marker.updated) {
          marker.setMap(null);
          delete this.markers[key];
        }
      });
    }, 
    async refresh() {
      this.loading = true;
      try {
        // make sure the map has loaded
  
        const buses = await getElectricBuses();
        await Promise.all(
          buses
            .map(async (bus) => {
              bus.route = await this.route(bus.trip);
              // simple calculation to determine distance of bus from user's location
              return bus;
            })
        )
        this.buses = buses;
        this.refreshLocation();
      } finally {
        this.loading = false;
        if (this.active) {
          this.$vuetify.goTo('#active', {container: '#bus-list'});
        }
      }
    },
    async refreshLocation() {
      await this.updateUserLocation();
      await this.sortBuses();
    },
    async sortBuses() {
      if (this.lat === null || this.lng === null) {
        return;
      }
      this.buses.forEach(bus => {
        bus.dist = Math.sqrt(
          (this.lat - bus.lat) ** 2 + (this.lng - bus.long) ** 2
        );
      })
      this.buses.sort(({ dist: a }, { dist: b }) => a - b);
    },
    async route(trip) {
      let result = await fetch(
        `https://data.edmonton.ca/resource/ctwr-tvrd.json?trip_id=${trip}`,
        {
          headers: {
            "Accept": "application/json",
            "X-App-Token": import.meta.env.VITE_APP_SODA_APP_TOKEN
          }
        }
      )
      if (result.ok) {
        let trips = result.json();
        return trips[0];
      }
      return null;
    },
    listClickHandler(item) {
      this.active = item.bus;
      map.setCenter({ lat: item.lat, lng: item.long });
      map.setZoom(16);
    },
  },
};
</script>