import { describe, expect, it } from "vitest";
import { compassPoint, groupPositions, nearestStop, thinPositions } from "../src/utils/positions";

describe("compassPoint", () => {
  it("rounds to the nearest of eight points", () => {
    expect(compassPoint(0)).toBe("N");
    expect(compassPoint(22.4)).toBe("N");
    expect(compassPoint(22.5)).toBe("NE");
    expect(compassPoint(180)).toBe("S");
    expect(compassPoint(359)).toBe("N");
    expect(compassPoint("270")).toBe("W");
  });

  it("handles bearings outside 0–360", () => {
    expect(compassPoint(-90)).toBe("W");
    expect(compassPoint(450)).toBe("E");
  });

  it("gives nothing for a missing bearing", () => {
    expect(compassPoint("x")).toBe("");
  });
});

describe("nearestStop", () => {
  const stops = [
    { id: "a", lat: 53.5, lon: -113.5 },
    { id: "b", lat: 53.501, lon: -113.5 },
  ];

  it("picks the closest stop in range", () => {
    expect(nearestStop({ lat: 53.5008, long: -113.5 }, stops, 150)?.id).toBe("b");
  });

  it("gives null when every stop is too far", () => {
    expect(nearestStop({ lat: 53.51, long: -113.5 }, stops, 150)).toBeNull();
  });
});

describe("thinPositions", () => {
  // a straight line of points 10 px apart
  const line = Array.from({ length: 21 }, (_, index) => ({ x: index * 10, y: 0 }));

  it("keeps points at least the spacing apart, and both ends", () => {
    const kept = thinPositions(line, 50);
    expect(kept[0]).toBe(0);
    expect(kept.at(-1)).toBe(20);
    for (let i = 1; i < kept.length; i++) {
      expect(line[kept[i]].x - line[kept[i - 1]].x).toBeGreaterThanOrEqual(50);
    }
    expect(kept).toEqual([0, 5, 10, 15, 20]);
  });

  it("keeps more as the spacing shrinks, as when zooming in", () => {
    expect(thinPositions(line, 20).length).toBeGreaterThan(thinPositions(line, 50).length);
    expect(thinPositions(line, 5)).toHaveLength(21);
  });

  it("drops points stacked on one spot", () => {
    const stacked = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }, { x: 100, y: 0 }];
    expect(thinPositions(stacked, 50)).toEqual([0, 3]);
  });
});

describe("groupPositions", () => {
  // about 11 m per 0.0001° of latitude
  const at = (id, metresNorth) => ({ id, lat: 53.5 + metresNorth / 111195, long: -113.5 });
  const ids = (groups) => groups.map((group) => group.map((position) => position.id));

  it("groups consecutive positions within the distance", () => {
    const positions = [at("a", 0), at("b", 10), at("c", 40), at("d", 200), at("e", 210)];
    expect(ids(groupPositions(positions, 50))).toEqual([["a", "b", "c"], ["d", "e"]]);
  });

  it("measures from the group's first position, so a slow crawl splits", () => {
    const positions = [at("a", 0), at("b", 30), at("c", 60), at("d", 90)];
    expect(ids(groupPositions(positions, 50))).toEqual([["a", "b"], ["c", "d"]]);
  });

  it("doesn't group a spot that's passed again later", () => {
    const positions = [at("a", 0), at("b", 500), at("c", 0)];
    expect(ids(groupPositions(positions, 50))).toEqual([["a"], ["b"], ["c"]]);
  });

  it("keeps positions without a location on their own", () => {
    const positions = [at("a", 0), { id: "x", lat: "", long: "nope" }, at("b", 0)];
    expect(ids(groupPositions(positions, 50))).toEqual([["a"], ["x"], ["b"]]);
  });

  it("handles no positions", () => {
    expect(groupPositions([], 50)).toEqual([]);
  });
});
