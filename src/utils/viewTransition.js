import { nextTick } from "vue";

/**
 * Navigates inside a view transition, so elements sharing a view-transition-name
 * on both pages morph between them. Falls back to a plain push where the API is
 * missing or the viewer prefers reduced motion.
 *
 * @param {import("vue-router").Router} router
 * @param {import("vue-router").RouteLocationRaw} to
 */
export const navigateWithTransition = async (router, to) => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!document.startViewTransition || reduceMotion) {
    await router.push(to);
    return;
  }
  const transition = document.startViewTransition(async () => {
    // push resolves once the lazy page has loaded, nextTick once it has rendered
    await router.push(to);
    await nextTick();
  });
  await transition.finished;
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
