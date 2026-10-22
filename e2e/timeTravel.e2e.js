import { test, expect } from "./fixtures.js";
import { BUS, RUN_DATE } from "./mockApi.js";

const busMarker = (page) => page.locator(`.leaflet-marker-icon[title="${BUS.bus}"]`);

test("the map shows the buses at a picked time, and back to now", async ({ page }) => {
  await page.goto("/");
  await expect(busMarker(page)).toHaveClass(/bus-marker-icon--status-warning/);

  await page.getByRole("button", { name: /Showing buses now/ }).click();
  await page.getByLabel("Date").fill(RUN_DATE);
  await page.getByLabel("Time (Edmonton)").fill("08:03");
  await page.getByRole("button", { name: "Show buses" }).click();
  await expect(page).toHaveURL(`/?at=${RUN_DATE}T08:03`);

  // yesterday's position has no predicted delay, so the pin isn't coloured
  await expect(busMarker(page)).not.toHaveClass(/bus-marker-icon--status-/);
  await expect(async () => {
    await busMarker(page).click();
    // between its first and second stops then
    await expect(page.getByText("Next stop: Jasper Ave & 104 St")).toBeVisible({ timeout: 1000 });
  }).toPass();

  // the trip button opens the run the bus was on
  await page.getByRole("link", { name: "Trip details" }).click();
  await expect(page).toHaveURL(`/trips/5001?date=${RUN_DATE}`);
  await page.goBack();
  await expect(page).toHaveURL(`/?at=${RUN_DATE}T08:03`);

  // a step later the bus has moved on, and the card follows it
  await page.getByRole("button", { name: "5 minutes later" }).click();
  await expect(page).toHaveURL(`/?at=${RUN_DATE}T08:08`);
  await expect(page.getByText("Next stop: Jasper Ave & 100 St")).toBeVisible();

  await page.getByRole("button", { name: /Showing buses at/ }).click();
  await page.getByRole("button", { name: "Back to now" }).click();
  await expect(page).toHaveURL("/");
  await expect(busMarker(page)).toHaveClass(/bus-marker-icon--status-warning/);
});

test("a time with nothing recorded says so", async ({ page }) => {
  await page.goto(`/?at=${RUN_DATE}T03:00`);
  await expect(page.getByText("No buses were recorded at that time")).toBeVisible();
  await expect(busMarker(page)).toHaveCount(0);
});
