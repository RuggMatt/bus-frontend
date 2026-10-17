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
