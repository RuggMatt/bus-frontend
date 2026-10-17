import { test, expect } from "./fixtures.js";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

test("stepping between a route's trips keeps the page and changes the trip", async ({ page }) => {
  await page.goto(`/trips/5002?date=${today()}`);

  const picker = page.getByRole("button", { name: "Pick a trip" });
  await expect(picker).toContainText("9:00");
  await expect(page.getByText("Jasper Ave & 109 St").first()).toBeVisible();

  await page.getByRole("button", { name: "Next trip" }).click();
  await expect(page).toHaveURL(new RegExp(`/trips/5003\\?date=${today()}`));
  await expect(picker).toContainText("10:00");

  await page.getByRole("button", { name: "Previous trip" }).click();
  await page.getByRole("button", { name: "Previous trip" }).click();
  await expect(page).toHaveURL(/\/trips\/5001/);
  await expect(picker).toContainText("8:00");

  // the first trip of the day has nothing before it
  await expect(page.getByRole("button", { name: "Previous trip" })).toBeDisabled();
});

test("a stop's details show how late this trip and the route usually are there", async ({ page }) => {
  await page.goto(`/trips/5002?date=${today()}`);

  await page.getByRole("button", { name: /Jasper Ave & 104 St/ }).click();
  await expect(page.getByText("Usually 2 min late")).toBeVisible();
  await expect(page.getByText("On 6 of the last 7 days")).toBeVisible();

  await page.getByRole("button", { name: "Whole route" }).click();
  await expect(page.getByText("Usually on time")).toBeVisible();
  await expect(page.getByText("21 buses on 3 trips")).toBeVisible();

  // the choice sticks when another stop is opened
  await page.getByRole("button", { name: /Jasper Ave & 100 St/ }).click();
  // the last stop's details close as these open
  await expect(page.locator(".delay-stats")).toHaveCount(1);
  await expect(page.getByText("21 buses on 3 trips")).toBeVisible();
});

test("a live trip says how the bus is doing and how old its position is", async ({ page }) => {
  await page.goto("/trips/5002");

  // the bus is between the second and third stops
  await expect(page.getByText("Next stop Jasper Ave & 100 St")).toBeVisible();
  await expect(page.locator(".v-chip").filter({ hasText: /^(On time|\d+ min (late|early))$/ }).first()).toBeVisible();
  await expect(page.locator(".trip-map .bus-age-badge")).toHaveText(/s ago$/);
});

test("opening a detoured stop says what the detour is", async ({ page }) => {
  await page.goto(`/trips/5002?date=${today()}`);

  const stop = page.getByRole("button", { name: /Jasper Ave & 95 St/ });
  await expect(stop.getByText("Detour")).toBeVisible();
  await stop.click();
  // under the map, and again in the stop's details
  await expect(page.getByText("Jasper Ave & 95 St closed")).toHaveCount(2);
});

test("the trip map can't be dragged away from Edmonton", async ({ page, isMobile }) => {
  test.skip(isMobile, "one finger scrolls the page on phones, so the map is dragged with a mouse");
  // the latest run, so the bus is on the map
  await page.goto("/trips/5002");

  const map = page.locator(".trip-map");
  const bus = map.locator('[title="Bus 4699"]');
  await expect(bus).toBeVisible();
  // zoomed out as far as it goes, the whole region is in view
  const zoomOut = map.locator(".leaflet-control-zoom-out");
  for (let i = 0; i < 12 && !(await zoomOut.getAttribute("class"))?.includes("leaflet-disabled"); i++) {
    await zoomOut.click();
    await page.waitForTimeout(300);
  }

  // a long drag east, which would leave the bus far behind without the limit
  const box = await map.boundingBox();
  const y = box.y + box.height / 2;
  for (let i = 0; i < 3; i++) {
    await page.mouse.move(box.x + box.width - 20, y);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, y, { steps: 10 });
    await page.mouse.up();
  }
  await page.waitForTimeout(500);
  const busBox = await bus.boundingBox();
  expect(busBox.x).toBeGreaterThan(box.x);
  expect(busBox.x).toBeLessThan(box.x + box.width);
});
