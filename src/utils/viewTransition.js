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
