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

test("a route's stops show how late buses were at each last week", async ({ page }) => {
  await page.goto("/routes/008");

  const stops = page.getByRole("heading", { name: "Stops" });
  await expect(stops).toBeVisible();
  await expect(page.getByText("How late buses were last week · Oct 10 – Oct 16")).toBeVisible();

  // in the order buses reach them, each with its stats, before the timetable
  const rows = page.locator(".stop-row");
  await expect(rows).toHaveCount(4);
  await expect(rows.first()).toContainText("Jasper Ave & 109 St");
  await expect(rows.first()).toContainText("Usually on time");
  await expect(rows.first()).toContainText("71% on time");
  await expect(rows.first()).toContainText("21 buses on 3 trips");
  await expect(rows.last()).toContainText("Jasper Ave & 95 St");
  await expect(rows.last()).toContainText("No times here in the last week yet");

  // tapping a bar says what's in it
  await rows.first().getByRole("button", { name: "Under 1 min late: 15 buses" }).click();
  await expect(rows.first()).toContainText("Under 1 min late: 15 buses");
});
