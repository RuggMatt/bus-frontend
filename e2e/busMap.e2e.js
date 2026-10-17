import { test, expect } from "./fixtures.js";
import { BUS } from "./mockApi.js";

/** The element's box once it has stopped moving, as after the sheet's opening slide. */
const settledBox = async (locator) => {
  let box = await locator.boundingBox();
  await expect(async () => {
    const previous = box;
    box = await locator.boundingBox();
    expect(box).toEqual(previous);
  }).toPass({ intervals: [100] });
  return box;
};

const busMarker = (page) => page.locator(`.leaflet-marker-icon[title="${BUS.bus}"]`);

/**
 * Taps the bus until its card opens. The map swaps each marker for a new one when
 * the buses update, which they do twice on load (again once their routes are
 * known), so a tap right then can land on a marker that's going away.
 */
const openBus = async (page) => {
  await expect(async () => {
    await busMarker(page).click();
    await expect(page.getByText("Next stop: Jasper Ave & 100 St")).toBeVisible({ timeout: 1000 });
  }).toPass();
};

test("tapping a bus shows where it's going, and links to its trip", async ({ page }) => {
  await page.goto("/");
  await openBus(page);

  const details = page.getByRole("link", { name: "Timetable for route 8" });
  await expect(details).toBeVisible();
  await expect(details).toContainText("University");
  await expect(details).toContainText("Abbottsfield - Downtown - University");

  await page.getByRole("link", { name: "Trip details" }).click();
  await expect(page).toHaveURL(`/trips/${BUS.trip}`);
  await expect(page.getByRole("button", { name: "Next trip" })).toBeVisible();
});

test("swiping the bus sheet down closes it", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the bottom sheet is only on phones");
  await page.goto("/");
  await openBus(page);

  const sheet = page.locator(".v-bottom-sheet .v-card");

  // once it has slid all the way up, a real touch drag 200px down from its top
  const box = await settledBox(sheet);
  const x = box.x + box.width / 2;
  const y = box.y + 20;
  const cdp = await page.context().newCDPSession(page);
  const touch = (type, touchY) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y: touchY }],
    });
  await touch("touchStart", y);
  for (let step = 1; step <= 10; step++) await touch("touchMove", y + step * 20);
  await touch("touchEnd");

  await expect(sheet).toBeHidden();
  // and the map lets go of the bus, so it can be tapped again
  await openBus(page);
  await expect(sheet).toBeVisible();
});
