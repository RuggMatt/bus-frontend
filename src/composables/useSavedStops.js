// @ts-check
import { readonly, ref } from "vue";
import { SAVED_STOPS_KEY, parseSavedStops, toSavedStop, toggleSavedStop } from "../utils/savedStops";

// storage can be missing or blocked (private windows, site data turned off), and then the
// stops are only kept until the page is closed
const read = () => {
  try {
    return parseSavedStops(window.localStorage.getItem(SAVED_STOPS_KEY));
  } catch {
    return [];
  }
};

/** @type {import("vue").Ref<import("../utils/savedStops").SavedStop[]>} */
const saved = ref(typeof window === "undefined" ? [] : read());

if (typeof window !== "undefined") {
  // a stop saved in another tab shows here too
  window.addEventListener("storage", (event) => {
    if (event.key === SAVED_STOPS_KEY || event.key === null) saved.value = read();
  });
}

/**
 * The stops the rider starred, kept in this browser only and shared by every component.
 */
export const useSavedStops = () => {
  /** @param {string} stopId */
  const isSaved = (stopId) => saved.value.some((stop) => stop.id === stopId);

  /** @param {{stop_id: string, stop_name?: string, stop_code?: string}} stop */
  const toggle = (stop) => {
    saved.value = toggleSavedStop(saved.value, toSavedStop(stop));
    try {
      window.localStorage.setItem(SAVED_STOPS_KEY, JSON.stringify(saved.value));
    } catch {
      // kept in memory for this visit
    }
  };

  return { savedStops: readonly(saved), isSaved, toggle };
};
