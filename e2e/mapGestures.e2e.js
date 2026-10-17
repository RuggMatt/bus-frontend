import { test, expect } from "./fixtures.js";

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Edmonton" });

// leaflet scales its proxy element by 2^zoom, so its transform changes with every zoom
const zoomOf = (page) => page.locator(".leaflet-proxy").evaluate((el) => el.style.transform);

test("on a page that scrolls, the wheel scrolls past the map and only zooms it with ctrl", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones have no scroll wheel");
  await page.goto(`/trips/5002?date=${today()}`);
  const map = page.locator(".transit-map");
  await expect(page.getByText("Jasper Ave & 109 St").first()).toBeVisible();
  // so the page has room to scroll
  await page.evaluate(() => (document.body.style.minHeight = "3000px"));

  const box = await map.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const zoom = await zoomOf(page);

  await page.mouse.wheel(0, 200);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await expect(page.getByText("Use Ctrl + scroll to zoom the map")).toBeVisible();
  expect(await zoomOf(page)).toBe(zoom);

  const scrolled = await page.evaluate(() => scrollY);
  // the map has moved up with the page
  const moved = await map.boundingBox();
  await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height / 2);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await page.keyboard.up("Control");
  await expect.poll(() => zoomOf(page)).not.toBe(zoom);
  expect(await page.evaluate(() => scrollY)).toBe(scrolled);
  await expect(page.locator(".leaflet-gesture-hint--visible")).toHaveCount(0);
});

test("the main map zooms with the wheel alone", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones have no scroll wheel");
  await page.goto("/");
  const box = await page.locator(".shared-map").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const zoom = await zoomOf(page);

  await page.mouse.wheel(0, -200);
  await expect.poll(() => zoomOf(page)).not.toBe(zoom);
  await expect(page.locator(".leaflet-gesture-hint--visible")).toHaveCount(0);
});
