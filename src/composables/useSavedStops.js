// @ts-check
import { readonly } from "vue";
import { createSavedStore } from "./savedStore";
import { SAVED_STOPS_KEY, parseSavedStops, toSavedStop, toggleSavedStop } from "../utils/savedStops";

const store = createSavedStore(SAVED_STOPS_KEY, parseSavedStops);

/**
 * The stops the rider starred, kept in this browser only and shared by every component.
 */
export const useSavedStops = () => {
  /** @param {string} stopId */
  const isSaved = (stopId) => store.list.value.some((stop) => stop.id === stopId);

  /** @param {{stop_id: string, stop_name?: string, stop_code?: string}} stop */
  const toggle = (stop) => store.write(toggleSavedStop(store.list.value, toSavedStop(stop)));

  return { savedStops: readonly(store.list), isSaved, toggle };
};
