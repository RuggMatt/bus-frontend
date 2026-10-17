import { test, expect } from "./fixtures.js";

test("an unknown address shows a not-found page with links back into the app", async ({ page }) => {
  await page.goto("/no/such/page");

  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  await expect(page.getByText("/no/such/page")).toBeVisible();
  await expect(page).toHaveTitle("Page not found · Edmonton Bus Tracker");

  await page.getByRole("main").getByRole("link", { name: "Routes" }).click();
  await expect(page).toHaveURL("/routes");
  await expect(page.getByText(/Abbottsfield - Downtown - University/).first()).toBeVisible();
});

test("known pages still open", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "Page not found" })).toHaveCount(0);
});
