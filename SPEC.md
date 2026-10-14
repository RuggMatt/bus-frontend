# bus-frontend spec

This is a reference for how the app works and why. It covers the pages, data sources, shared pieces and the conventions to follow. Keep it up to date when behaviour changes.

## Stack

- Vue 3 (`<script setup>`, JS with JSDoc types and `// @ts-check` in places), Vite 8, Vuetify 4, Vue Router 5
- TanStack Vue Query for all fetching and caching
- Leaflet maps with Mapbox tiles. Always import Leaflet from `src/plugins/leaflet.js`. A second copy (e.g. `leaflet/dist/leaflet`) replaces the global `L` and breaks plugins such as `AnimatedMarker`
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

Only read `/bus/now` through `src/composables/useBuses.js`:
- `useLiveBuses()` / `liveBusesQuery` gives the raw snapshot.
- `useBuses()` gives the snapshot with `route_id` on each bus.

Both use `nextBusRefreshDelay` for their `staleTime` and `refetchInterval`. So every page shares one cached snapshot, and there's at most one request per backend snapshot. `['buses']` is built from `['buses-live']`, and returns copies so the shared snapshot isn't changed. Trip→route ids are cached for the session, so each refresh only looks up trips it hasn't seen before.

### City of Edmonton open data (SODA, `data.edmonton.ca/resource/<id>.json`)

| Dataset | Contents |
| --- | --- |
| `4vt2-8zrq` | Bus stops |
| `d577-xky7` | Routes |
| `ctwr-tvrd` | Trips, including `geometry_line`, the trip's route shape |
| `greh-g7ac` | Stop times per trip |
| `4fvt-p2se` | Stop schedule view. It joins stop times with trip and route and has `feed_start_date`/`feed_end_date`. Always filter it to the feed active today. It has no `direction_id` |
| `f2sy-bth7` | Calendar dates: every date each service runs (`exception_type` 1), for every agency. `getServiceDates` |

SODA queries escape single quotes in ids to prevent SoQL injection.

### GTFS quirks

- Route ids are zero-padded in the feed (`"008"`). Show them through `routeNumber()` (`src/utils/routes.js`), which gives `8`.
- Times are `HH:MM:SS` and can pass `24:00:00`, up to `30:00:00`, for trips that started on the previous service day. Use the helpers in `src/utils/serviceTime.js`:
  - `edmontonNow()` (always Edmonton time, whatever the viewer's zone)
  - `timeToSeconds` / `secondsToTime`
  - `scheduleWindow` (adds the previous-day range)
  - `scheduledSecondsNear`
- **Service days live in `service_id`.** Its last 7 characters say which days the service runs, Monday to Sunday (`DX-008-Weekday-1-26-09-1111100` runs Monday to Friday). Schedule rows are *not* filtered by day, so always check with `serviceRunsOnDay(serviceId, weekday)` and `weekdayOf(dateString, days)`.
- **Service variants are one-off dates.** Weekday service comes in several variants per route (`Weekday-1`, `-3`, `-4` …), but calendar dates show that only one is the regular service. The others run on one or two special days (route 8's `Weekday-5` only on Truth and Reconciliation Day). Holidays reuse other services: Sunday service on Thanksgiving Monday, Saturday service on Remembrance Day. The route timetable uses calendar dates (`src/utils/serviceCalendar.js`). The stop page still goes by the `service_id` days alone, so its schedule-based answers are a best guess.
- **Schedule periods are in `service_id` too** (`schedulePeriod`). They come in four formats:
  - ETS: the year and month the schedule starts (`…-26-09-1111100` → `26-09`)
  - regional agencies: a season (`540-Weekday-1-BT-FAL26-1111100` → `FAL26`)
  - a few services (route 023R): a start date prefix per service (`20260914-Weekday-1-26-09-…`), which is part of the same `26-09` period
  - a six-digit `YYMMDD` is read in case the format changes
  
  As of October 2026 the feed holds only one period.
- Route ids are only unique within an agency, and regional buses (St. Albert, Spruce Grove …) share stops. So group by `` `${agency_name}|${route_id}` ``, and show the agency when it isn't `LOCAL_AGENCY` (Edmonton Transit Service).

### Query keys shared across pages

Reuse these keys, with the same `staleTime`, so pages warm each other's cache:

| Key | Data |
| --- | --- |
| `['routes']` | All routes |
| `['buses']` | `/bus/now` with `route_id` assigned (`useBuses`). The first load is slow, as it looks up every trip |
| `['buses-live']` | Raw `/bus/now` (`useLiveBuses`, `liveBusesQuery`) |
| `['trip-shape', tripId]` | `getTrip`, `staleTime: Infinity` |
| `['trip-stop-times', tripId]` | `getBusStopTimes`, `staleTime: Infinity` |
| `['stop-routes', stopId]` | Every route serving a stop, `staleTime: Infinity` |
| `['route-direction-stops', routeId, tripIds]` | Stop times for one trip per shape in a direction, `staleTime: Infinity` |
| `['stop-schedule', stopId, date, windowStart]` | Trips within about 2 h either side of now |
| `['stop-next-arrivals', stopId, date, …]` | Each route and service pattern's earliest arrival from a time |
| `['service-dates', routeId, serviceIds]` | Calendar dates for a route's services, `staleTime: Infinity` |

## Pages

### App shell (`App.vue`)
- There's no app bar, so `--v-layout-top` is 0. Pages that size to the screen subtract `--v-layout-top` and `--v-layout-bottom`.
- One `navSections` list feeds both menus. Items with a `tab` (Buses, Stops, Routes) are the main sections. The rest go under More on mobile.
- **Desktop:** a permanent sidebar, collapsed to icons (a rail) by default, with tooltips while railed. A Collapse/expand item at the bottom toggles it.
- **Mobile:** bottom tabs (Buses, Stops, Routes, More) and no sidebar. More opens a bottom sheet with the other pages. The Status page stays out of both menus.
- The selected tab comes from the path, so detail pages light up their section: `/stops/:id` → Stops, `/routes/:id` and `/trips/:id` → Routes, anything else but `/` → More. Buttons and items with `to` get an explicit `active`, because Vuetify otherwise uses the link's exact match.
- Detail pages have no back button. Mobile relies on the browser's back gesture.

### Main map (`/`, `HomePage.vue`, `NewBusMap.vue`)
- Live buses are shown as directional pin markers (`src/plugins/busIcon.js`), from `useBuses`. Coming back to the page draws the cached snapshot straight away.
- A locate button at the bottom right (same style as the stops map's) centres the map on the user at zoom 16 and draws a blue dot. A snackbar shows if the location can't be found.
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
- `getTripsByRouteId` loads every trip for the route (1,300 for route 8), without shapes. It used to cap at 500 with shapes, which dropped whole services and came to nearly 10 MB.
- **The page is split by direction.** A toggle under the heading lists each direction by its most common headsign (`directionLabels` in `src/utils/routes.js`), with a badge for its live bus count. It's hidden for one-direction routes. The map, the Active Buses and the timetable all follow it.
  - The direction is in the URL as `?direction=`. It's read on load and written back with `router.replace`, so reloads and shared links keep it. An unknown or missing value falls back to the first direction.
  - The trip page's route button and the main map's bus card (`BusDetails`) pass their trip's `direction_id`. The stop page doesn't, as a stop's route group can have buses going both ways.
  - Buses are matched to a direction through their trip, using the route's trips. Until those load, the buses are shown unsplit.
- A map (`TransitMap.vue`, see Shared UI) for the selected direction:
  - its stops and route lines, from one trip per `shape_id` (`representativeTrips`). The stops come from `getStopTimesByTripIds` on those trips. The lines come from their `['trip-shape', tripId]` queries, shared with the trip page and the bus cards. Tapping a stop opens `/stops/:id`
  - the direction's live buses as pins (`createBusIcon`), from `useBuses`. They have no report-age badges, because a route's worth of them clutters the map. Tapping a bus opens its trip
  - it fits once per direction (`fitKey`), so bus refreshes don't undo the user's panning
- Active Buses, one `RouteBusCard.vue` per bus in the direction, sorted by bus number. Like `BusDetails`, each card shows the headsign, "Bus N · X km/h", the On time / late / early chip, the next stop and its scheduled time (all from `useBusTrip`), and a "Trip details" button. Until `useBuses` loads, the cards show the handed-over buses, which have no position, speed or status yet.
- A timetable for the selected direction, from the route's calendar dates (`['service-dates', routeId, serviceIds]`):
  - **Default: today's exact date** (`servicesOnDate`), so it shows what's actually running. A date button opens a picker limited to the feed's dates. A "Special schedule on this date" chip shows when the date's services differ from a typical week, e.g. holidays.
  - **Weekday buttons** show a typical week in the selected schedule period (`regularServices`). That leaves out one-off services: a service is kept when it runs on at least half as many of that weekday's dates as the most frequent one. The buttons show nothing selected while an exact date is.
  - **A "Schedule" select** lists the periods (`schedulePeriods`) by date range, marked current or upcoming. It's hidden when there's only one. Picking a period switches to its typical week, and picking a date selects its period.
  - If the calendar fails to load, it falls back to the active-feed trips and the days in each `service_id` (`serviceRunsOnDay`), without the date button.
- In the timetable, PM times are bold. Each trip's header time and every time in its column link to `/trips/:id`, and each stop name links to `/stops/:id`. The time cells are plain `<a>` links routed by one delegated `openTripCell` handler on the `tbody`, because a `router-link` per cell would mean thousands of components.
- The timetable's header row sticks to the page just below the app bar, and the stop column sticks to the left. The page scrolls vertically and only the table's box scrolls sideways, so content added below the table scrolls normally.
  - CSS won't let a header inside the box stick to the page. Setting `overflow-x: auto`, `scroll` or `hidden` turns the other axis's `visible` into `auto`. That makes the box a scroll container in both directions, and sticky cells stick to it instead of the page. Only `clip` leaves `overflow-y` alone, but `clip` can't scroll.
  - So `useStickyTableHeader` (`src/composables/`) keeps a copy of the header row (`TimetableHeaderRow.vue`) in a sticky element above the box, at `top: var(--v-layout-top)` (0, as there's no app bar). Its columns are sized from the real header, which stays in the table with `visibility: hidden` to keep the layout. The copy's sideways scroll is kept in step with the box in both directions. The box is pulled up under the copy by the copy's height.
  - The copy and the box share a wrapper, so the header stops sticking where the table ends.
  - The columns are re-measured when the table resizes, or when its trips or stops change.
  - The table uses separate borders, because collapsed borders don't move with sticky cells. Its styles are in an unscoped `<style>` block under `.timetable-` classes, so they reach the header row component.
- There are no summary cards. The route id, the type (always bus) and the active-bus count were redundant and were removed.

### Trip details (`/trips/:tripId`, `TripDetails.vue`)
- The headsign, the service days and the start and end times.
- A route button: a small badge and the long name, linking to `/routes/:id`.
- A map (`TransitMap.vue`) with the route shape, stops coloured by lateness (tooltip: name, time, status), and the bus's latest recorded position as a bus pin. It fits once per trip, so the 60 s refetch doesn't re-zoom it. Tapping a stop opens its stop page.
- A stop list with scheduled and estimated times. Tapping a stop expands it to show its code, the other routes serving it (as badge chips), and a "Stop details" button.

### Others
- Electric and hydrogen bus finders and stats, the status page (disk stats), and About.

## Shared UI

- **`TransitMap.vue`**: the Leaflet map for the route and trip pages. Props:
  - `stops`: `{ stop_id, stop_name, lat, lon, color?, tooltip? }`. Drawn on a canvas, and tapping one opens `/stops/:id`
  - `buses`: `Bus[]` as `createBusIcon` pins, with no age badges. Tapping one opens its trip
  - `paths`: route lines, under the stops
  - `fitKey`: the map fits the stops and lines once per key, so data refreshes don't undo the user's panning

  Pages set the height with `--transit-map-height` (default 360px, or 280px on mobile).
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
