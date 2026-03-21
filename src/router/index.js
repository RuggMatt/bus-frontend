import ElectricBusStatsPage from '../views/ElectricBusStatsPage.vue';
import HydrogenBusStatsPage from '../views/HydrogenBusStatsPage.vue';
import HydrogenBus from '../components/HydrogenBus.vue';
import { createRouter, createWebHistory } from 'vue-router'
import Home from '../components/HelloWorld.vue'
import Electric from '../components/ElectricBus.vue'
import HomePage from "../views/HomePage.vue";

const routes = [
  {
    path: '/',
    name: 'Home',
    component: HomePage
  },
  {
    path: '/old',
    name: "old",
    component: Home
  },
  {
    path: '/electric',
    name: 'Electric Buses',
    component: Electric
  },
  {
    path: '/hydrogen',
    name: 'Hydrogen Buses',
    component: HydrogenBus
  },
  {
    path: '/electric-bus-stats',
    name: 'Electric Bus Stats',
    component: ElectricBusStatsPage
  },
  {
    path: '/hydrogen-bus-stats',
    name: 'Hydrogen Bus Stats',
    component: HydrogenBusStatsPage
  },
  {
    path: '/about',
    name: 'About',
    // route level code-splitting
    // this generates a separate chunk (about.[hash].js) for this route
    // which is lazy-loaded when the route is visited.
    component: () => import(/* webpackChunkName: "about" */ '../views/AboutPage.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router
