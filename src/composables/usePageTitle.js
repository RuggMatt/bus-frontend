import { watch } from "vue";
import { useRoute } from "vue-router";
import { pageTitle } from "../utils/pageTitle";

/**
 * Keeps the tab title in step with what the page has loaded, e.g. a route's long name,
 * in place of the plain title the router gives the page from its meta.
 * @param {() => (string | null | undefined | false)[]} parts
 */
export function usePageTitle(parts) {
  const route = useRoute();
  const name = route.name;
  // after the router's afterEach, and again when the router reuses the page for new params
  watch([parts, () => route.fullPath], ([current]) => {
    // the old page can see the new route just before it unmounts
    if (route.name === name) {
      document.title = pageTitle(...current);
    }
  }, { immediate: true, flush: "post" });
}
