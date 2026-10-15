# bus-frontend spec

This is a reference for how the app works and why. It covers the pages, data sources, shared pieces and the conventions to follow. Keep it up to date when behaviour changes.

## Stack

- Vue 3 (`<script setup>`, JS with JSDoc types and `// @ts-check` in places), Vite 8, Vuetify 4, Vue Router 5
- TanStack Vue Query for all fetching and caching
- Leaflet maps with Mapbox tiles. The main map and the route, trip and bus pages share one map instance (see View transitions). Always import Leaflet from `src/plugins/leaflet.js`. A second copy (e.g. `leaflet/dist/leaflet`) replaces the global `L` and breaks plugins such as `AnimatedMarker`
- Vitest for unit tests, in `tests/`
- ESLint with `eslint-plugin-vue`. The pre-commit hook runs `npm run lint`

Scripts:
- `npm run dev`
- `npm run build`
- `npm run lint`, which lints `src/` and `tests/`
- `npm test`, which runs `vitest run`

The dev server proxies `/bus/…` and `/bus.db` to production (`vite.config.js`). Its pattern must not catch the app's own `/buses/…` pages.

Environment, from `.env` (see `.env.example`):
- `VITE_APP_API_URL`: the bus-data-collection backend
- `VITE_APP_SODA_APP_TOKEN`: the City of Edmonton open data token
- `VITE_APP_MAPBOX_ACCESS_TOKEN`

## Data sources

### Backend (`VITE_APP_API_URL`)

The backend describes itself in OpenAPI 3.1 at `/openapi.json` (locally `http://localhost:3000/openapi.json`). Check it before adding a backend call, as it has endpoints the app doesn't use yet. Errors are plain text. CORS only allows `bus.mattschlosser.me` and `localhost`.

| Endpoint | Used for |
| --- | --- |
| `/bus/now` | Live positions of every bus: `bus`, `lat`, `long`, `trip`, `timestamp` (epoch s), `bearing`, `speed` (m/s) |
| `/bus/trips/:tripId` | Recorded positions for a trip in the past 3 days, newest first (trip page without a date) |
| `/bus/trips/:tripId/:date` | The run of a trip that started on an Edmonton day (trip page with `?date=`): `start`/`end`, `points`, `buses`, `avgSpeed`/`maxSpeed`, and `positions`, oldest first. A run past midnight belongs to the day it started. 404 if no run started that day |
| `/routes/:routeId/trips/:date` | The trips of a route we recorded on an Edmonton day (trip picker): `trips` of `trip`, `start`/`end` (epoch s), `points`, `buses`, oldest first. Route ids are GTFS ones (`008`). Only trips with positions are listed, and a run belongs to the day it started |
| `/bus/electric`, `/bus/hydrogen` | Bus finders |
| `/bus/stats/{electric,hydrogen}/{hourly,daily}`, `/bus/stats/disk` | Stats and status pages |
| `/bus/:busId` | One bus (bus page): `latest` position, `firstSeen`/`lastSeen` (epoch s), and `active` (reported in the last 2 minutes). 404 if never seen. Bus ids are usually numbers, but not always |
| `/bus/:busId/recent-trips?from=&to=` | A bus's trips, newest first (bus page): `trip`, `start`/`end` (first and last position, epoch s), `points`, `avgSpeed`/`maxSpeed`. Either `from`/`to`, Edmonton days (`YYYY-MM-DD`, inclusive, at most 7 days, `limit` default 1000), or `hours` back (up to 168, default 24, `limit` default 50). `limit` is at most 1000. A trip in a range only includes its positions inside it. A trip splits after a 30 min gap, so a trip id run on several days appears once per day. Out-of-service stretches have an empty or null `trip` |
| `/bus/:busId/trip-counts?by=&from=&to=` | Trips a bus started per `day`, `week` (Monday–Sunday) or `month`, oldest first, every period listed (0 when none): `period` (its first day), `start`, `trips`. `from` is moved back to the start of its week or month. At most 366 days |
| `/bus/:date/:time[/:spread]`, `/bus/stats/speed[/:bus]`, `/bus.db` | Not used yet: positions around an Edmonton time, daily speeds, and the whole SQLite database |

`/bus/now` is a snapshot the backend takes about every 30 s. `nextBusRefreshDelay` (`src/utils/busRefresh.js`) times each refetch for when the next snapshot should be ready, and backs off if the collector looks stalled.

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
| `greh-g7ac` (grouped) | `getTripStartTimes`: each trip's earliest departure, for the trip page's trip picker |
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
| `['bus', busId]` | `/bus/:busId` |
| `['bus-trips-week', busId, weekStart]` | `/bus/:busId/recent-trips` for one Sunday–Saturday week. `staleTime: Infinity` for past weeks |
| `['bus-trip-counts', busId, by, from, to]` | `/bus/:busId/trip-counts`, `staleTime` 5 min |
| `['trip-run', tripId, date]` | `/bus/trips/:tripId/:date`. `staleTime: Infinity` before yesterday, as a run can go past midnight |
| `['route-trips', routeId]` | Every trip of a route, without shapes (`getTripsByRouteId`) |
| `['route-day-runs', routeId, date]` | `/routes/:routeId/trips/:date`. `staleTime: Infinity` before yesterday, else 60 s, refetched every 60 s for today |
| `['trip-start-times', tripIds]` | Each trip's first departure (`getTripStartTimes`), `staleTime: Infinity` |
| `['trip-summaries', tripIds]` | Route, headsign and direction of several trips (`getTripSummaries`), `staleTime: Infinity` |

## Pages

### App shell (`App.vue`)
- There's no app bar, so `--v-layout-top` is 0. Pages that size to the screen subtract `--v-layout-top` and `--v-layout-bottom`.
- One `navSections` list feeds both menus. Items with a `tab` (Buses, Stops, Routes) are the main sections. The rest go under More on mobile.
- **Desktop:** a permanent sidebar, collapsed to icons (a rail) by default, with tooltips while railed. A Collapse/expand item at the bottom toggles it.
- **Mobile:** bottom tabs (Buses, Stops, Routes, More) with large 32px icons in a 76px bar and no sidebar. More opens a bottom sheet with the other pages. The Status page stays out of both menus.
- The selected tab comes from the path, so detail pages light up their section: `/buses/:id` → Buses, `/stops/:id` → Stops, `/routes/:id` and `/trips/:id` → Routes, anything else but `/` → More. Buttons and items with `to` get an explicit `active`, because Vuetify otherwise uses the link's exact match.
- Detail pages have no back button. Mobile relies on the browser's back gesture.

### Main map (`/`, `HomePage.vue`, `NewBusMap.vue`)
- Live buses are shown as directional pin markers (`src/plugins/busIcon.js`), from `useBuses`. Coming back to the page draws the cached snapshot straight away, flies back to the view the user left, and reselects the bus they had selected if it's still in the snapshot (the card or sheet opens with its latest position).
- A locate button at the bottom right (same style as the stops map's) centres the map on the user at zoom 16 and draws a blue dot. A snackbar shows if the location can't be found.
- Tapping a bus highlights its route and opens `BusDetails.vue`. On desktop that's a left panel, on mobile a bottom sheet.
- The mobile bottom sheet is full width and non-modal: there's no scrim, so the map can still be panned and zoomed while it's open. Tapping empty map closes it, and tapping another bus switches it to that bus.
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
- **Heading:** the route header pattern (a large badge, the route's long name as the title, and a chevron), linking to `/routes/:id?direction=` with the trip's direction. Under it, small subtext: the headsign, the service days, the start and end times, and "Trip N · Bus N" (the bus from the latest recorded position, linking to the bus page).
- If the trip isn't in the feed (`getTrip` gives null, as for an old trip that's no longer scheduled), the page just says "Trip N not found."
- **Day:** a `DayPicker` under the heading picks which day's run is shown, in the URL as `?date=` (written with `router.replace`, and read again on back and forward).
  - Without `?date=` the page shows the latest recorded run, from `/bus/trips/:tripId` split at 30 min gaps. The positions come newest first, so the run is picked by its times. The picker shows the day that run started, or today. It refetches every 60 s while the run is active.
  - With a past or today's date it uses `/bus/trips/:tripId/:date`. A 404 keeps the schedule and map, with grey stops and no estimates, under "Not recorded on Wed, Oct 14" (or "Hasn't run yet today").
  - A future date makes no backend request. It shows the scheduled times only, and the subtitle says "Not run yet" instead of the bus.
  - Only days the route runs can be picked, from the calendar dates of all its services (`['service-dates', routeId, serviceIds]`, shared with the route page), up to the last date in the feed. Days before the calendar starts stay pickable, back about a year, as older feeds aren't in it. If the calendar fails, any day from a year back to 60 days ahead can be picked.
  - Picking a day this trip doesn't run on (a Saturday for a weekday trip) jumps, with `router.replace`, to the trip starting nearest to this one's start (`nearestByStart`).
- **Trip picker:** a `TripPicker` beside the day picker steps through the route's trips going the same direction on the picked day.
  - The day's trips (`tripsOnDate`, `src/utils/dayTrips.js`) are the route's trips (`['route-trips', routeId]`, shared with the route page) in that direction whose `service_id` runs on the date. Without calendar dates for it, the days in each `service_id` are used, within the trip's schedule period.
  - They're ordered by their first departure (`['trip-start-times', tripIds]`, `getTripStartTimes`). Past-midnight starts sort last.
  - Trips we recorded that day (`['route-day-runs', routeId, date]`) get a green `mdi-access-point` icon in the menu, and beside the label when it's the shown trip. Future days make no request.
  - Previous and next buttons, and a menu of start times, go to `/trips/:id?date=` with `router.push`, so back returns to the last trip.
  - The page reacts to `tripId` changing, as the router reuses it. The expanded stop resets.
  - **Switching keeps what's known.** The trip, shape, stop times and run queries use `placeholderData: keepPreviousData`. While any is still the previous trip's or day's (`switching`), the route header, pickers and map stay, the headsign/times lines become a skeleton and the stop list says "Loading...". The map draws a snapshot of the last settled trip, and fits the new one once it arrives (its `fitKey` is the loaded trip's id).
- A map (`TransitMap.vue`) with the route shape, stops coloured by lateness (tooltip: name, time, status), and the bus's latest recorded position as a bus pin. Stop colours follow `scheduleStatus`, so they match the chips. It fits once per trip, so the 60 s refetch doesn't re-zoom it. Tapping a stop opens its stop page.
- The map renders while the page loads, so it's there for the view transition from the main map. The trip and its stop times use the bus card's `['trip-shape']` and `['trip-stop-times']` keys, so coming from a card the heading and map show straight away, with "Loading..." below the map until the run loads.
- **Stops** are rows in one outlined card, like the stop page's cards (no `v-list`, so nothing gets clamped on mobile):
  - left: the stop name (wraps) and "Stop N"
  - right: the scheduled time, large, and when there's a recorded position within 1 km, "Actual ≈ time" and an On time / late / early chip (`scheduleStatus`)
  - Tapping a row expands it to show the other routes serving the stop (as badge chips) and a full-width "Stop details" button.
- **Actual times** come from `estimateStopArrivals` (`src/utils/stopEstimates.js`, unit tested), using the latest run of recorded positions (split on 30-minute gaps). A stop's time is that of the nearest position within 1 km, among positions no earlier than the previous stop's time. Without that floor, a loop's last stops matched positions from the start of the trip and showed earlier times than the stops before them.
- Each stop's estimate is worked out once per render in `stopRows`, which the list and the map share.

### Bus details (`/buses/:busId`, `BusDetailsPage.vue`)
- Reached from any bus id (`BusLink`, see Shared UI).
- **Heading:** "Bus N", a "Live" chip while `active`, otherwise "Last seen 3h 5m ago" (amber, grey past an hour), an Electric chip for 8000–8999, and "Tracked since" the first sighting.
- A map (`TransitMap` with `showAge` and `followBus`) of the bus's latest position, with the route line and stops of its current trip, or the last trip it ran if it's out of service (or the expanded trip, see below). It centres on the bus at zoom 16 and flies to it whenever the position changes. The pin's age badge goes amber past 5 minutes, and past an hour the badge and pin go grey. The map renders while the bus loads, for the view transition from the main map.
- `['bus', busId]` refetches with `nextBusRefreshDelay` while the bus is active, and every 60 s otherwise. The current week's trips refetch when `lastSeen` changes.
- **Activity:** trip counts from `/bus/:busId/trip-counts` as a bar chart (`TripCountsChart`), with a Day / Week / Month toggle in the URL as `?stats=` (left off for Day). It covers the last 30 days, 12 weeks or 12 months (`tripCountsRange`, `src/utils/tripCounts.js`), starting no earlier than the first sighting. Above it, the total and the average per period (`summarizeCounts`), which leaves out the current period and any the bus was first seen partway through. Tapping a day's bar shows its week's trips and scrolls to them. Week bars aren't tappable, as the backend's Monday weeks don't line up with the Sunday trip weeks. The counts refetch when `lastSeen` changes.
- **Trips** are shown a week at a time, Sunday to Saturday (`src/utils/weeks.js`), picked with `WeekPicker` (see Shared UI). The current week is the default. The week's Sunday is in the URL as `?week=`, read on load and written back with `router.replace`, and left off for the current week. A future or invalid week falls back to the current one. Changing week collapses the expanded row. The trips are fetched with `from`/`to`, newest first, grouped under Today / Yesterday / "Monday, Oct 12" (`tripDayLabel`, Edmonton days). Each row is a route badge and the headsign without its route number (`headsignWithoutRoute`, so "4 University" reads "University" beside the 4 badge), the route's long name below, and the first-to-last seen times (`formatTripTimes`). The running trip ends in "now" with a Now chip (only in the current week). An empty week shows "No trips this week" or "No trips in the week of Oct 4". Trips not in the current feed show "Trip N", and out-of-service stretches show "Not in service".
  - The rows are in outlined cards like the trip page's stops, with no chevron. Tapping one expands it (one at a time, kept open through refreshes by `rowKey`, the trip and start time). It shows how long the bus was seen on it (`formatTripDuration`, "so far" while running), the average and top speed in km/h, how many positions were recorded, the trip id, and a full-width "View trip" button to `/trips/:id?date=` with the day the trip started (`edmontonDate`), so the trip page shows this run, disabled once the trip summaries have loaded without it (it's no longer in the schedule, so the trip page would say not found).
  - While a trip with an id is expanded, the map shows that trip's route line and stops, and stops following the bus to fit them (`fitKey` is the trip). Collapsing it goes back to following the bus on its own trip. When the bus isn't on a trip, the map shows the newest trip of the current week, but not of an older week being browsed.
- No record of the bus shows "Bus N hasn't been seen".

### Others
- Electric and hydrogen bus finders and stats, the status page (disk stats), and About.

## Shared UI

- **`TransitMap.vue`**: the Leaflet map for the route and trip pages. Props:
  - `stops`: `{ stop_id, stop_name, lat, lon, color?, tooltip? }`. Drawn on a canvas, and tapping one opens `/stops/:id`
  - `buses`: `Bus[]` as `createBusIcon` pins, with no age badges. Tapping one opens its trip, if it's on one
  - `paths`: route lines, under the stops
  - `fitKey`: the map fits the stops and lines once per key, so data refreshes don't undo the user's panning
  - `showAge`: label pins with their report age, ticking every second
  - `followBus`: centre on the first bus and fly to it as it moves, instead of fitting the stops. Turning it off fits the stops and lines, and turning it back on re-centres on the bus

  - when the shared map comes straight from another page, its first fit (or centring on the bus) flies there instead of jumping, unless reduced motion is preferred

  Pages set the height with `--transit-map-height` (default 360px, or 280px on mobile).
- **`WeekPicker.vue`**: picks a Sunday–Saturday week. `v-model` is the week's Sunday (`YYYY-MM-DD`), and `min`/`max` limit it to days the data can cover. Vuetify has no week picker, so it's previous/next buttons around a label ("This week", "Last week", "Oct 4 – 10"). The label opens a `v-date-picker` with the week's 7 days selected (`multiple`), so the whole week is highlighted. Tapping any day picks its week. Week numbers are hidden on phones, where they make the picker too wide.
- **`DayPicker.vue`**: picks a day, like `WeekPicker`. `v-model` is `YYYY-MM-DD`, with `min`, `max`, `today` (for the label) and an `allowed(date)` function. The label reads "Today", "Yesterday", "Tomorrow" or "Wed, Oct 14" (`formatDayLabel`), and opens a `v-date-picker`. Previous/next jump to the nearest allowed day.
- **`TripPicker.vue`**: picks one of a day's trips, like `DayPicker`. `trips` are `{trip_id, start}` earliest first, `current` is the shown trip's id, `recorded` is a `Set` of trip ids to mark as recorded, and it emits `select` with a trip id. Previous/next buttons around a label with the current start time ("8:15 AM"), which opens a list of start times scrolled to the current one.
- **`TripCountsChart.vue`**: a Chart.js bar chart of `TripCount`s for a `by` period, in the theme's primary colour, with "Wed, Oct 14" / "Week of Oct 12" / "October 2026" tooltips. With `clickable` it emits `select` with a bar's period. 200px tall, 160px on phones.
- **`BusLink.vue`**: the only way to show a bus id. A `router-link` to `/buses/:id` reading "Bus N" (the slot overrides the text), with a faint underline. It stops click propagation, so it works inside tappable rows. Used on the map's bus card, Active Buses cards, stop page bus rows, the trip page, and the electric and hydrogen finders. The routes list's bus chips link to the bus page too.
- **Report ages** (`src/utils/reportAge.js`): `formatReportAge` gives "52s ago", "4m 12s ago", "3h 5m ago", "2d ago", and the date past a week. `reportAgeLevel` gives fresh, stale (over 5 min) or old (over 1 h).
- **`RouteBadge.vue`**: the only way to show a route number. A filled primary pill showing `routeNumber(routeId)`, in sizes `small`, `default` and `large`. Attributes pass through to the root, so callers can add `style` and `class`.
- **Full-width actions** use `<v-btn block variant="tonal" color="primary">`, as with "Trip details" and "Stop details".
- **Route header pattern:** a badge, the long name, and an `mdi-chevron-right` to the route page, in a `.route-header` link with a hover tint.

## View transitions

These use the same-document View Transitions API (`src/utils/viewTransition.js`). The timing is set globally in `App.vue`: `::view-transition-group(*)`, 300 ms ease. None play when reduced motion is preferred (`prefersReducedMotion`) or the API is missing.

### Shared map (main map, trip, bus and route pages)

- **One map instance** (`src/plugins/sharedMap.js`). `NewBusMap` and `TransitMap` don't create maps. They draw their layers on one Leaflet map, which `attachSharedMap(container, release)` moves into the page and `detachSharedMap(token)` takes out. So tiles stay loaded between pages, and the map can fly from one page's view to the next. Only one page may show it at a time. The stops page keeps its own `StopsMap`.
  - It has the tile layer (`minZoom` 9, no tile bounds, so regional routes keep their tiles) and one `routePane` at z-index 350 for route lines. Each page puts its layers in groups and removes them when it leaves.
  - `invalidateSize` keeps the centre, so after a move the new box shows the same place. A `ResizeObserver` calls it when the box resizes, e.g. when the main map's bus panel opens.
  - `handedOver` is true when the map comes straight from another page in the same render. The page then flies to its view (0.8 s) instead of jumping.
  - The main map remembers its view and selected bus when it leaves (`rememberedHomeView`). Coming back flies to that view and reselects the bus without fitting its route.
- **The transition**: `installMapTransitions(router)` (in `main.js`) starts a view transition from `router.beforeResolve` on any navigation between two different pages of `Home`, `Trip Details`, `Bus Details` and `Route Details`. The same page with new params or query (another direction or week) keeps its map and doesn't transition. That covers every link (the bus card's buttons, bus links, route headers, the route page's bus pins, Active Buses cards and timetable, tabs, the sidebar) and back and forward, so the transition also plays in reverse. The navigation carries on once the old page is captured, and the new page is captured after `afterEach` and `nextTick`.
  - It's skipped on the first navigation, while another transition is running (such as `navigateWithTransition`), and on back or forward when the browser already animated a swipe (`PopStateEvent.hasUAVisualTransition`).
  - The map's element is always named `shared-map`. Its old and new images use `object-fit: cover` with `height: 100%`, so the box morphs by cropping around the centre rather than stretching. The map flies at the same time, as the new image is live.
  - The map must be in the DOM on the page's first render, so the trip and bus pages show it while they load.
  - New pages start at the top (the router's `scrollBehavior`), so the map is in view. Back and forward return to the saved position, and query-only changes don't scroll.
- **Names that morph with the map:**
  - `route-number` and `route-name`: always set on the route page's heading and the trip page's heading
  - `bus-${bus}`: always set on the route page's Active Buses cards, the trip page's bus link and the bus page's "Bus N" heading
  - the main map's bus card sets all three only once one of its links is tapped (route header, "Trip details", bus link). It goes away with the page, so it never clashes with another page's names
  - each name must be unique on a page, so pages with many routes or buses (the bus page's trip rows) don't name them

### Route page (route list, stop page or map → route page)

- `navigateWithTransition(router, to)` wraps `router.push` in `document.startViewTransition`, waiting for the lazy route to load and then `nextTick`.
- `transitionLinkClick(event, router, to, setNamed)` is the click handler for a `<router-link custom>` + `<a :href>`. It leaves modifier and middle clicks to the browser, so they still open new tabs. It switches the caller's names on before the old page is captured and off afterwards.
- **Names:** `route-number` (badge), `route-name` (long name) and `bus-${bus}` (bus label → Active Buses chip). Every name must be unique on the page, so the source side only sets names on the tapped route. The route page always sets them (see the names above).
- **Handoff:** the source passes `history.state = { routeLongName, buses: [{ bus, trip }] }`. The route page shows these until its own `routes` and `buses` queries load, so the new snapshot has something to morph into.
- The routes list's chevron button does the same for `route-number` and `route-name` (only the tapped row is named), passing just `routeLongName` in history state.
- From the routes list and the stop page these only morph going forward. To and from the map pages, the shared-map transition covers both directions.

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
