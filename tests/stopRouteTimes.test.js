import { describe, expect, it } from "vitest";
import { approachDiagram, arrivalsOnDate, commonShapeTrip, earlierCount, runDate, serviceDaySeconds, stopIndexOnTrip } from "../src/utils/stopRouteTimes";

const entry = (trip_id, arrival_time, service_id, extra = {}) => ({
  trip_id,
  arrival_time,
  service_id,
  trip_headsign: "8 University",
  stop_sequence: "5",
  ...extra,
});

describe("arrivalsOnDate", () => {
  const entries = [
    entry("3", "13:05:00", "Weekday-1-1111100"),
    entry("1", "08:05:00", "Weekday-1-1111100"),
    entry("2", "08:05:00", "Weekday-3-1111100"),
    entry("4", "09:00:00", "Saturday-1-0000010"),
    entry("5", "24:10:00", "Weekday-1-1111100"),
  ];

  it("keeps the services the calendar runs that day, earliest first", () => {
    const rows = arrivalsOnDate(entries, new Set(["Weekday-1-1111100"]), "2026-10-14");
    expect(rows.map((row) => row.trip_id)).toEqual(["1", "3", "5"]);
  });

  it("falls back to the service_id days, keeping one visit per time and place", () => {
    // 2026-10-14 is a Wednesday, and the two weekday variants both claim it
    expect(arrivalsOnDate(entries, null, "2026-10-14").map((row) => row.trip_id)).toEqual(["1", "3", "5"]);
    expect(arrivalsOnDate(entries, new Set(), "2026-10-17").map((row) => row.trip_id)).toEqual(["4"]);
  });

  it("keeps both visits of a trip that passes the stop twice", () => {
    const loop = [entry("7", "10:30:00", "S", { stop_sequence: "20" }), entry("7", "10:00:00", "S", { stop_sequence: "2" })];
    expect(arrivalsOnDate(loop, new Set(["S"]), "2026-10-14").map((row) => row.stop_sequence)).toEqual(["2", "20"]);
  });
});

describe("serviceDaySeconds", () => {
  it("counts from the service day's midnight, past 24:00:00 the day after", () => {
    // 2026-10-14 08:05 in Edmonton (MDT, UTC-6)
    const morning = Date.UTC(2026, 9, 14, 14, 5) / 1000;
    expect(serviceDaySeconds(morning, "2026-10-14")).toBe(8 * 3600 + 5 * 60);
    // 00:10 on the 15th is 24:10:00 on the 14th's service day
    const pastMidnight = Date.UTC(2026, 9, 15, 6, 10) / 1000;
    expect(serviceDaySeconds(pastMidnight, "2026-10-14")).toBe(24 * 3600 + 10 * 60);
  });
});

describe("runDate", () => {
  it("files a trip starting past midnight under the next day", () => {
    expect(runDate("2026-10-14", 23 * 3600)).toBe("2026-10-14");
    expect(runDate("2026-10-14", 24 * 3600 + 60)).toBe("2026-10-15");
  });
});

describe("earlierCount", () => {
  const arrivals = ["07:00:00", "08:00:00", "08:30:00", "09:30:00"].map((time, i) => entry(String(i), time, "S"));

  it("hides the visits over the window before now", () => {
    expect(earlierCount(arrivals, 9 * 3600, 3600)).toBe(1);
    expect(earlierCount(arrivals, 6 * 3600, 3600)).toBe(0);
  });

  it("hides them all once the day's buses have gone", () => {
    expect(earlierCount(arrivals, 12 * 3600, 3600)).toBe(4);
  });
});

describe("commonShapeTrip", () => {
  it("picks a trip on the shape most visits use", () => {
    const entries = ["1", "2", "3", "4"].map((id) => entry(id, "08:00:00", "S"));
    const shapes = new Map([["1", "short"], ["2", "full"], ["3", "full"], ["4", "full"]]);
    expect(commonShapeTrip(entries, shapes)).toBe("2");
    expect(commonShapeTrip(entries, new Map())).toBeNull();
  });
});

describe("stopIndexOnTrip", () => {
  const loop = ["10", "11", "12", "10"].map((stop_id, i) => ({ stop_id, stop_sequence: String(i + 1) }));

  it("finds the visit at the given stop_sequence, else the first", () => {
    expect(stopIndexOnTrip(loop, "10", "4")).toBe(3);
    expect(stopIndexOnTrip(loop, "10", null)).toBe(0);
    expect(stopIndexOnTrip(loop, "12", "9")).toBe(2);
    expect(stopIndexOnTrip(loop, "99", null)).toBe(-1);
  });
});

describe("approachDiagram", () => {
  const stops = [0, 400, 800, 1200, 1600, 2000, 2400, 2800].map((along, index) => ({ name: `S${index}`, along }));

  it("puts the bus between the stop it passed and the next", () => {
    const diagram = approachDiagram(stops.slice(0, 4), 600);
    expect(diagram).toEqual({
      stopsAway: 2,
      dots: [{ name: "S1" }, { name: "S2" }, { name: "S3" }],
      bus: 0.25,
    });
  });

  it("cuts a long way to go down to a gap", () => {
    const diagram = approachDiagram(stops, 100);
    expect(diagram?.stopsAway).toBe(7);
    expect(diagram?.dots).toEqual([{ name: "S0" }, { name: "S1" }, { name: "S2" }, { name: "S3" }, null, { name: "S7" }]);
    expect(diagram?.bus).toBeCloseTo(0.25 / 5);
  });

  it("starts at the first stop before the bus has passed any", () => {
    expect(approachDiagram(stops.slice(0, 2), -50)).toEqual({ stopsAway: 2, dots: [{ name: "S0" }, { name: "S1" }], bus: 0 });
  });

  it("is null once the bus has gone by", () => {
    expect(approachDiagram(stops.slice(0, 3), 900)).toBeNull();
  });
});
