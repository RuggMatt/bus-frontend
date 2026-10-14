# bus-frontend spec

This is a reference for how the app works and why. It covers the pages, data sources, shared pieces and the conventions to follow. Keep it up to date when behaviour changes.

## Stack

- Vue 3 (`<script setup>`, JS with JSDoc types and `// @ts-check` in places), Vite 8, Vuetify 4, Vue Router 5
- TanStack Vue Query for all fetching and caching
- Leaflet maps with Mapbox tiles
- Vitest for unit tests, in `tests/`
- ESLint with `eslint-plugin-vue`. The pre-commit hook runs `npm run lint`

Scripts:
- `npm run dev`
- `npm run build`
- `npm run lint`, which lints `src/` and `tests/`
- `npm test`, which runs `vitest run`

Environment, from `.env` (see `.env.example`):
- `VITE_APP_API_URL`: the bus-data-collection backend
- `VITE_APP_SODA_APP_TOKEN`: the City of Edmonton open data token
- `VITE_APP_MAPBOX_ACCESS_TOKEN`

## Data sources

### Backend (`VITE_APP_API_URL`)

| Endpoint | Used for |
| --- | --- |
| `/bus/now` | Live positions of every bus: `bus`, `lat`, `long`, `trip`, `timestamp` (epoch s), `bearing`, `speed` (m/s) |
| `/bus/trips/:tripId` | Recent recorded positions for a trip (trip page) |
| `/bus/electric`, `/bus/hydrogen` | Bus finders |
| `/bus/stats/{electric,hydrogen}/{hourly,daily}`, `/bus/stats/disk` | Stats and status pages |

`/bus/now` is a snapshot the backend takes about every 60 s. `nextBusRefreshDelay` (`src/utils/busRefresh.js`) times each refetch for when the next snapshot should be ready, and backs off if the collector looks stalled.

### City of Edmonton open data (SODA, `data.edmonton.ca/resource/<id>.json`)

| Dataset | Contents |
| --- | --- |
| `4vt2-8zrq` | Bus stops |
| `d577-xky7` | Routes |
| `ctwr-tvrd` | Trips, including `geometry_line`, the trip's route shape |
| `greh-g7ac` | Stop times per trip |
| `4fvt-p2se` | Stop schedule view. It joins stop times with trip and route and has `feed_start_date`/`feed_end_date`. Always filter it to the feed active today |

SODA queries escape single quotes in ids to prevent SoQL injection.

### GTFS quirks

- Route ids are zero-padded in the feed (`"008"`). Show them through `routeNumber()` (`src/utils/routes.js`), which gives `8`.
- Times are `HH:MM:SS` and can pass `24:00:00`, up to `30:00:00`, for trips that started on the previous service day. Use the helpers in `src/utils/serviceTime.js`:
  - `edmontonNow()` (always Edmonton time, whatever the viewer's zone)
  - `timeToSeconds` / `secondsToTime`
  - `scheduleWindow` (adds the previous-day range)
  - `scheduledSecondsNear`
- **Service days live in `service_id`.** Its last 7 characters say which days the service runs, Monday to Sunday (`DX-008-Weekday-1-26-09-1111100` runs Monday to Friday). Schedule rows are *not* filtered by day, so always check with `serviceRunsOnDay(serviceId, weekday)` and `weekdayOf(dateString, days)`.
- Weekday service comes in several overlapping variants per route (`Weekday-1`, `-3`, `-4` …). The app doesn't load holiday or school-day exceptions, so schedule-based answers are a best guess.
- Route ids are only unique within an agency, and regional buses (St. Albert, Spruce Grove …) share stops. So group by `` `${agency_name}|${route_id}` ``, and show the agency when it isn't `LOCAL_AGENCY` (Edmonton Transit Service).

### Query keys shared across pages

Reuse these keys, with the same `staleTime`, so pages warm each other's cache:

| Key | Data |
| --- | --- |
| `['routes']` | All routes |
| `['buses']` | `/bus/now` with `route_id` assigned. Slow, as it looks up every trip |
| `['buses-live']` | Raw `/bus/now` |
| `['trip-shape', tripId]` | `getTrip`, `staleTime: Infinity` |
| `['trip-stop-times', tripId]` | `getBusStopTimes`, `staleTime: Infinity` |
| `['stop-routes', stopId]` | Every route serving a stop, `staleTime: Infinity` |
| `['stop-schedule', stopId, date, windowStart]` | Trips within about 2 h either side of now |
| `['stop-next-arrivals', stopId, date, …]` | Each route and service pattern's earliest arrival from a time |

## Pages

### App shell (`App.vue`)
- On mobile, the nav drawer slides in and out. On desktop it stays open and the menu button collapses it to icons (a rail), with tooltips while railed.

### Main map (`/`, `HomePage.vue`, `NewBusMap.vue`)
- Live buses are shown as directional pin markers (`src/plugins/busIcon.js`).
- Tapping a bus highlights its route and opens `BusDetails.vue`. On desktop that's a left panel, on mobile a bottom sheet.
- **BusDetails** shows:
  - a route header: the badge, route name and a chevron to `/routes/:id`
  - the headsign
  - "Bus N · X km/h"
  - the next stop and its scheduled time
  - an On time / N min late / early chip
  - a full-width tonal "Trip details" button
- The next stop and status are worked out in `useBusTrip` (`src/composables/useBusTrip.js`):
  1. Find the bus's position along the trip shape.
  2. The next stop is the first one past the bus.
  3. Estimated arrival = report time + remaining distance ÷ `AVERAGE_SPEED_METRES_PER_SECOND` (20 km/h including stops).
  4. Status = estimate minus the scheduled time.
- The card uses the position from the moment of the tap. It doesn't update as the bus moves.
- A trip that isn't found shows the "Route could not be found" snackbar.

### Stops (`/stops/:stopId?`, `StopsPage.vue`, `StopDetails.vue`, `useStopArrivals`)
- Map, search, and nearby stops. Picking a stop opens its details.
- **Every route serving the stop is listed:**
  - **Live routes first.** A route is live if it has a bus whose trip is in the stop's schedule window. Each bus shows the headsign, "Bus N · distance", an ETA, and a status chip. Buses are listed nearest first, and buses that have passed drop off after 500 m. Tapping a bus selects it on the map and expands its details: stops away, next stop, scheduled time, and a "Trip details" button.
  - **Quiet routes below.** These show "No upcoming arrivals" and the next scheduled bus:
    - "Next bus at …" (today)
    - "tomorrow at …"
    - "Monday at …"
    - "next Wednesday at …"
    - "No buses scheduled in the next week"
  - Quiet routes are sorted soonest first, then by route number.
- **How the next bus is picked:** this lives in `nextArrivalByRoute` (`src/utils/nextArrival.js`, a pure function with unit tests). It uses three grouped `getStopNextArrivals` queries:
  - from now, on today's services
  - from now + 24 h, on yesterday's services still running past midnight (only queried before 6 AM)
  - from `00:00:00`, giving each pattern's first trip of the day
  
  If a route has nothing left today, it looks ahead day by day for up to 7 days. That covers weekday-only routes on weekends, routes that run one day a week, and a route that has finished on its only day.
- If the routes or next-arrival queries fail, the page shows just the live routes. It doesn't show an error.
- Cards ease in and out with the `arrival` TransitionGroup. This is turned off for reduced motion.

### Routes list (`/routes`)
- A searchable list. Each row has a `RouteBadge` (small), the long name, and chips for the active buses.

### Route details (`/routes/:routeId`, `RouteDetailsPage.vue`)
- The heading is a large `RouteBadge` beside the long name. It renders straight away from the `routeId` prop, without waiting for the routes query.
- An Active Buses chip list, linking to trips.
- A timetable, filtered by effective date (YY-MM in `service_id`), direction (labelled by the most common headsign) and weekday (`serviceRunsOnDay`). PM times are bold.
- There are no summary cards. The route id, the type (always bus) and the active-bus count were redundant and were removed.

### Trip details (`/trips/:tripId`, `TripDetails.vue`)
- The headsign, the service days and the start and end times.
- A route button: a small badge and the long name, linking to `/routes/:id`.
- A map with the route shape, stops coloured by lateness, and the bus's latest position.
- A stop list with scheduled and estimated times. Tapping a stop expands it to show its code, the other routes serving it (as badge chips), and a "Stop details" button.

### Others
- Electric and hydrogen bus finders and stats, the status page (disk stats), and About.

## Shared UI

- **`RouteBadge.vue`**: the only way to show a route number. A filled primary pill showing `routeNumber(routeId)`, in sizes `small`, `default` and `large`. Attributes pass through to the root, so callers can add `style` and `class`.
- **Full-width actions** use `<v-btn block variant="tonal" color="primary">`, as with "Trip details" and "Stop details".
- **Route header pattern:** a badge, the long name, and an `mdi-chevron-right` to the route page, in a `.route-header` link with a hover tint.

## View transitions (stop page or map → route page)

These use the same-document View Transitions API (`src/utils/viewTransition.js`):

- `navigateWithTransition(router, to)` wraps `router.push` in `document.startViewTransition`, waiting for the lazy route to load and then `nextTick`. It falls back to a plain push when the API is missing or reduced motion is preferred.
- `transitionLinkClick(event, router, to, setNamed)` is the click handler for a `<router-link custom>` + `<a :href>`. It leaves modifier and middle clicks to the browser, so they still open new tabs. It switches the caller's names on before the old page is captured and off afterwards.
- **Names:** `route-number` (badge), `route-name` (long name) and `bus-${bus}` (bus label → Active Buses chip). Every name must be unique on the page, so the source side only sets names on the tapped route. The route page always sets them, which is harmless because only those clicks start a transition.
- **Handoff:** the source passes `history.state = { routeLongName, buses: [{ bus, trip }] }`. The route page shows these until its own `routes` and `buses` queries load, so the new snapshot has something to morph into.
- The transition only plays going forward, from the stop page and the map's bus card. Back navigation and other links don't use it.
- The timing is set globally in `App.vue`: `::view-transition-group(*)`, 300 ms ease.

## Conventions

- **Branches:** before starting or pushing, `git fetch origin main`. PRs are often merged as new commits with different hashes, so drop commits that are already upstream and rebase onto `origin/main` (`git cherry -v origin/main HEAD` shows them).
- **Commits** follow conventional style (`feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `ci:`, `chore:`), lowercase, with a body explaining why.
- **Comments** are short, lowercase, and explain *why*. Match the surrounding density.
- **Code:** reuse the utilities above rather than re-deriving (time, service days, route numbers, geo, status labels in `src/utils/busStatus.js`). Keep pure logic in `src/utils/` so it can be unit tested.
- **Tests:** put Vitest tests in `tests/*.test.js` and import from `vitest` (no globals). Test against fixed dates. 2026-10-14 is a Wednesday.
- **CI:**
  - `.github/workflows/eslint.yml` runs ESLint as a SARIF scan.
  - `.github/workflows/test.yml` ("Tests") runs `npm ci` and `npm test` on Node 22, on PRs and on pushes to `main`.
- **Dependencies:** npm 10.9 can crash with `Cannot read properties of null (reading 'edgesOut')` when adding packages with optional peers. Use `npx npm@11 i …` for the install. `npm ci` on npm 10 works fine.
- **UI checks:** use Playwright with Chromium (`/usr/bin/google-chrome` locally) at 1280px and 375px. Good stops to try:
  - `1987` (routes 8 and 902)
  - `5381` (West Edmonton Mall, 12 routes, a mix of live and quiet)
  - `1620` (downtown, includes regional agencies)
