import { nextTick } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import { routeNumber } from "../utils/routes";
import { pageTitle } from "../utils/pageTitle";
import { setNavigatingByHistory } from "../plugins/sharedMap";

const routes = [
  {
    path: "/",
    name: "Home",
    component: () => import("../views/HomePage.vue"),
  },
  {
    path: "/routes",
    name: "Routes",
    meta: { title: "Routes" },
    component: () => import("../views/RoutesPage.vue"),
  },
  {
    path: "/stops/:stopId?",
    name: "Stops",
    meta: { title: (route) => (route.params.stopId ? `Stop ${route.params.stopId}` : "Stops") },
    component: () => import("../views/StopsPage.vue"),
    props: true,
  },
  {
    path: "/electric",
    name: "Electric Buses",
    meta: { title: "Electric Bus Finder" },
    component: () => import("../views/BusFinderPage.vue"),
    props: { kind: "electric" },
  },
  {
    path: "/hydrogen",
    name: "Hydrogen Buses",
    meta: { title: "Hydrogen Bus Finder" },
    component: () => import("../views/BusFinderPage.vue"),
    props: { kind: "hydrogen" },
  },
  {
    path: "/electric-bus-stats",
    name: "Electric Bus Stats",
    meta: { title: "Electric Bus Stats" },
    component: () => import("../views/ElectricBusStatsPage.vue"),
  },
  {
    path: "/hydrogen-bus-stats",
    name: "Hydrogen Bus Stats",
    meta: { title: "Hydrogen Bus Stats" },
    component: () => import("../views/HydrogenBusStatsPage.vue"),
  },
  {
    path: "/about",
    name: "About",
    meta: { title: "About" },
    component: () => import("../views/AboutPage.vue"),
  },
  {
    path: "/routes/:routeId",
    name: "Route Details",
    meta: { title: (route) => `Route ${routeNumber(String(route.params.routeId))}` },
    component: () => import("../views/RouteDetailsPage.vue"),
    props: true,
  },
  {
    path: "/trips/:tripId",
    name: "Trip Details",
    meta: { title: (route) => `Trip ${route.params.tripId}` },
    component: () => import("../views/TripDetails.vue"),
    props: true,
  },
  {
    path: "/buses/:busId",
    name: "Bus Details",
    meta: { title: (route) => `Bus ${route.params.busId}` },
    component: () => import("../views/BusDetailsPage.vue"),
    props: true,
  },
  {
    path: "/status",
    name: "Status",
    meta: { title: "Status" },
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

// back and forward bring the map's open bus back; links and tabs open the map clean
router.options.history.listen((to, from, info) => setNavigatingByHistory(info.type === "pop"));
router.afterEach(() => {
  // after the new page has rendered
  nextTick(() => setNavigatingByHistory(false));
});

// the plain title for every page. pages that load a name, like a route's, refine it
// with usePageTitle
router.afterEach((to) => {
  const title = to.meta.title;
  document.title = pageTitle(typeof title === "function" ? title(to) : title);
});

export default router;
