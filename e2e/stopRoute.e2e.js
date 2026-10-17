import { test, expect } from "./fixtures.js";

/** YYYY-MM-DD in Edmonton, `offset` days from today */
const edmontonDate = (offset) =>
  new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

test("a route's page for a stop lists the day's buses with when they went by", async ({ page }) => {
  await page.goto(`/stops/1002/routes/008?date=${edmontonDate(-2)}`);

  await expect(page.getByRole("heading", { name: "University" })).toBeVisible();
  await expect(page.getByText("Jasper Ave & 104 St")).toBeVisible();
  // the whole route's last week here
  await expect(page.getByText("21 buses on 3 trips")).toBeVisible();

  const rows = page.locator(".arrival-row");
  await expect(rows).toHaveCount(3);
  // 8:05 here, 2 min 10 s late
  await expect(rows.nth(0)).toContainText("8:05 AM");
  await expect(rows.nth(0)).toContainText("Actual 8:07 AM");
  await expect(rows.nth(0).getByText("2 min late")).toBeVisible();
  await expect(rows.nth(2)).toContainText("Actual 10:02 AM");

  // a bus opens its trip on that day
  await rows.nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/trips/5002\\?date=${edmontonDate(-2)}`));
});

test("a route's page for a stop steps along the route's stops", async ({ page }) => {
  const date = edmontonDate(-2);
  await page.goto(`/stops/1002/routes/008?date=${date}`);

  await page.getByRole("button", { name: "Next stop" }).click();
  await expect(page).toHaveURL(new RegExp(`/stops/1003/routes/008\\?date=${date}`));
  await expect(page.getByText("Jasper Ave & 100 St")).toBeVisible();
  await expect(page.locator(".arrival-row").first()).toContainText("8:10 AM");

  // the list jumps to any stop on the route
  await page.getByRole("button", { name: "Pick another stop on this route" }).click();
  await page.locator(".v-list-item", { hasText: "Jasper Ave & 109 St" }).click();
  await expect(page).toHaveURL(/\/stops\/1001\/routes\/008/);
  await expect(page.getByRole("button", { name: "Previous stop" })).toBeDisabled();

  // the stop's own page is a link of its own
  await page.getByRole("link", { name: "All routes at this stop" }).click();
  await expect(page).toHaveURL(/\/stops\/1001$/);
});

test("a stop on the route page opens the route's page for that stop", async ({ page }) => {
  await page.goto("/routes/008");
  await page.locator(".stop-row").getByRole("link", { name: "Jasper Ave & 104 St" }).click();
  await expect(page).toHaveURL(/\/stops\/1002\/routes\/008$/);
  await expect(page.getByRole("link", { name: "All routes at this stop" })).toBeVisible();
});
