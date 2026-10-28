import { test, expect } from "./fixtures.js";

test("a stop lists its routes with a bus on the way first, and a week of delays on tap", async ({ page }) => {
  await page.goto("/stops/1003");

  const cards = page.locator(".stop-arrivals > .v-card");
  // route 2 has nothing on the way, so it's below route 8 despite its number
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Abbottsfield - Downtown - University");
  await expect(cards.nth(0)).toContainText("Bus 4699");
  await expect(cards.nth(1)).toContainText("Lessard - Downtown - Clareview");
  await expect(cards.nth(1)).toContainText("No upcoming arrivals");

  const chip = cards.nth(0).getByRole("button", { name: /^Usually on time/ });
  await chip.click();
  await expect(cards.nth(0).getByText("21 buses on 3 trips")).toBeVisible();
  await expect(page).toHaveURL(/\/stops\/1003$/);
  await chip.click();
  await expect(cards.nth(0).getByText("21 buses on 3 trips")).toHaveCount(0);
  await expect(page).toHaveURL(/\/stops\/1003$/);

  // the rest of the header opens the route's page for this stop
  // (by its badge, as the chip sits in the middle of it)
  await cards.nth(0).getByRole("link", { name: "Route 8 at this stop" }).click({ position: { x: 24, y: 24 } });
  await expect(page).toHaveURL(/\/stops\/1003\/routes\/008/);
});

test("a stop opens over the main map, and tapping the map closes it", async ({ page }) => {
  await page.goto("/stops/1003");
  await expect(page.getByText("Jasper Ave & 100 St").first()).toBeVisible();
  await expect(page).toHaveTitle(/Jasper Ave & 100 St · Stop 1003/);
  // its bus is on the map, badged with its route
  await expect(page.locator(".leaflet-marker-icon .bus-route-badge").first()).toHaveText("8");

  // empty map, well away from the panel or sheet
  await page.locator(".leaflet-container").click({ position: { x: 200, y: 140 } });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".stop-arrivals")).toHaveCount(0);
});

test("the map's search finds a route by number or a stop by number", async ({ page }) => {
  await page.goto("/");
  const search = page.getByRole("combobox", { name: /Search for a route/ });

  await search.fill("1003");
  await page.getByRole("option", { name: /Jasper Ave & 100 St/ }).click();
  await expect(page).toHaveURL(/\/stops\/1003$/);
  await expect(page.locator(".stop-arrivals > .v-card").first()).toContainText("Abbottsfield - Downtown - University");

  await search.fill("8");
  // the route's own number comes before stops starting with it
  await expect(page.getByRole("option").first()).toContainText("Route 8");
  await page.getByRole("option").first().click();
  await expect(page).toHaveURL(/\/routes\/008$/);
});
