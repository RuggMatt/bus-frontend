// @ts-check
import { ref } from "vue";

/**
 * A list kept in the browser's storage and shared by every component. Storage can be
 * missing or blocked (private windows, site data turned off), and then the list is only
 * kept until the page is closed.
 * @template T
 * @param {string} key
 * @param {(stored: string | null) => T[]} parse
 */
export const createSavedStore = (key, parse) => {
  const read = () => {
    try {
      return parse(window.localStorage.getItem(key));
    } catch {
      return [];
    }
  };

  const list = /** @type {import("vue").Ref<T[]>} */ (ref(typeof window === "undefined" ? [] : read()));

  if (typeof window !== "undefined") {
    // something saved in another tab shows here too
    window.addEventListener("storage", (event) => {
      if (event.key === key || event.key === null) list.value = read();
    });
  }

  /** @param {T[]} next */
  const write = (next) => {
    list.value = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // kept in memory for this visit
    }
  };

  return { list, write };
};
