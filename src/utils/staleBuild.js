// @ts-check

// a tab left open across a deploy still asks for the old build's page chunks, which
// are gone, so the navigation fails. Loading the page fresh picks up the new build

// how each browser words a failed dynamic import, and Vite's own failed CSS preload
const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|is not a valid JavaScript MIME type/i;

const RELOAD_KEY = "stale-build-reload";
// a second failure on the same page this soon after reloading for it isn't a stale
// build, so it's left as an error rather than reloading again and again
export const RELOAD_WINDOW_MS = 10_000;

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export const isChunkLoadError = (error) =>
  error instanceof Error && CHUNK_ERROR.test(error.message);

/**
 * @param {string} url
 * @param {{ url: string, at: number } | null} last the previous reload for a stale build
 * @param {number} now
 * @returns {boolean}
 */
export const shouldReload = (url, last, now) =>
  !last || last.url !== url || now - last.at > RELOAD_WINDOW_MS;

/** @returns {{ url: string, at: number } | null} */
const lastReload = () => {
  try {
    return JSON.parse(sessionStorage.getItem(RELOAD_KEY) ?? "null");
  } catch {
    return null;
  }
};

/**
 * Loads `url` fresh, unless it was just reloaded for this already.
 *
 * @param {string} url
 * @returns {boolean} whether it's reloading
 */
export const reloadForNewBuild = (url) => {
  // offline, the fresh load would fail too and lose the page
  if (navigator.onLine === false) return false;
  const now = Date.now();
  if (!shouldReload(url, lastReload(), now)) return false;
  try {
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify({ url, at: now }));
  } catch {
    // without storage there's no loop guard, so don't risk one
    return false;
  }
  window.location.assign(url);
  return true;
};

/**
 * Loads the page being navigated to fresh when its chunk can't be loaded.
 *
 * @param {import("vue-router").Router} router
 */
export const installStaleBuildReload = (router) => {
  router.onError((error, to) => {
    if (isChunkLoadError(error)) reloadForNewBuild(router.resolve(to).href);
  });
};
