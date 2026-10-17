import { test, expect } from "./fixtures.js";

/** YYYY-MM-DD in Edmonton, `offset` days from today */
const edmontonDate = (offset) =>
  new Date(Date.now() + offset * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

test("a route's page for a stop lists the day's buses with when they went by", async ({ page }) => {
  await page.goto(`/stops/1002/routes/008?date=${edmontonDate(-2)}`);

  await expect(page.getByRole("heading", { name: "University" })).toBeVisible();
  await expect(page.getByText("Jasper Ave & 104 St")).toBeVisible();
  // the whole route's last week here, folded into a chip until tapped
  const chip = page.getByRole("button", { name: /^Usually .* here\. Show last week's delays$/ });
  await expect(page.getByText("21 buses on 3 trips")).toHaveCount(0);
  await chip.click();
  await expect(page.getByText("21 buses on 3 trips")).toBeVisible();

  const rows = page.locator(".arrival-row");
  await expect(rows).toHaveCount(3);
  // 8:05 here, 2 min 10 s late
  await expect(rows.nth(0)).toContainText("8:05 AM");
  await expect(rows.nth(0)).toContainText("Actual 8:07 AM");
  await expect(rows.nth(0).getByText("2 min late")).toBeVisible();
  await expect(rows.nth(2)).toContainText("Actual 10:02 AM");

  // a bus opens its details, with its trip on that day a tap further
  await rows.nth(1).click();
  await expect(rows.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("No bus recorded on this trip")).toBeVisible();
  await page.getByRole("link", { name: "Trip details" }).click();
  await expect(page).toHaveURL(new RegExp(`/trips/5002\\?date=${edmontonDate(-2)}`));
});

test("a route's page for a stop steps along the route's stops", async ({ page }) => {
  const date = edmontonDate(-2);
  await page.goto(`/stops/1002/routes/008?date=${date}`);

  // the next stop's schedule is slow, and the heading and directions stay put meanwhile
  await expect(page.getByRole("heading", { name: "University" })).toBeVisible();
  const slowSchedule = async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fallback();
  };
  await page.route("https://data.edmonton.ca/resource/4fvt-p2se.json*", slowSchedule);
  await page.getByRole("button", { name: "Next stop" }).click();
  await expect(page).toHaveURL(new RegExp(`/stops/1003/routes/008\\?date=${date}`));
  await expect(page.getByRole("heading", { name: "University" })).toBeVisible();
  await expect(page.getByRole("button", { name: "To University" })).toBeVisible();
  await page.unroute("https://data.edmonton.ca/resource/4fvt-p2se.json*", slowSchedule);
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

test("a route's page for a stop switches to the stop across the street going the other way", async ({ page }) => {
  const date = edmontonDate(-2);
  await page.goto(`/stops/1002/routes/008?date=${date}`);

  await expect(page.getByRole("button", { name: "To University" })).toHaveClass(/v-btn--active/);
  await page.getByRole("button", { name: "To Abbottsfield" }).click();
  await expect(page).toHaveURL(new RegExp(`/stops/2002/routes/008\\?date=${date}&direction=1`));
  await expect(page.getByRole("heading", { name: "Abbottsfield" })).toBeVisible();
  await expect(page.locator(".arrival-row")).toHaveCount(1);
  await expect(page.locator(".arrival-row").first()).toContainText("11:10 AM");
});

test("a bus with no time here says whether its trip was tracked", async ({ page }) => {
  const date = edmontonDate(-2);
  // 5003 was tracked but not placed at its last stop
  await page.goto(`/stops/1004/routes/008?date=${date}`);
  await expect(page.locator(".arrival-row").nth(2)).toContainText("Not seen here");
  await expect(page.locator(".arrival-row").nth(2)).toContainText("Trip was tracked");

  // the trip back wasn't tracked at all
  await page.goto(`/stops/2002/routes/008?date=${date}`);
  await expect(page.locator(".arrival-row").first()).toContainText("Not tracked");
});

test("today's list estimates when a bus on the way gets to the stop", async ({ page }) => {
  await page.goto("/stops/1003/routes/008");
  const earlier = page.getByRole("button", { name: /^Show \d+ earlier$/ });
  await expect(page.locator(".arrival-row").or(earlier).first()).toBeVisible();
  if (await earlier.isVisible()) await earlier.click();
  // the bus on 5002 is between 104 St and 100 St
  const row = page.locator(".arrival-row", { hasText: "9:10 AM" });
  await expect(row).toContainText(/Est\. \d+:\d\d [AP]M/);

  // its details show it among the stops before this one, and link to the bus
  await row.click();
  await expect(page.getByText(/^Next stop · \d+ m$/)).toBeVisible();
  await expect(page.getByRole("img", { name: "The bus is 1 stop from this stop, past Jasper Ave & 104 St" })).toBeVisible();
  await page.getByRole("link", { name: "Bus 4699" }).click();
  await expect(page).toHaveURL(/\/buses\/4699$/);
});

test("a stop on the trip page opens the route's page for that stop on the trip's day", async ({ page }) => {
  const date = edmontonDate(-2);
  await page.goto(`/trips/5002?date=${date}`);
  await page.locator(".stop-row", { hasText: "Jasper Ave & 104 St" }).click();
  await page.getByRole("link", { name: "Route 8 at this stop" }).click();
  await expect(page).toHaveURL(new RegExp(`/stops/1002/routes/008\\?date=${date}$`));
  await expect(page.locator(".arrival-row")).toHaveCount(3);
});
