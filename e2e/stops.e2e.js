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

  // the rest of the header still opens the route
  // (by its badge, as the chip sits in the middle of it)
  await cards.nth(0).getByRole("link", { name: "Timetable for route 8" }).click({ position: { x: 24, y: 24 } });
  await expect(page).toHaveURL(/\/routes\/008/);
});
