import { test, expect } from "./fixtures.js";

test("a past day's timetable shows when the buses actually went by", async ({ page }) => {
  await page.goto("/routes/008");

  // today's aren't worked out until overnight
  await page.getByRole("button", { name: "Actual" }).click();
  await expect(page).toHaveURL(/times=actual/);
  await expect(page.getByText("today's show tomorrow")).toBeVisible();

  await page.getByRole("button", { name: /^See / }).click();
  const table = page.locator(".timetable-scroll table");
  // 8:00 at the second stop, 2 min 10 s late
  await expect(table.locator("td", { hasText: "8:07" })).toHaveCSS("color", /251, 140, 0|fb8c00/i);
  await expect(table.getByText("2 min late").first()).toBeVisible();
  // 10:15 at the last stop wasn't seen
  await expect(table.locator("td", { hasText: "3 min early" }).first()).toHaveCSS("color", /33, 150, 243|2196f3/i);
  await expect(table.locator("tbody tr").last().locator("td").nth(5)).toHaveText("—");

  await page.getByRole("button", { name: "Scheduled" }).click();
  await expect(table.getByText("8:05")).toBeVisible();
  await expect(table.getByText("2 min late")).toHaveCount(0);
});
