import { createRouter, createWebHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/HomePage.vue"),
  },
  {
    path: "/routes",
    name: "Routes",
    component: () => import("../views/RoutesPage.vue"),
  },
  {
    path: "/stops/:stopId?",
    name: "Stops",
    component: () => import("../views/StopsPage.vue"),
    props: true,
  },
  {
    path: "/electric",
    name: "Electric Buses",
    component: () => import("../views/BusFinderPage.vue"),
    props: { kind: "electric" },
  },
  {
    path: "/hydrogen",
    name: "Hydrogen Buses",
    component: () => import("../views/BusFinderPage.vue"),
    props: { kind: "hydrogen" },
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
    component: () => import("../views/AboutPage.vue"),
  },
  {
    path: "/routes/:routeId",
    name: "Route Details",
    component: () => import("../views/RouteDetailsPage.vue"),
    props: true,
  },
  {
    path: "/trips/:tripId",
    name: "Trip Details",
    component: () => import("../views/TripDetails.vue"),
    props: true,
  },
  {
    path: "/buses/:busId",
    name: "Bus Details",
    component: () => import("../views/BusDetailsPage.vue"),
    props: true,
  },
  {
    path: "/status",
    name: "Status",
    component: () => import("../views/StatusPage.vue"),
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
  // new pages start at the top, so the map is in view for the view transition.
  // back and forward return to where the page was, and query changes (a route's
  // direction, a bus's week) don't move it
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition;
    if (to.path === from.path) return false;
    return { top: 0 };
  },
});

export default router;
