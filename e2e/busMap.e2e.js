import { test, expect } from "./fixtures.js";
import { BUS } from "./mockApi.js";

/**
 * The element's box once it's fully on screen and has stopped moving, as after the
 * sheet's opening slide. Two reads 100 ms apart must match: reads taken back to back
 * can match mid-slide, which aimed the swipe below the sheet's final top.
 */
const settledBox = async (locator) => {
  await expect(locator).toBeInViewport({ ratio: 1 });
  let previous = null;
  await expect(async () => {
    const box = await locator.boundingBox();
    const moved = previous === null || box.y !== previous.y || box.height !== previous.height;
    previous = box;
    expect(moved).toBe(false);
  }).toPass({ intervals: [100] });
  return previous;
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
  // coloured by its predicted delay, and the card says the same
  await expect(busMarker(page)).toHaveClass(/bus-marker-icon--status-warning/);
  await openBus(page);
  await expect(page.locator(".v-chip", { hasText: "7 min late" })).toBeVisible();

  const details = page.getByRole("link", { name: "Timetable for route 8" });
  await expect(details).toBeVisible();
  await expect(details).toContainText("University");
  await expect(details).toContainText("Abbottsfield - Downtown - University");

  await page.getByRole("link", { name: "Trip details" }).click();
  await expect(page).toHaveURL(`/trips/${BUS.trip}`);
  await expect(page.getByRole("button", { name: "Next trip", exact: true })).toBeVisible();
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

test("the bus's route fits in the map above its sheet", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the bottom sheet is only on phones");
  await page.goto("/");
  await openBus(page);

  const sheet = await settledBox(page.locator(".v-bottom-sheet .v-card"));
  const map = await page.locator(".map-container").boundingBox();
  const route = page.locator(".leaflet-route-pane path");
  await expect(route).toBeVisible();
  // centred in the part of the map the sheet leaves showing, once the fit has
  // followed the sheet open
  const shownMiddle = (map.y + sheet.y) / 2;
  await expect(async () => {
    const box = await route.boundingBox();
    expect(Math.abs(box.y + box.height / 2 - shownMiddle)).toBeLessThan(40);
  }).toPass();
});
