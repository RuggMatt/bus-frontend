import { test, expect } from "./fixtures.js";

/** YYYY-MM-DD in Edmonton, `offset` days from today */
const edmontonDate = (offset) =>
  new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

test("the delays page ranks the latest trips, routes and buses", async ({ page }) => {
  await page.goto("/delays");

  await expect(page.getByRole("heading", { name: "Delays" })).toBeVisible();
  const rows = page.locator(".delay-row");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("University");
  await expect(rows.nth(0)).toContainText("Yesterday · 8:00 AM");
  await expect(rows.nth(0).getByText("6 min late on average")).toBeVisible();

  // a trip opens its details, with the stop it was latest at and its run that day
  await rows.nth(0).click();
  await expect(page.getByRole("link", { name: "Jasper Ave & 100 St" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View trip" })).toHaveAttribute("href", `/trips/5001?date=${edmontonDate(-1)}`);

  // ranked by worst delay instead
  await page.getByText("Worst", { exact: true }).click();
  await expect(page).toHaveURL(/sort=max/);
  await expect(rows.nth(0).getByText("Worst 15 min late")).toBeVisible();

  // a month, with how much of it has been worked out
  await page.getByRole("button", { name: "Month" }).click();
  await expect(page).toHaveURL(/period=month/);
  await expect(page.getByText("Worked out for 3 of its 30 days so far")).toBeVisible();
  // the last 30 days by default, with calendar months in the picker
  await expect(page.getByRole("button", { name: "Pick a month" })).toHaveText("Last 30 days");
  await expect(page).not.toHaveURL(/date=/);
  await page.getByRole("button", { name: "Pick a month" }).click();
  await page.getByRole("listitem").filter({ hasText: "Last month" }).click();
  await expect(page).toHaveURL(/date=\d{4}-\d{2}-01/);
  await expect(page.getByRole("button", { name: "Pick a month" })).toHaveText("Last month");
  // a week starts on the last 7 days, never a week still to come
  await page.getByRole("button", { name: "Week" }).click();
  await expect(page.getByRole("button", { name: "Pick a week" })).toHaveText("Last 7 days");
  await expect(page).not.toHaveURL(/date=/);
  await page.getByRole("button", { name: "Month" }).click();

  // routes, and from a route to its latest trips
  await page.getByRole("tab", { name: "Routes" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("Abbottsfield - Downtown - University");
  await rows.nth(0).click();
  await page.getByRole("button", { name: "Latest trips on route 8" }).click();
  await expect(page).toHaveURL(/route=008/);
  await expect(page.getByText("Route 8 only")).toBeVisible();
  await expect(rows).toHaveCount(2);

  await page.getByRole("tab", { name: "Buses" }).click();
  await expect(rows.nth(0)).toContainText("Bus 4699");
  await expect(rows.nth(0)).toContainText("6 trips");
});

test("the delays page lists the trips running now, latest first", async ({ page }) => {
  await page.goto("/delays");

  const running = page.locator("section", { has: page.getByRole("heading", { name: "Running now" }) });
  await expect(running.getByText("1 running")).toBeVisible();
  const rows = running.locator(".running-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.nth(0)).toContainText("University");
  await expect(rows.nth(0)).toContainText("Bus 4699");
  await expect(rows.nth(0).getByText("7 min late")).toBeVisible();

  // a row opens the live trip
  await rows.nth(0).click();
  await expect(page).toHaveURL(/\/trips\/5002$/);
});

test("the trips running now come in pages of 10", async ({ page }) => {
  // 23 trips, from 23 min late down to 1 min late
  await page.route("**/bus/now", (route) => {
    const now = Math.floor(Date.now() / 1000);
    route.fulfill({
      json: Array.from({ length: 23 }, (_, index) => ({
        bus: 4000 + index, trip: 9000 + index, route: "008", lat: 53.54, long: -113.49,
        bearing: 0, speed: 5, timestamp: now - 5, delay: (23 - index) * 60,
      })),
    });
  });
  await page.goto("/delays");

  const running = page.locator("section", { has: page.getByRole("heading", { name: "Running now" }) });
  const rows = running.locator(".running-row");
  await expect(rows).toHaveCount(10);
  await expect(rows.nth(0)).toContainText("23 min late");

  await running.getByRole("button", { name: "Page 3" }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("3 min late");
});
