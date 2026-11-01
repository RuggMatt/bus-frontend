import { describe, expect, it } from "vitest";
import { edmontonDateTimeFormat, edmontonTimeZone } from "../src/utils/edmontonTimeZone";
import { edmontonNow } from "../src/utils/serviceTime";

describe("edmontonTimeZone", () => {
  it("uses the browser's rules before Alberta's clocks stopped changing", () => {
    expect(edmontonTimeZone(Date.parse("2026-03-08T08:59:59Z"))).toBe("America/Edmonton");
    expect(edmontonTimeZone(new Date("2025-11-15T12:00:00Z"))).toBe("America/Edmonton");
  });

  it("stays on UTC-6 from the March 2026 switch on", () => {
    expect(edmontonTimeZone(Date.parse("2026-03-08T09:00:00Z"))).toBe("Etc/GMT+6");
    expect(edmontonTimeZone(new Date("2026-11-01T21:00:00Z"))).toBe("Etc/GMT+6");
  });
});

describe("edmontonDateTimeFormat", () => {
  const format = edmontonDateTimeFormat("en-CA", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

  it("doesn't fall back in November 2026", () => {
    expect(format.format(new Date("2026-11-01T21:00:00Z"))).toBe("15:00");
    expect(format.format(new Date("2027-01-15T18:30:00Z"))).toBe("12:30");
  });

  it("still knows the old winter offset", () => {
    expect(format.format(new Date("2026-01-15T18:30:00Z"))).toBe("11:30");
  });

  it("puts edmontonNow on UTC-6 after the old fall back date", () => {
    expect(edmontonNow(new Date("2026-11-01T21:18:00Z"))).toEqual({
      dateString: "2026-11-01",
      secondsSinceMidnight: 15 * 3600 + 18 * 60,
    });
  });
});
