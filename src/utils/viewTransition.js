import { nextTick } from "vue";

// set while any view transition runs, so the router hook doesn't start a second one
let transitionRunning = false;

/** @returns {boolean} */
export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const canTransition = () => Boolean(document.startViewTransition) && !prefersReducedMotion();

/**
 * Navigates inside a view transition, so elements sharing a view-transition-name
 * on both pages morph between them. Falls back to a plain push where the API is
 * missing or the viewer prefers reduced motion.
 *
 * @param {import("vue-router").Router} router
 * @param {import("vue-router").RouteLocationRaw} to
 */
export const navigateWithTransition = async (router, to) => {
  if (!canTransition()) {
    await router.push(to);
    return;
  }
  transitionRunning = true;
  try {
    const transition = document.startViewTransition(async () => {
      // push resolves once the lazy page has loaded, nextTick once it has rendered
      await router.push(to);
      await nextTick();
    });
    await transition.finished;
  } finally {
    transitionRunning = false;
  }
};

// the pages sharing one map (see plugins/sharedMap.js)
const MAP_PAGES = new Set(["Home", "Trip Details", "Bus Details", "Route Details"]);

/**
 * Between two different map pages. The same page with new params keeps its map.
 *
 * @param {import("vue-router").RouteLocationNormalized} to
 * @param {import("vue-router").RouteLocationNormalized} from
 */
const isMapPair = (to, from) =>
  to.name !== from.name && MAP_PAGES.has(String(to.name)) && MAP_PAGES.has(String(from.name));

/**
 * Plays a view transition on every navigation between two pages with the shared
 * map, by any link and by back and forward, so the map's box morphs between the
 * two layouts while the map flies to its new view.
 *
 * @param {import("vue-router").Router} router
 */
export const installMapTransitions = (router) => {
  // the browser already animated a swipe back, so another animation would play it twice
  let browserAnimated = false;
  window.addEventListener("popstate", (event) => {
    browserAnimated = Boolean(/** @type {any} */ (event).hasUAVisualTransition);
  });
  /** @type {(() => void) | null} */
  let rendered = null;

  router.beforeResolve((to, from) => {
    const skip = browserAnimated;
    browserAnimated = false;
    // the first navigation has no old page to morph from
    if (skip || transitionRunning || !from.matched.length || !isMapPair(to, from) || !canTransition()) {
      return;
    }
    transitionRunning = true;
    // lets the navigation carry on once the old page has been captured
    return new Promise((captured) => {
      const transition = document.startViewTransition(() => new Promise((resolve) => {
        rendered = resolve;
        captured(undefined);
      }));
      transition.finished.finally(() => {
        transitionRunning = false;
      });
    });
  });

  router.afterEach(async () => {
    browserAnimated = false;
    const done = rendered;
    rendered = null;
    if (done) {
      // the new page is captured once it has rendered
      await nextTick();
      done();
    }
  });
};

/**
 * Click handler for a link that should navigate inside a view transition. New-tab
 * clicks are left to the browser. `setNamed` switches the caller's
 * view-transition-names on before the old page is captured, and off afterwards,
 * as each name must be unique on the page.
 *
 * @param {MouseEvent} event
 * @param {import("vue-router").Router} router
 * @param {import("vue-router").RouteLocationRaw} to
 * @param {(named: boolean) => void} setNamed
 */
export const transitionLinkClick = async (event, router, to, setNamed) => {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  setNamed(true);
  // the names must be in the DOM before the old page is captured
  await nextTick();
  try {
    await navigateWithTransition(router, to);
  } finally {
    setNamed(false);
  }
};
