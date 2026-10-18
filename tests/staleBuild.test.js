import { describe, expect, it } from "vitest";
import { isChunkLoadError, RELOAD_WINDOW_MS, shouldReload } from "../src/utils/staleBuild";

describe("isChunkLoadError", () => {
  it.each([
    "Failed to fetch dynamically imported module: https://example.com/assets/RoutesPage-abc123.js",
    "error loading dynamically imported module: https://example.com/assets/RoutesPage-abc123.js",
    "Importing a module script failed.",
    "Unable to preload CSS for /assets/RoutesPage-abc123.css",
    "'text/html' is not a valid JavaScript MIME type.",
  ])("is a failed chunk: %s", (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it("isn't any other error", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError("Failed to fetch dynamically imported module")).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
  });
});

describe("shouldReload", () => {
  const now = 1_000_000;

  it("reloads the first time", () => {
    expect(shouldReload("/routes", null, now)).toBe(true);
  });

  it("doesn't reload the same page again straight after", () => {
    expect(shouldReload("/routes", { url: "/routes", at: now - 2000 }, now)).toBe(false);
  });

  it("reloads for another page", () => {
    expect(shouldReload("/delays", { url: "/routes", at: now - 2000 }, now)).toBe(true);
  });

  it("reloads the same page again once a while has passed", () => {
    expect(shouldReload("/routes", { url: "/routes", at: now - RELOAD_WINDOW_MS - 1 }, now)).toBe(true);
  });
});
