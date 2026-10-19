import { test, expect } from "./fixtures.js";
import { API_URL, BUS } from "./mockApi.js";

/** YYYY-MM-DD in Edmonton, `offset` days from today */
const edmontonDate = (offset) =>
  new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

test("the bus page says how late each trip ran, and how late it's running now", async ({ page }) => {
  const yesterday = edmontonDate(-1);
  const ranAt = Date.parse(`${yesterday}T08:00:00-06:00`) / 1000;
  const now = Math.floor(Date.now() / 1000);
  // the trip it's on now, and one yesterday that ran about 6 min late
  await page.route(`${API_URL}/bus/${BUS.bus}/recent-trips?**`, (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify([
        { trip: BUS.trip, start: now - 600, end: now - 5, points: 20 },
        { trip: 5001, start: ranAt + 30, end: ranAt + 1110, points: 37 },
      ]),
    }),
  );
  await page.route(`${API_URL}/stop-times/delays/trips?**`, (route) => {
    expect(new URL(route.request().url()).searchParams.get("bus")).toBe(String(BUS.bus));
    return route.fulfill({
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        from: yesterday, to: yesterday, days: 1, sort: "mean",
        trips: [{
          trip: 5001, date: yesterday, route: "008", bus: BUS.bus, firstScheduled: ranAt,
          stops: 12, mean: 380, max: 900, maxStop: "1003", last: 600, onTime: 2, late: 8,
        }],
      }),
    });
  });

  await page.goto(`/buses/${BUS.bus}`);

  const rows = page.locator(".trip-row");
  await expect(rows).toHaveCount(2);
  // the live trip has ETS's prediction, 420 s late in the fake feed
  await expect(rows.nth(0).getByText("Now", { exact: true })).toBeVisible();
  await expect(rows.nth(0).getByText("7 min late")).toBeVisible();
  await expect(rows.nth(1).getByText("Avg 6 min late")).toBeVisible();

  await rows.nth(1).click();
  await expect(page.getByText("Average 6 min 20 s late · worst 15 min late · 17% of stops on time")).toBeVisible();
});
