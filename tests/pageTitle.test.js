import { describe, expect, it } from "vitest";
import { pageTitle, SITE_NAME } from "../src/utils/pageTitle";

describe("pageTitle", () => {
  it("is the site name alone without parts", () => {
    expect(pageTitle()).toBe(SITE_NAME);
  });

  it("puts the most specific part first", () => {
    expect(pageTitle("Route 8", "Abbottsfield - Downtown - University")).toBe(
      "Route 8 · Abbottsfield - Downtown - University · Edmonton Bus Tracker",
    );
  });

  it("leaves out parts that haven't loaded", () => {
    expect(pageTitle(undefined, "Trip 123", null, "")).toBe("Trip 123 · Edmonton Bus Tracker");
  });
});
