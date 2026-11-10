import { describe, expect, it } from "vitest";
import { MAX_SAVED_ROUTES, parseSavedRoutes, savedRouteResults, splitSavedRoutes, toggleSavedRoute } from "../src/utils/savedRoutes";

const eight = { id: "008", name: "Abbottsfield - Downtown - University" };
const nine = { id: "009", name: "Eaux Claires - Downtown" };

describe("parseSavedRoutes", () => {
  it("reads back what was stored", () => {
    expect(parseSavedRoutes(JSON.stringify([eight, nine]))).toEqual([eight, nine]);
  });

  it("gives none for nothing stored or something unreadable", () => {
    expect(parseSavedRoutes(null)).toEqual([]);
    expect(parseSavedRoutes("not json")).toEqual([]);
    expect(parseSavedRoutes('{"id":"008"}')).toEqual([]);
  });

  it("drops entries that aren't routes, and repeats", () => {
    expect(parseSavedRoutes(JSON.stringify([eight, null, { name: "No id" }, eight, { id: "A6" }])))
      .toEqual([eight, { id: "A6", name: "" }]);
  });
});

describe("toggleSavedRoute", () => {
  it("puts a newly saved route first, and removes one already saved", () => {
    expect(toggleSavedRoute([eight], nine)).toEqual([nine, eight]);
    expect(toggleSavedRoute([nine, eight], { id: "009", name: "" })).toEqual([eight]);
  });

  it("lets the oldest go past the limit", () => {
    const full = Array.from({ length: MAX_SAVED_ROUTES }, (_, index) => ({ id: `r${index}`, name: "" }));
    const next = toggleSavedRoute(full, eight);
    expect(next).toHaveLength(MAX_SAVED_ROUTES);
    expect(next[0]).toEqual(eight);
  });
});

describe("savedRouteResults", () => {
  it("lists them like the search's routes", () => {
    expect(savedRouteResults([eight])).toEqual([
      { value: "route:008", title: "Route 8", subtitle: "Abbottsfield - Downtown - University", saved: true },
    ]);
  });
});

describe("splitSavedRoutes", () => {
  it("takes the saved routes out, in the list's order", () => {
    const routes = [{ route_id: "002" }, { route_id: "008" }, { route_id: "009" }];
    expect(splitSavedRoutes(routes, [nine, eight])).toEqual({
      saved: [{ route_id: "008" }, { route_id: "009" }],
      rest: [{ route_id: "002" }],
    });
    expect(splitSavedRoutes(routes, [])).toEqual({ saved: [], rest: routes });
  });
});
