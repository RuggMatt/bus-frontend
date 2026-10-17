import { test, expect } from "./fixtures.js";

/** YYYY-MM-DD in Edmonton, `offset` days from today */
const edmontonDate = (offset) =>
  new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

test("a route's page for a stop lists the day's buses with when they went by", async ({ page }) => {
  await page.goto(`/stops/1002/routes/008?date=${edmontonDate(-2)}`);

  await expect(page.getByRole("heading", { name: "University" })).toBeVisible();
  await expect(page.getByText("Jasper Ave & 104 St")).toBeVisible();
  // the whole route's last week here
  await expect(page.getByText("Usually on time")).toBeVisible();

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
