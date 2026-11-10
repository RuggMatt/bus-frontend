import { describe, expect, it } from "vitest";
import { MAX_SAVED_STOPS, parseSavedStops, savedStopResults, toSavedStop, toggleSavedStop } from "../src/utils/savedStops";

const kingsway = { id: "1987", name: "109 Street & Kingsway", code: "1987" };
const jasper = { id: "1003", name: "Jasper Ave & 100 St", code: "1003" };

describe("parseSavedStops", () => {
  it("reads back what was stored", () => {
    expect(parseSavedStops(JSON.stringify([kingsway, jasper]))).toEqual([kingsway, jasper]);
  });

  it("gives none for nothing stored or something unreadable", () => {
    expect(parseSavedStops(null)).toEqual([]);
    expect(parseSavedStops("not json")).toEqual([]);
    expect(parseSavedStops('{"id":"1987"}')).toEqual([]);
  });

  it("drops entries that aren't stops, and repeats", () => {
    const stored = JSON.stringify([kingsway, null, 5, { name: "No id" }, { id: "" }, kingsway, { id: "2002" }]);
    expect(parseSavedStops(stored)).toEqual([kingsway, { id: "2002", name: "", code: "2002" }]);
  });
});

describe("toSavedStop", () => {
  it("keeps the stop's name and the number on its sign", () => {
    expect(toSavedStop({ stop_id: "1987", stop_name: "109 Street & Kingsway", stop_code: "1987" })).toEqual(kingsway);
    expect(toSavedStop({ stop_id: "2002" })).toEqual({ id: "2002", name: "", code: "2002" });
  });
});

describe("toggleSavedStop", () => {
  it("puts a newly saved stop first", () => {
    expect(toggleSavedStop([kingsway], jasper)).toEqual([jasper, kingsway]);
  });

  it("removes a stop that's already saved", () => {
    expect(toggleSavedStop([jasper, kingsway], { ...jasper, name: "Renamed" })).toEqual([kingsway]);
  });

  it("lets the oldest go past the limit", () => {
    const full = Array.from({ length: MAX_SAVED_STOPS }, (_, index) => ({ id: `s${index}`, name: "", code: `s${index}` }));
    const next = toggleSavedStop(full, jasper);
    expect(next).toHaveLength(MAX_SAVED_STOPS);
    expect(next[0]).toEqual(jasper);
    expect(next.at(-1).id).toBe(`s${MAX_SAVED_STOPS - 2}`);
  });
});

describe("savedStopResults", () => {
  it("lists them like the search's stops", () => {
    expect(savedStopResults([kingsway, { id: "2002", name: "", code: "2002" }])).toEqual([
      { value: "stop:1987", title: "109 Street & Kingsway", subtitle: "Stop 1987", saved: true },
      { value: "stop:2002", title: "Stop 2002", subtitle: "Stop 2002", saved: true },
    ]);
  });
});
