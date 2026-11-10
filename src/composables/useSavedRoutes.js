// @ts-check
import { readonly } from "vue";
import { createSavedStore } from "./savedStore";
import { SAVED_ROUTES_KEY, parseSavedRoutes, toggleSavedRoute } from "../utils/savedRoutes";

const store = createSavedStore(SAVED_ROUTES_KEY, parseSavedRoutes);

/**
 * The routes the rider starred, kept in this browser only and shared by every component.
 */
export const useSavedRoutes = () => {
  /** @param {string} routeId */
  const isSaved = (routeId) => store.list.value.some((route) => route.id === routeId);

  /**
   * @param {string} routeId
   * @param {string} [name] the route's long name
   */
  const toggle = (routeId, name = "") => store.write(toggleSavedRoute(store.list.value, { id: routeId, name }));

  return { savedRoutes: readonly(store.list), isSaved, toggle };
};
