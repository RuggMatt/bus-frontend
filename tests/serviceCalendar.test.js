import { describe, expect, it } from "vitest";
import {
  regularServices,
  sameServices,
  schedulePeriod,
  schedulePeriods,
  serviceDatesFrom,
  servicesOnDate,
} from "../src/utils/serviceCalendar";
import { ROUTE_8_CALENDAR } from "./fixtures/route8Calendar";

const dates = serviceDatesFrom(ROUTE_8_CALENDAR.map(([service_id, date]) => ({ service_id, date, exception_type: "1" })));
const serviceIds = [...dates.keys()];

describe("schedulePeriod", () => {
  it("reads ETS's year and month", () => {
    expect(schedulePeriod("DX-008-Weekday-1-26-09-1111100")).toBe("26-09");
    // the start date prefix is per service, so the shared year and month wins
    expect(schedulePeriod("20260914-Weekday-1-26-09-1111100")).toBe("26-09");
  });

  it("reads a year, month and day", () => {
    expect(schedulePeriod("DX-008-Weekday-1-260406-1111100")).toBe("260406");
  });

  it("reads regional seasons", () => {
    expect(schedulePeriod("540-Weekday-1-BT-FAL26-1111100")).toBe("FAL26");
  });

  it("falls back to a start date prefix", () => {
    expect(schedulePeriod("20260914-Weekday-1")).toBe("20260914");
  });

  it("is null when there's nothing to read", () => {
    expect(schedulePeriod("Weekday")).toBeNull();
  });
});

describe("serviceDatesFrom", () => {
  it("takes the date from a timestamp and removes type 2 dates", () => {
    const result = serviceDatesFrom([
      { service_id: "a", date: "2026-10-12T00:00:00.000", exception_type: "1" },
      { service_id: "a", date: "2026-10-13T00:00:00.000", exception_type: "1" },
      { service_id: "a", date: "2026-10-13T00:00:00.000", exception_type: "2" },
    ]);
    expect([...result.get("a")]).toEqual(["2026-10-12"]);
  });
});

describe("schedulePeriods", () => {
  it("groups route 8 into its one current schedule", () => {
    const periods = schedulePeriods(serviceIds, dates);
    expect(periods).toHaveLength(1);
    expect(periods[0]).toMatchObject({ key: "26-09", start: "2026-09-20", end: "2026-11-28" });
    expect(periods[0].serviceIds).toHaveLength(8);
  });

  it("orders a current and a future schedule by start date", () => {
    const withFuture = new Map(dates);
    withFuture.set("DX-008-Weekday-1-26-11-1111100", new Set(["2026-11-30", "2026-12-01"]));
    const periods = schedulePeriods([...withFuture.keys()], withFuture);
    expect(periods.map((p) => [p.key, p.start, p.end])).toEqual([
      ["26-09", "2026-09-20", "2026-11-28"],
      ["26-11", "2026-11-30", "2026-12-01"],
    ]);
  });

  it("leaves out services with no dates", () => {
    expect(schedulePeriods(["nope-26-12-1111100"], dates)).toEqual([]);
  });
});

describe("servicesOnDate", () => {
  it("gives a normal weekday's service", () => {
    expect([...servicesOnDate(dates, "2026-10-14")]).toEqual(["DX-008-Weekday-1-26-09-1111100"]);
  });

  it("gives Sunday service on Thanksgiving Monday", () => {
    expect([...servicesOnDate(dates, "2026-10-12")]).toEqual(["SU-008-Sunday-1-26-09-0000001"]);
  });

  it("gives Saturday service on Remembrance Day", () => {
    expect([...servicesOnDate(dates, "2026-11-11")]).toEqual(["SA-008-Saturday-1-26-09-0000010"]);
  });

  it("gives the one-off service on Truth and Reconciliation Day", () => {
    expect([...servicesOnDate(dates, "2026-09-30")]).toEqual(["DX-008-Weekday-5-26-09-1111100"]);
  });

  it("is empty outside the feed", () => {
    expect(servicesOnDate(dates, "2027-01-01").size).toBe(0);
  });
});

describe("regularServices", () => {
  it("leaves the one-off Monday services out", () => {
    expect([...regularServices(dates, serviceIds, "monday")]).toEqual(["DX-008-Weekday-1-26-09-1111100"]);
  });

  it("leaves holiday Sunday and Saturday service out of weekdays", () => {
    expect([...regularServices(dates, serviceIds, "wednesday")]).toEqual(["DX-008-Weekday-1-26-09-1111100"]);
  });

  it("gives the weekend services", () => {
    expect([...regularServices(dates, serviceIds, "saturday")]).toEqual(["SA-008-Saturday-1-26-09-0000010"]);
    expect([...regularServices(dates, serviceIds, "sunday")]).toEqual(["SU-008-Sunday-1-26-09-0000001"]);
  });

  it("keeps services that share the regular days", () => {
    const shared = new Map(dates);
    shared.set("DX-008-Weekday-2-26-09-1111100", dates.get("DX-008-Weekday-1-26-09-1111100"));
    expect(regularServices(shared, [...shared.keys()], "tuesday").size).toBe(2);
  });

  it("is empty for a day the period doesn't run", () => {
    expect(regularServices(dates, ["DX-008-Weekday-1-26-09-1111100"], "sunday").size).toBe(0);
  });
});

describe("sameServices", () => {
  it("compares as sets", () => {
    expect(sameServices(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameServices(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
  });
});
