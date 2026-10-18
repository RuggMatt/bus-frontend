import { test, expect } from "./fixtures.js";

test("a page chunk gone after a deploy loads the page fresh instead of failing", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);

  // the old build's routes page chunk is gone, as after a deploy
  let failed = 0;
  await page.route(/\/assets\/RoutesPage-[^/]+\.js$/, (route) => {
    if (failed++ === 0) return route.fulfill({ status: 404, body: "" });
    return route.continue();
  });

  await page.getByRole("link", { name: "Routes" }).first().click();
  await expect(page).toHaveURL("/routes");
  await expect(page.getByText(/Abbottsfield - Downtown - University/).first()).toBeVisible();
  expect(failed).toBeGreaterThan(1);
});
