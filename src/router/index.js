import { createRouter, createWebHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/HomePage.vue"),
  },
  {
    path: "/old",
    name: "old",
    component: () => import("../components/HelloWorld.vue"),
  },
  {
    path: "/electric",
    name: "Electric Buses",
    component: () => import("../components/ElectricBus.vue"),
  },
  {
    path: "/hydrogen",
    name: "Hydrogen Buses",
    component: () => import("../components/HydrogenBus.vue"),
  },
  {
    path: "/electric-bus-stats",
    name: "Electric Bus Stats",
    component: () => import("../views/ElectricBusStatsPage.vue"),
  },
  {
    path: "/hydrogen-bus-stats",
    name: "Hydrogen Bus Stats",
    component: () => import("../views/HydrogenBusStatsPage.vue"),
  },
  {
    path: "/about",
    name: "About",
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () =>
      import(/* webpackChunkName: "about" */ "../views/AboutPage.vue"),
  },
  {
    path: "/trips/:tripId",
    name: "Trip Details",
    component: () => import("../views/TripDetails.vue"),
    props: true,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;
