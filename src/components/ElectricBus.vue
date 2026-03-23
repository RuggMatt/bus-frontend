<template>
  <v-container
    dark
    style="max-width: 450px; width: 100% position: relative; margin: 0 auto; padding: 0; overflow: hidden; max-height: 100vh"
  >
    <div
      id="map"
      style="height: 30vh; max-width: 100%; margin: 0; position: sticky; box-sizing: border-box;"
    >
      <map-only ref="map" :buses="electricBuses" />
    </div>
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
            <v-list-item :id="active == bus.bus ? 'active' : null" :value="bus.bus" dark @click="listClickHandler(bus)">
              <v-list-item-title>
                <b>{{ bus.route?.trip_headsign }} - {{ bus.bus }}</b>
              </v-list-item-title>
              <v-list-item-action>
                <span style="font-size: 2em;">{{ Number(bus.dist/0.005).toFixed(0) }} min.</span>
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
import MapOnly from './MapOnly.vue';

/* globals google */
let map;
const REFRESH_INTERVAL = 60000; // 1 minute
// import goTo from 'vuetify/es5/services';
export default {
  components: {
    MapOnly,
  },
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
        this.buses = this.sortBuses(buses);
        this.refreshLocation();
      } finally {
        this.loading = false;
      }
    },
    async refreshLocation() {
      await this.updateUserLocation();
      this.buses = this.sortBuses(this.buses);
    },
    sortBuses(buses) {
      if (this.lat === null || this.lng === null) {
        return;
      }
      buses.forEach(bus => {
        bus.dist = Math.sqrt(
          (this.lat - bus.lat) ** 2 + (this.lng - bus.long) ** 2
        );
      })
      buses.sort(({ dist: a }, { dist: b }) => a - b);
      return buses;
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
        let trips = await result.json();
        return trips[0];
      }
      return null;
    },
    listClickHandler(item) {
      this.active = item.bus;
      this.$refs.map.centerOnBus(item);
    },
  },
};
</script>