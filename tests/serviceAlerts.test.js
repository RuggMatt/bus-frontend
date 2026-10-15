import { describe, expect, it } from "vitest";
import {
  alertStatus,
  alertsForRoute,
  alertsForStop,
  alertsForTrip,
  edmontonLocal,
  formatAlertPeriod,
  groupAlerts,
  nowLocal,
  routesWithActiveAlerts,
} from "../src/utils/serviceAlerts";

// trimmed rows from the City's dataset (5yvt-mcye), October 2026
const rows = [
  // one alert on two routes, with no stops
  { alert_id: "203030", start_dttm: "2026-10-12T05:00:00.000", end_dttm: "2026-10-19T09:00:00.000", route_id: "051", effect: "MODIFIED_SERVICE", header_text: "Service returning to 132 Avenue" },
  { alert_id: "203030", start_dttm: "2026-10-12T05:00:00.000", end_dttm: "2026-10-19T09:00:00.000", route_id: "106", effect: "MODIFIED_SERVICE", header_text: "Service returning to 132 Avenue" },
  // a stop closure with no end
  { alert_id: "203220", start_dttm: "2026-10-13T12:07:00.000", end_dttm: "3000-01-01T00:00:00.000", route_id: "669", stop_id: "9607", effect: "STOP_MOVED", header_text: "Closure of stop 9607" },
  { alert_id: "203220", start_dttm: "2026-10-13T12:07:00.000", end_dttm: "3000-01-01T00:00:00.000", route_id: "718", stop_id: "9607", effect: "STOP_MOVED", header_text: "Closure of stop 9607" },
  // a stop closure starting later
  { alert_id: "203322", start_dttm: "2026-10-15T10:00:00.000", end_dttm: "2026-10-29T18:00:00.000", route_id: "008", stop_id: "1271", effect: "DETOUR", header_text: "Closure of stop 1271" },
  // a detour from 7 to 6 on several days, rows out of order
  { alert_id: "202579", start_dttm: "2026-10-16T07:00:00.000", end_dttm: "2026-10-16T18:00:00.000", route_id: "A6", stop_id: "A0292, A0294", effect: "DETOUR", header_text: "Planned Detour for Route A6" },
  { alert_id: "202579", start_dttm: "2026-10-14T07:00:00.000", end_dttm: "2026-10-14T18:00:00.000", route_id: "A6", stop_id: "A0292, A0294", effect: "DETOUR", header_text: "Planned Detour for Route A6" },
  { alert_id: "202579", start_dttm: "2026-10-15T07:00:00.000", end_dttm: "2026-10-15T18:00:00.000", route_id: "A6", stop_id: "A0292, A0294", effect: "DETOUR", header_text: "Planned Detour for Route A6" },
];

const alerts = groupAlerts(rows);
/** @param {string} id */
const byId = (id) => alerts.find((alert) => alert.id === id);

// 2026-10-14 is a Wednesday
const WED_NOON = "2026-10-14T12:00:00";

describe("groupAlerts", () => {
  it("merges an alert's routes, stops and periods", () => {
    expect(alerts).toHaveLength(4);
    expect([...byId("203030").routeIds]).toEqual(["051", "106"]);
    expect(byId("203030").stopIds.size).toBe(0);
    expect(byId("203030").periods).toEqual([{ start: "2026-10-12T05:00:00", end: "2026-10-19T09:00:00" }]);
    expect([...byId("202579").stopIds]).toEqual(["A0292", "A0294"]);
    expect(byId("202579").periods.map((period) => period.start)).toEqual([
      "2026-10-14T07:00:00",
      "2026-10-15T07:00:00",
      "2026-10-16T07:00:00",
    ]);
  });

  it("reads the year 3000 as no end", () => {
    expect(byId("203220").periods).toEqual([{ start: "2026-10-13T12:07:00", end: null }]);
  });
});

describe("edmontonLocal", () => {
  it("rolls times past midnight onto the next day", () => {
    expect(edmontonLocal("2026-10-14", 8 * 3600 + 15 * 60)).toBe("2026-10-14T08:15:00");
    expect(edmontonLocal("2026-10-31", 25 * 3600 + 10 * 60)).toBe("2026-11-01T01:10:00");
  });

  it("gives now in Edmonton", () => {
    expect(nowLocal(new Date("2026-10-14T18:30:00Z"))).toBe("2026-10-14T12:30:00");
  });
});

describe("alertStatus", () => {
  it("tells active, upcoming and ended alerts apart", () => {
    expect(alertStatus(byId("203322"), WED_NOON).state).toBe("upcoming");
    expect(alertStatus(byId("203322"), "2026-10-15T10:00:00").state).toBe("active");
    expect(alertStatus(byId("203322"), "2026-10-29T18:00:00").state).toBe("ended");
    expect(alertStatus(byId("203220"), "2027-06-01T00:00:00").state).toBe("active");
  });

  it("picks the period in effect, or the next one", () => {
    const during = alertStatus(byId("202579"), WED_NOON).timing;
    expect(during.period.start).toBe("2026-10-14T07:00:00");
    expect(during.more).toBe(2);
    const between = alertStatus(byId("202579"), "2026-10-14T20:00:00");
    expect(between.state).toBe("upcoming");
    expect(between.timing.period.start).toBe("2026-10-15T07:00:00");
    expect(between.timing.more).toBe(1);
  });
});

describe("alertsForRoute", () => {
  it("splits a route's alerts into active and upcoming", () => {
    const { active, upcoming } = alertsForRoute(alerts, "008", WED_NOON);
    expect(active).toEqual([]);
    expect(upcoming.map((timing) => timing.alert.id)).toEqual(["203322"]);
    expect(alertsForRoute(alerts, "106", WED_NOON).active.map((timing) => timing.alert.id)).toEqual(["203030"]);
  });

  it("leaves out alerts naming only another direction's stops", () => {
    expect(alertsForRoute(alerts, "008", WED_NOON, new Set(["1271", "1000"])).upcoming).toHaveLength(1);
    expect(alertsForRoute(alerts, "008", WED_NOON, new Set(["1272"])).upcoming).toHaveLength(0);
    // an alert with no stops applies to both directions
    expect(alertsForRoute(alerts, "051", WED_NOON, new Set(["1272"])).active).toHaveLength(1);
  });
});

describe("alertsForTrip", () => {
  const stops = new Set(["1270", "1271", "1272"]);

  it("finds alerts in effect during the trip, and the stops they name", () => {
    const { alerts: matches, affectedStops } = alertsForTrip(
      alerts, "008", stops, "2026-10-15T09:30:00", "2026-10-15T10:20:00",
    );
    expect(matches.map((timing) => timing.alert.id)).toEqual(["203322"]);
    expect([...affectedStops]).toEqual([["1271", "DETOUR"]]);
  });

  it("leaves out alerts outside the trip's window", () => {
    expect(alertsForTrip(alerts, "008", stops, "2026-10-14T09:30:00", "2026-10-14T10:20:00").alerts).toEqual([]);
    expect(alertsForTrip(alerts, "008", stops, "2026-10-15T09:00:00", "2026-10-15T10:00:00").alerts).toEqual([]);
  });

  it("leaves out alerts on stops the trip doesn't serve", () => {
    expect(alertsForTrip(alerts, "008", new Set(["1272"]), "2026-10-15T09:30:00", "2026-10-15T10:20:00").alerts).toEqual([]);
  });

  it("matches a trip running past midnight", () => {
    const { alerts: matches } = alertsForTrip(
      alerts, "008", stops, edmontonLocal("2026-10-28", 24 * 3600), edmontonLocal("2026-10-28", 25 * 3600 + 10 * 60),
    );
    expect(matches).toHaveLength(1);
  });
});

describe("alertsForStop and routesWithActiveAlerts", () => {
  it("finds the alerts naming a stop", () => {
    expect(alertsForStop(alerts, "9607", WED_NOON).active.map((timing) => timing.alert.id)).toEqual(["203220"]);
    expect(alertsForStop(alerts, "1271", WED_NOON).upcoming).toHaveLength(1);
    expect(alertsForStop(alerts, "1", WED_NOON)).toEqual({ active: [], upcoming: [] });
  });

  it("lists the routes with an alert in effect", () => {
    expect([...routesWithActiveAlerts(alerts, WED_NOON)].sort()).toEqual(["051", "106", "669", "718", "A6"]);
  });
});

describe("formatAlertPeriod", () => {
  it("says when an alert ends or starts", () => {
    expect(formatAlertPeriod(alertStatus(byId("203030"), WED_NOON).timing, WED_NOON)).toBe("Until Mon, Oct 19 at 9:00 AM");
    expect(formatAlertPeriod(alertStatus(byId("203220"), WED_NOON).timing, WED_NOON)).toBe("Until further notice");
    expect(formatAlertPeriod(alertStatus(byId("203322"), WED_NOON).timing, WED_NOON)).toBe(
      "Starts tomorrow at 10:00 AM, until Thu, Oct 29 at 6:00 PM",
    );
  });

  it("counts the other days of a recurring detour", () => {
    expect(formatAlertPeriod(alertStatus(byId("202579"), WED_NOON).timing, WED_NOON)).toBe(
      "Until today at 6:00 PM + 2 more days",
    );
  });
});
