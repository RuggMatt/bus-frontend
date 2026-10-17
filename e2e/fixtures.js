import { test as base, expect } from "@playwright/test";
import { mockApi } from "./mockApi.js";

/**
 * Every test gets a page wired to the fake feed, and fails if the app throws.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error));
    await mockApi(page);
    await use(page);
    expect(errors, "uncaught errors in the page").toEqual([]);
  },
});

export { expect };
