# bus-frontend spec

This is a reference for how the app works and why. It covers the pages, data sources, shared pieces and the conventions to follow. Keep it up to date when behaviour changes.

## Stack

- Vue 3 (`<script setup>`, JS with JSDoc types and `// @ts-check` in places), Vite 8, Vuetify 4, Vue Router 5
- Vuetify components and directives are imported as the templates use them (`vite-plugin-vuetify` with `autoImport`), so `src/plugins/vuetify.js` doesn't register them all. That keeps the main chunk around 130 kB instead of nearly 700 kB
- TanStack Vue Query for all fetching and caching
- Leaflet maps with Mapbox tiles. The main map and the route, trip and bus pages share one map instance (see View transitions). Always import Leaflet from `src/plugins/leaflet.js`. A second copy (e.g. `leaflet/dist/leaflet`) replaces the global `L` and breaks plugins such as `AnimatedMarker`. `src/plugins/leaflet.js` also imports Leaflet's CSS, so the stylesheet always matches the installed version, and adds the touch and scroll gestures in `src/plugins/mapGestures.js` (see Map gestures) to every map
- Vitest for unit tests, in `tests/`
- Playwright for browser smoke tests, in `e2e/`, against a fake feed (see Conventions)
- ESLint with `eslint-plugin-vue`. The pre-commit hook runs `npm run lint`

Scripts:
- `npm run dev`
- `npm run build`
- `npm run lint`, which lints `src/`, `tests/` and `e2e/`
- `npm test`, which runs `vitest run`
- `npm run test:e2e`, which builds the app and runs the Playwright smoke tests (`playwright.config.js`)

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
| `/bus/now` | Live positions of every bus: `bus`, `lat`, `long`, `trip`, `route` (GTFS route id, from the realtime feed), `timestamp` (epoch s), `bearing`, `speed` (m/s) |
| `/bus/trips/:tripId` | Recorded positions for a trip in the past 3 days, newest first (trip page without a date) |
| `/bus/trips/:tripId/:date` | The run of a trip that started on an Edmonton day (trip page with `?date=`): `start`/`end`, `points`, `buses`, `avgSpeed`/`maxSpeed`, and `positions`, oldest first. A run past midnight belongs to the day it started. 404 if no run started that day |
| `/routes/:routeId/trips/:date` | The trips of a route we recorded on an Edmonton day (trip picker, route timetable): `trips` of `trip`, `start`/`end` (epoch s), `points`, `buses`, oldest first. Route ids are GTFS ones (`008`). Only trips with positions are listed, and a run belongs to the day it started |
| `/bus/electric`, `/bus/hydrogen` | Bus finders: the latest position of each electric bus (8000–8999), or of the hydrogen bus (6016), reported in the last 2 minutes. Same fields as `/bus/now` |
| `/bus/stats/{electric,hydrogen}/{hourly,daily}`, `/bus/stats/disk` | Stats and status pages |
| `/bus/:busId` | One bus (bus page): `latest` position, `firstSeen`/`lastSeen` (epoch s), and `active` (reported in the last 2 minutes). 404 if never seen. Bus ids are usually numbers, but not always |
| `/bus/:busId/recent-trips?from=&to=` | A bus's trips, newest first (bus page): `trip`, `start`/`end` (first and last position, epoch s), `points`, `avgSpeed`/`maxSpeed`. Either `from`/`to`, Edmonton days (`YYYY-MM-DD`, inclusive, at most 7 days, `limit` default 1000), or `hours` back (up to 168, default 24, `limit` default 50). `limit` is at most 1000. A trip in a range only includes its positions inside it. A trip splits after a 30 min gap, so a trip id run on several days appears once per day. Out-of-service stretches have an empty or null `trip` |
| `/bus/:busId/trip-counts?by=&from=&to=` | Trips a bus started per `day`, `week` (Monday–Sunday) or `month`, oldest first, every period listed (0 when none): `period` (its first day), `start`, `trips`. `from` is moved back to the start of its week or month. At most 366 days |
| `/stop-times/stats/trips/:tripId/:seq` | How late one trip was at one of its stops (by `stop_sequence`) over the last 7 days up to yesterday (trip page's stop details): `from`/`to`, `count` (one per day it ran), `mean`/`min`/`max` delay in seconds (null without times), and `histogram` of `{minutes, count}` by whole minutes rounded down, only the minutes with times, -10 and 30 holding anything past them. A delay is when the bus was 25 m past the stop (the trip page's estimate) minus the scheduled arrival, worked out nightly, so today isn't in it |
| `/stop-times/stats/routes/:route/stops/:stopId?seq=` | The same for every trip of a route at a stop, plus `trips`, the distinct trips counted. `seq` only counts one visit, for a stop a trip passes twice |
| `/stop-times/routes/:route/:date` | When the bus went by the stops of every trip of a route on a service day (route timetable's actual times): `trips` of `trip` and `stops` as `[seq, delay]`, by `stop_sequence`, delay in seconds. Worked out nightly like the stats, so today has none. A day without any is an empty `trips` |
| `/stop-times/stats/routes/:route/stops` | The same for every stop of a route at once (route page's stops list): `route`, `from`/`to`, and `stops` of `stop`, `trips`, `count`, `mean`/`min`/`max` and `histogram`. A stop a trip passes twice counts both visits. Cached for an hour |
| `/bus/:date/:time[/:spread]`, `/bus/stats/speed[/:bus]`, `/bus.db`, `/stop-times/trips/:tripId/:date` | Not used yet: positions around an Edmonton time, daily speeds, the whole SQLite database, and a run's stored stop times |

`/bus/now` is a snapshot the backend takes about every 30 s. `nextBusRefreshDelay` (`src/utils/busRefresh.js`) times each refetch for when the next snapshot should be ready, and backs off if the collector looks stalled.

Only read `/bus/now` through `src/composables/useBuses.js`:
- `useLiveBuses()` / `liveBusesQuery` gives the raw snapshot.
- `useBuses()` gives the snapshot with `route_id` on each bus, copied from its `route`.

Both read `['buses-live']`, with `nextBusRefreshDelay` for their `staleTime` and `refetchInterval`. So every page shares one cached snapshot, and there's at most one request per backend snapshot. `useBuses` adds `route_id` with a `select` that returns copies, so the shared snapshot isn't changed. Live buses need no trip lookups in the open data, as `/bus/now` already has each bus's route.

### City of Edmonton open data (SODA, `data.edmonton.ca/resource/<id>.json`)

| Dataset | Contents |
| --- | --- |
| `4vt2-8zrq` | Bus stops |
| `d577-xky7` | Routes |
| `isug-45sj` | Agencies: name, website, fares page, phone |
| `ctwr-tvrd` | Trips, including `geometry_line`, the trip's route shape |
| `greh-g7ac` | Stop times per trip |
| `4fvt-p2se` | Stop schedule view. It joins stop times with trip and route and has `feed_start_date`/`feed_end_date`. Always filter it to the feed active today. It has no `direction_id` |
| `greh-g7ac` (grouped) | `getTripStartTimes`: each trip's earliest departure, for the trip page's trip picker |
| `f2sy-bth7` | Calendar dates: every date each service runs (`exception_type` 1), for every agency. `getServiceDates` |
| `5yvt-mcye` | Service disruption alerts (detours, stop closures), for every agency. `getServiceAlerts` fetches all that ended in the last week or haven't, a few hundred rows. See Service alerts below |

SODA queries escape single quotes in ids to prevent SoQL injection.

### Service alerts (`5yvt-mcye`, `src/utils/serviceAlerts.js`)

- **One row per alert, route and period.** An alert on several routes repeats per route, and one that recurs (a detour 7 AM–6 PM on 18 days) repeats per period. `groupAlerts` merges them into one alert per `alert_id` with `routeIds`, `stopIds` and sorted `periods`.
- `route_id` is the GTFS one (`"008"`, `"A6"`). `stop_id` is a comma-separated list of GTFS stop ids, the stops closed, moved or skipped. It's empty when the whole route is affected.
- `start_dttm`/`end_dttm` are Edmonton local time without a zone. They're kept as `YYYY-MM-DDTHH:MM:SS` strings, which compare correctly as text (`edmontonLocal`, `nowLocal`). An end in the year 3000 means until further notice and becomes `null`.
- `direction_id` is always 0, `severity_level` always `WARNING` and `is_deleted` always false, so they're ignored. A direction is told apart by its stops instead: an alert naming stops only applies to directions serving one of them.
- `effect` is `DETOUR`, `STOP_MOVED` or `MODIFIED_SERVICE` (`effectLabel`).
- Expired alerts drop out of the dataset after a while, so past days on the trip page may show none.
- **Stops on maps:** a stop named by an alert in effect gets an amber ring (`DISRUPTION_RING_STYLE`) and the effect in its tooltip. On the route page that's the route's own alerts (`disruptedStops(alerts, now, routeId)`), on the stops map any route's, and on the trip page the trip's (`alertsForTrip`). It's a ring rather than a fill so it sits around the trip page's lateness colours.

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
| `['agencies']` | The GTFS agencies with website, fares page and phone (`getAgencies`), `staleTime: Infinity` |
| `['route-agencies']` | Each route's agency in the active feed (`getRouteAgencies`), `staleTime: Infinity` |
| `['buses-live']` | `/bus/now` (`useLiveBuses`, `liveBusesQuery`, and `useBuses` with `route_id` added) |
| `['trip-shape', tripId]` | `getTrip`, `staleTime: Infinity` |
| `['trip-stop-times', tripId]` | `getBusStopTimes`, `staleTime: Infinity` |
| `['stop-headsigns', stopIds]` | Each route's headsigns and trip counts at a stop, or at every stop of its station (`getStopHeadsigns`), `staleTime: Infinity` |
| `['stop-routes', stopId]` | Every route serving a stop, `staleTime: Infinity` |
| `['rail-stops']` | Every stop an LRT route serves (`getRailStopIds`), for the stops page's filter, `staleTime: Infinity` |
| `['route-direction-stops', routeId, tripIds]` | Stop times for one trip per shape in a direction, `staleTime: Infinity` |
| `['stop-schedule', stopId, date, windowStart]` | Trips within about 2 h either side of now |
| `['stop-next-arrivals', stopId, date, …]` | Each route and service pattern's earliest arrival from a time |
| `['service-dates', routeId, serviceIds]` | Calendar dates for a route's services, `staleTime: Infinity` |
| `['rail-service-dates', serviceIds]` | Calendar dates for the LRT services in a stop's schedule window, `staleTime: Infinity` |
| `['bus', busId]` | `/bus/:busId` |
| `['bus-trips-week', busId, weekStart]` | `/bus/:busId/recent-trips` for one Sunday–Saturday week. `staleTime: Infinity` for past weeks |
| `['bus-trip-counts', busId, by, from, to]` | `/bus/:busId/trip-counts`, `staleTime` 5 min |
| `['trip-run', tripId, date]` | `/bus/trips/:tripId/:date`. `staleTime: Infinity` before yesterday, as a run can go past midnight |
| `['route-trips', routeId]` | Every trip of a route, without shapes (`getTripsByRouteId`) |
| `['route-day-runs', routeId, date]` | `/routes/:routeId/trips/:date`, as a `Set` of trip ids (`useRecordedTrips`, or `useRecordedTripsQuery` with whether it has loaded). `staleTime: Infinity` before yesterday, else 60 s, refetched every 60 s for today. No request for future days |
| `['trip-start-times', tripIds]` | Each trip's first departure (`getTripStartTimes`), `staleTime: Infinity` |
| `['trip-summaries', tripIds]` | Route, headsign and direction of several trips (`getTripSummaries`), `staleTime: Infinity` |
| `['finder-buses', kind]` | `/bus/electric` or `/bus/hydrogen`, timed with `nextBusRefreshDelay` like `/bus/now` |
| `['trip-stop-stats', tripId, seq]`, `['route-stop-stats', routeId, stopId, seq]` | A week of delays at a stop (`getTripStopStats`, `getRouteStopStats`), `staleTime` 1 h as they're worked out nightly. `seq` is null for the route unless the trip passes the stop twice |
| `['route-stop-times', routeId, date]` | A route's actual stop times on a day (`getRouteStopTimes`), `staleTime` 1 h, only fetched in the timetable's Actual mode on a past date, or on a route's page for a stop |
| `['route-stops-stats', routeId]` | A week of delays at every stop of a route (`getRouteStopsStats`), `staleTime` 1 h |
| `['stop-route-schedule', stopId, routeId, agency]` | Every time a route is scheduled at a stop, on all its services (`getStopRouteSchedule`), `staleTime: Infinity` |
| `['service-alerts']` | Every recent service alert, grouped (`useServiceAlerts`), `staleTime` and refetch 5 min. A failure shows no alerts |

## Pages

### App shell (`App.vue`)
- There's no app bar, so `--v-layout-top` is 0. Pages that size to the screen subtract `--v-layout-top` and `--v-layout-bottom`.
- One `navSections` list feeds both menus. Items with a `tab` (Buses, Stops, Routes) are the main sections. The rest go under More on mobile.
- **Desktop:** a permanent sidebar, collapsed to icons (a rail) by default, with tooltips while railed. A Collapse/expand item at the bottom toggles it.
- **Mobile:** bottom tabs (Buses, Stops, Routes, More) with large 32px icons in a 76px bar and no sidebar. More opens a bottom sheet with the other pages. The Status page stays out of both menus.
- The selected tab comes from the path, so detail pages light up their section: `/buses/:id` → Buses, `/stops/:id` → Stops, `/routes/:id` and `/trips/:id` → Routes, anything else but `/` → More. Buttons and items with `to` get an explicit `active`, because Vuetify otherwise uses the link's exact match.
- Detail pages have no back button. Mobile relies on the browser's back gesture.
- **Tab titles** are the most specific part first, then the site name, joined with " · " (`pageTitle`, `src/utils/pageTitle.js`): "Route 8 · Abbottsfield - Downtown - University · Edmonton Bus Tracker". The main map is the site name alone.
  - Every route has a `meta.title`, a string or a function of the route ("Bus 4699", "Trip 32755477"), which the router's `afterEach` sets.
  - Pages that load a better name refine it with `usePageTitle(() => parts)` (`src/composables/`): the route page adds the long name, the stop page the stop name ("109 Street & Kingsway · Stop 1987"), and the trip page leads with the headsign ("8 Abbottsfield · Trip 32755477", left out while it's the previous trip's placeholder). It runs after `afterEach`, and again when the router reuses the page for new params or query.
- **Icon:** a white bus front on a primary (`#3f51b5`) rounded square. `public/favicon.svg` is the source, and `favicon.ico` (16, 32 and 48 px) and the 180 px `apple-touch-icon.png` are rendered from it. `theme-color` is the same primary.

### Main map (`/`, `HomePage.vue`, `NewBusMap.vue`)
- Live buses are shown as directional pin markers (`src/plugins/busIcon.js`), from `useBuses`. Coming back to the page draws the cached snapshot straight away and flies back to the view the user left. Only a back or forward step also reselects the bus they had selected, if it's still in the snapshot (the card or sheet opens with its latest position); the Buses tab or a link opens the map with nothing selected (`navigatingByHistory` in `sharedMap.js`, set from the router's history listener).
- A locate button at the bottom right (same style as the stops map's) centres the map on the user at zoom 16 and draws a blue dot. A snackbar shows if the location can't be found.
- Tapping a bus highlights its route and opens `BusDetails.vue`. Other routes' buses are hidden (`bus-marker-icon--hidden`, `visibility: hidden`, so they can't be tapped or focused either) until it's closed, leaving the bus and the rest of its route's buses. The route comes from the live bus's `route_id`, not its trip query, so switching buses doesn't show every bus while the new trip loads. `AnimatedMarker` eases only `transform` while a bus moves: easing `all` also delayed the hidden class until the move ended, so buses flashed on each refresh. On desktop that's a left panel, on mobile a bottom sheet.
- The mobile bottom sheet is full width and non-modal. Its swipe-down `touchmove` isn't passive and cancels the browser's default while dragging, and the root's `overscroll-behavior-y` is `none` while it's open, so Chrome doesn't take the swipe as pull to refresh.
- The sheet is non-modal: there's no scrim, so the map can still be panned and zoomed while it's open. Tapping empty map or swiping down on the sheet (when its content is scrolled to the top) closes it, and tapping another bus switches it to that bus. However it closes, the map lets go of the bus (`NewBusMap` exposes `clearSelection`), so its route line goes and every bus shows again.
- **BusDetails** shows:
  - a route header: the badge, the headsign without the route number as the title (where the bus is going, which the route's name doesn't say), the route's long name in small text under it, and a chevron to `/routes/:id`
  - service disruptions on the bus's route in effect for the rest of its run (`restOfTripWindow`, now to its last scheduled stop) that name one of its stops or none (`alertsForTrip`, like the trip page), as `ServiceAlertCard`s under the header
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
- Map, search, and a stop list. Picking a stop opens its details.
- **Stop list:** a left panel on desktop and under the map on mobile, shown until a stop is picked. Rows are in one outlined card like the routes list's (no `v-list`): an icon, the name, "Stop N" (or "4 bays", "2 platforms"), a warning icon when an alert in effect names one of its stops, and the distance from the map's centre (`formatDistance`). By default it's the 20 stops nearest the map's centre.
  - **Quick filter:** "Transit centres" and "LRT stations" chips swap the list for every place of that type, nearest the map's centre first. It's in the URL as `?type=transit-centre` or `?type=lrt`, written with `router.replace`, so back from a stop returns to it. Tapping a place opens its first platform or bay, which links to the rest.
  - Places come from `stopPlaces` (`src/utils/stations.js`): a GTFS station with its boardable stops, or a lone LRT stop (Valley Line stops have no station). It's an LRT station if a train serves any of its stops, else a transit centre if it has two or more. Names aren't relied on. The LRT stops come from `getRailStopIds` (`['rail-stops']`, the stop schedule view grouped by stop for `route_type` 0), only fetched once a filter is on.
- Service alerts naming the stop, in effect or still to come (`alertsForStop`), show above the routes as `ServiceAlertCard`s with the routes they affect.
- **Other platforms and bays:** stops sharing a GTFS `parent_station` (`stationStops`, `src/utils/stations.js`, leaving out entrances and other `location_type`s) are linked under the stop's name. An LRT station's two platforms are its two directions, and their names and stop numbers don't say which is which, so they get a full-width toggle labelled by each platform's busiest headsign ("To Clareview" / "To Century Park"). Switching uses `router.replace`, like a toggle. The labels come from `getStopHeadsigns` (`describePlatforms`).
  - **A transit centre lists every bay at once.** The panel is headed by the station's name and "N bays", and each bay is a section (`StationBay.vue`, which runs its own `useStopArrivals`) with its alerts and route cards. A section is headed by the bay's name ("Bay A", `bayName`: a bay, platform or gate in its stop name, else its GTFS `platform_code`, else what its stop name adds to the station's), with its stop number and routes in small text under it ("Stop 2213 · Routes 4, 30"). A bay without a name is headed by its stop number. Named bays come first in order, then the rest by stop number (`sortBays`). The opened bay's heading is picked out with a primary bar and scrolled into view, and tapping a heading opens that bay (`router.replace`), which highlights it on the map. Every bay's buses are passed up (`bay-route-groups`) so the map draws them all and any of them can be selected, with "stops away" counted to the bay it's listed under.
  - **The map centres on the station**, the middle of its platforms, and doesn't move again when switching between them (`mapFocus` is keyed by `parent_station`), as a shift of a few metres is distracting. A stop with no station centres on itself.
  - **The other direction is preloaded:** for a two-platform station, `StopsPage` runs a second `useStopArrivals` for the other platform. Its queries share their keys, so switching shows it straight away with no requests, and its route groups are passed to `StopDetails` for the swipe.
  - **Swiping follows the finger.** The panel's list (`StopArrivalsList.vue`, one stop's alerts and route cards) sits in a sideways track in `StopDetails`. Once a touch has moved 8 px mostly sideways, the list follows the finger and the other direction's list, drawn from the preloaded data, comes in beside it from the side being pulled from (either way, as there are only two). On release it finishes the slide and switches if it went past a quarter of the width or was flicked, else it springs back. The new stop is switched to only once the slide ends, then the track resets unseen, as the stop's own list now shows the same thing. A mostly downward drag scrolls as usual (`touch-action: pan-y`). Tapping the toggle plays the same slide. With reduced motion it just switches.
  - `useStationHeadsigns` (`src/composables/`) holds the station's `['stop-headsigns', stopIds]` query, shared by the toggle's labels and each list's card titles.
- **Each route's card header links to the route's page for this stop** (`/stops/:stopId/routes/:routeId`, with `?agency=` for a regional route), with the badge and long name morphing into its heading.
- **Each route's card is titled with where it's going**, as a route's name doesn't say the direction: the badge, the headsign without the route number (the most common among its buses or trains on the way, else its busiest headsign at the stop from `getStopHeadsigns`, `mainHeadsigns`), and the route's long name in small text under it. The long name keeps the `route-name` view transition name, so it still morphs into the route page's heading. Without a headsign the long name is the title.
- **Every route serving the stop is listed:** routes with something on the way first (a live bus, or an LRT line's scheduled trains), then the rest, each by route number, with LRT lines first by name (`compareStopRouteGroups`, `src/utils/stopRoutes.js`). A route moves between the two as buses come and go.
  - **Live routes.** A route is live if it has a bus whose trip is in the stop's schedule window. Each bus shows "Bus N" and its distance (with its headsign first only when it differs from the card's title), an ETA, and a status chip. Buses are listed nearest first, and buses that have passed drop off after 500 m. Tapping a bus selects it on the map and expands its details: stops away, next stop, scheduled time, and a "Trip details" button.
  - **Quiet routes.** These show "No upcoming arrivals" and the next scheduled bus:
    - "Next bus at …" (today)
    - "tomorrow at …"
    - "Monday at …"
    - "next Wednesday at …"
    - "No buses scheduled in the next week"
- **A week of delays per route:** an ETS bus route's title has a "Usually on time" / "Usually N min late" chip (`typicalStatus` of the mean) from `/stop-times/stats/routes/:route/stops/:stopId` (`['route-stop-stats', routeId, stopId, null]`, shared with the trip page). Tapping it opens the week's histogram under the header (`RouteStopStats.vue`, drawn by `DelayHistogram.vue`), and tapping again closes it. There's no chip without times, for LRT lines, or for regional routes, as route ids are only unique within an agency. The header's link to the route's page for this stop lies under the chip, so the chip isn't a button inside a link.
- **How the next bus is picked:** this lives in `nextArrivalByRoute` (`src/utils/nextArrival.js`, a pure function with unit tests). It uses three grouped `getStopNextArrivals` queries:
  - from now, on today's services
  - from now + 24 h, on yesterday's services still running past midnight (only queried before 6 AM)
  - from `00:00:00`, giving each pattern's first trip of the day
  
  If a route has nothing left today, it looks ahead day by day for up to 7 days. That covers weekday-only routes on weekends, routes that run one day a week, and a route that has finished on its only day.
- If the routes or next-arrival queries fail, the page shows just the live routes. It doesn't show an error.
- **LRT lines** (`route_type` 0, `RAIL_ROUTE_TYPE`) aren't in the bus feed, so they're never matched to live buses. Instead their card shows the next four scheduled trains from the stop's schedule window (`upcomingArrivals`, `src/utils/nextArrival.js`): minutes from now large ("Due" this minute), the clock time under it, and the headsign per train only when they differ. A footnote says "Scheduled, not live" (the card's title says where they go). The countdown ticks every 30 s.
  - LRT cards have no route badge, as Edmonton's lines go by name and colour, not number: the title is the headsign over the line's name, with a bar in the line's colour down the header's left edge (`routeColor`, also used for the `TrainTimes` bars). They're listed first, by line name, so they keep their places when switching platforms.
  - Several LRT service variants claim the same weekdays in their `service_id` (Weekday-1, -3, -4 … all `1111100`), so going by the id alone lists every train once per variant. The calendar dates of the stop's LRT services (`['rail-service-dates', serviceIds]`) decide which run today (and yesterday, for trips past midnight). If the calendar fails it falls back to the `service_id` days, and trains to the same place at the same time are kept once either way.
  - With no train in the window, the card falls back to "No upcoming arrivals" and "Next train at …" (`describeNextArrival` with `"train"`).
- Cards ease in and out with the `arrival` TransitionGroup. This is turned off for reduced motion.

### A route at a stop (`/stops/:stopId/routes/:routeId`, `StopRoutePage.vue`)
- Reached from a route card's header on the stop page, from the stop names on the route page (its Stops list, Next Trains and timetable) and its map, and from the trip page's stops (the expanded row's button and the map). `?agency=` names a regional route's agency (route ids are only unique within one), else it's `LOCAL_AGENCY`. The Stops tab stays lit.
- **Heading:** the route header pattern (large badge, the most common headsign here, the long name, a chevron to the route page; LRT gets the colour bar).
- **Direction:** a toggle above the stop picker names each direction "To …" by its most common headsign in the current feed (`directionLabels` over `['route-trips', routeId]` and the route page's `['active-feed-trips', routeId]`), hidden for one-direction routes. It stacks on phones like the route page's. The page's direction is `?direction=` when the stop sees buses going that way (a terminal sees both), else the way most of its buses go; the list, heading, stop picker and arrivals all follow it. Picking the other direction opens the stop nearest this one (`distanceMetres`) on a trip of that direction's most common shape (`['trip-stop-times', tripId]`), usually across the street, with `router.push` and `?direction=`. If those stops can't be loaded it says so. Moving between stops keeps the heading's headsign, the toggle's direction and the stop list (`lastKnown`) while the next stop's schedule loads, as they're the same along the route.
- **Switching stops** (`StopPicker.vue`): the stop's name and number between previous and next stop arrows. Tapping the name opens a list of the route's stops, scrolled to this one. Picking one, or an arrow, opens that stop's page for the route with `router.push`, keeping `?date=`, `?agency=` and `?direction=`. The list is the stop times of a trip on the route shape most of the stop's visits use (`commonShapeTrip` over `['route-trips', routeId]`, then `['trip-stop-times', tripId]`), so short turns don't cut it short, and a loop passing the stop twice is placed at the visit most buses make (`stopIndexOnTrip`). As the name now switches stops, the stop's own page is a small "All routes at this stop" link under it. The badge and long name carry the `route-number`/`route-name` view transition names. The history state's `routeLongName` fills the name before the schedule loads.
- **Last week:** a "Usually on time" / "Usually N min late" chip (`typicalStatus` of the mean) under the stop links, for the whole route's week at the stop (`['route-stop-stats', routeId, stopId, null]`, shared with the stop page's chips). Tapping it opens the week's histogram (`RouteStopStats`) under it, and tapping again closes it; it starts closed. There's no chip while loading, without times, for LRT, or for regional routes, as route ids are only unique within an agency.
- **Day:** a `DayPicker` in `?date=` (left off for today, written with `router.replace`). Pickable days are the calendar dates of the services that stop here (`['service-dates', routeId, serviceIds]`), plus any day before the calendar starts, like the trip page.
- **The day's buses** come from `getStopRouteSchedule` (`['stop-route-schedule', …]`, one request for every service) and are filtered to the day by `arrivalsOnDate` (`src/utils/stopRouteTimes.js`): the services the calendar runs that day, or the `service_id` days without it, keeping one per time and headsign as variants repeat. A trip visiting the stop twice gives two rows. Each row is the scheduled time, the headsign only when it differs, and "Trip N". Tapping a row opens its details under it (one at a time, closed on a new stop or day), and tapping again closes it:
  - **The bus:** a "Bus N" chip to `/buses/:id` for the live bus on the trip, else every bus we recorded on it (`useRecordedTripsQuery`'s `busesByTrip`, the next day's too for a time past 24:00). Without one it says "No bus on this trip yet" or "No bus recorded on this trip". Not for LRT.
  - **A bus on its way** (today, with an estimate) also gets "N stops away · 790 m" ("Next stop" for one) and a strip of dots (`StopApproach.vue`, with `approachTrack` and `approachWindow` in `src/utils/stopRouteTimes.js`): the trip's stops up to this one, 5 stops apart edge to edge, and a bus icon between the two it's between, by how far along the route line it is. The stop it last passed sits at the left edge until this stop reaches the right edge, where it stays, so the strip only ever slides forward (a 1.2 s transition) as the bus goes: stops further on slide into view and passed ones go off the left. While this stop is further than fits, the strip fades out before it and it's pinned to the right edge after a dashed line and "…". The stop at the left edge is named under it and the last is "This stop". The trip's stops come from `['trip-stop-times', tripId]`, only loaded once opened.
  - A "Trip details" link to `/trips/:id?date=`.
  - **Today** opens an hour back (`earlierCount`), with a "Show N earlier" button. Upcoming buses within the hour say "in N min" ("Due" this minute), the first is marked "Next" and tinted, and past ones are dimmed.
  - **Buses on the way** today get "Est. 9:12 AM", "in N min" and a status chip, worked out like the stop page's: the live bus on the trip (`['buses-live']`), how far it has left along its route line (`['trip-shape', tripId]`, `alongRouteMetres`) at `AVERAGE_SPEED_METRES_PER_SECOND` from when it reported, and no sooner than now. A late bus with an estimate isn't dimmed as past, and can be "Next". Once it's gone by, the actual time takes over.
- **Actual times**, coloured like the timetable's (`actualStopTime`):
  - Past days use the backend's `['route-stop-times', routeId, date]` (shared with the route timetable), matched by `stop_sequence`. A day without any for this stop says so.
  - Today, and yesterday while the backend has none yet, are worked out here like the trip page (`estimateStopArrivals`), shown as "Actual ≈". Only buses shown, recorded that day (`useRecordedTrips`) and due within 10 minutes are looked at. Each route shape is loaded once, from the first such trip (`['trip-shape']`, `['trip-stop-times']`, via `['route-trips', routeId]`), and each bus's run with the trip page's `['trip-run', tripId, date]` key, on the day it started (`runDate`; the trip's start is its time here less the shape's running time to here). A run refetches every 60 s while it's active and the bus hasn't passed the stop. Times past midnight are compared on the service day's clock (`serviceDaySeconds`).
  - A bus with no time 10 minutes after it was due says "Not seen here" and "Trip was tracked" when we recorded its run that day (`useRecordedTripsQuery`'s `['route-day-runs', routeId, date]`, or a trip in the backend's times for the day; a time here past 24:00 also checks the next day, where a run starting after midnight is filed), and "Not tracked" when we didn't. While the recorded trips load, or if they fail, it's just "Not seen here". LRT lines show "Scheduled, not live" and no actual times.

### Routes list (`/routes`)
- The heading is "Routes", as LRT lines are listed too.
- A searchable list grouped by agency: a small heading per agency (`groupRoutesByAgency`, `src/utils/routes.js`: `LOCAL_AGENCY` first, then by name, routes with no known agency last under "Other"), each over an outlined card of rows like the bus page's trips (no `v-list` or chevron). Each row has a `RouteBadge` (small), a warning icon when the route has a service alert in effect (`routesWithActiveAlerts`, before the name so a long name can't push it off a narrow screen), the long name, and a bus icon with the live bus count.
- **Filters** under the search: an agency select (full width on phones, with the chips under it), vehicle type chips (Bus, LRT, from `route_type`, `routeTypeLabel`), "Running now" (routes with a live bus) and "Disruptions" (an alert in effect). They're in the URL as `?agency=`, `?type=`, `?live=1` and `?disrupted=1`, written with `router.replace`; the search isn't. A count of matching routes shows above the list, with "Clear filters" when any is on, and "No routes match" when none do. The matching is `filterRoutes` (`src/utils/routes.js`).
- The routes dataset has no agency, so `getRouteAgencies` groups the stop schedule view by route and agency for the active feed (`['route-agencies']`, `staleTime: Infinity`). Both use `useRouteAgencies` (`src/composables/useAgencies.js`). The whole list shows a skeleton until the routes and agencies have loaded, so it doesn't reshuffle into groups when the agencies arrive. If the agency lookup fails, the list shows ungrouped.
- Tapping a row expands it (one at a time). It shows the route's live buses grouped by headsign (`busesByHeadsign`, `src/utils/routes.js`: by direction then headsign, buses by number, trips not in the feed last under "Not in the current schedule"), each bus a chip linking to its bus page, and a full-width "View details" button to the route page. The headsigns come from `['trip-summaries', tripIds]`, only fetched for the expanded route.

### Route details (`/routes/:routeId`, `RouteDetailsPage.vue`)
- The heading is a large `RouteBadge` beside the long name. It renders straight away from the `routeId` prop, without waiting for the routes query.
- **Agency:** under the heading, the agency running the route (`useRouteAgencies`) with links to its website and fares page and its phone number, from the GTFS agency dataset (`isug-45sj`, `getAgencies`, `useAgencies`). Vanity numbers like 780-464-RIDE are dialled as digits (`telHref`, `src/utils/phone.js`). The line keeps its height while loading, so the page doesn't shift.
- `getTripsByRouteId` loads every trip for the route (1,300 for route 8), without shapes. It used to cap at 500 with shapes, which dropped whole services and came to nearly 10 MB.
- **The page is split by direction.** A toggle under the heading lists each direction by its most common headsign (`directionLabels` in `src/utils/routes.js`), with a badge for its live bus count. It's hidden for one-direction routes. On phones (under 600px) the directions stack full width and long headsigns wrap, rather than squeezing side by side. The map, the Active Buses, the stops list and the timetable all follow it.
  - The direction is in the URL as `?direction=`. It's read on load and written back with `router.replace`, so reloads and shared links keep it. An unknown or missing value falls back to the first direction.
  - The trip page's route button and the main map's bus card (`BusDetails`) pass their trip's `direction_id`. The stop page doesn't, as a stop's route group can have buses going both ways.
  - Buses are matched to a direction through their trip, using the route's trips. Until those load, the buses are shown unsplit.
- **Service disruptions**, under the map (as on the trip page): a `ServiceAlertCard` per alert in effect now, and an "N upcoming" button that expands the ones still to come (`alertsForRoute`). They wait for the direction's stops, so alerts naming only the other direction's stops never show; only if the stops can't be loaded are the whole route's shown. Every direction's stops (`['route-direction-stops', …]`) load up front, so switching direction has its map and disruptions straight away. Nothing shows without alerts. The time ticks every minute (`useNowLocal`), so alerts start and end on screen.
- A map (`TransitMap.vue`, see Shared UI) for the selected direction:
  - its stops and route lines, from one trip per `shape_id` (`representativeTrips`). The stops come from `getStopTimesByTripIds` on those trips. The lines come from their `['trip-shape', tripId]` queries, shared with the trip page and the bus cards. Tapping a stop opens the route's page for it (`stopRouteLink`)
  - the direction's live buses as pins (`createBusIcon`), from `useBuses`. They have no report-age badges, because a route's worth of them clutters the map. Tapping a bus opens its trip
  - it fits once per direction (`fitKey`), so bus refreshes don't undo the user's panning
- Active Buses, one `RouteBusCard.vue` per bus in the direction, sorted by bus number. Like `BusDetails`, each card shows the headsign, "Bus N · X km/h", the On time / late / early chip, the next stop and its scheduled time (all from `useBusTrip`), and a "Trip details" button. Until `useBuses` loads, the cards show the handed-over buses, which have no position, speed or status yet.
- **LRT lines** (`route_type` 0) aren't in the bus feed, so once the routes load, "Next Trains" replaces Active Buses: each station in the direction, in the order trains reach it (lowest `stop_sequence`), linking to the line's page for that stop (`stopRouteLink`), with its next three scheduled trains in `TrainTimes` (see Shared UI). It's labelled "Scheduled, not live".
  - The times come from `getRouteSchedule` (`['route-schedule', routeId, date, windowStart, serviceIds]`): the route's stop times over the next two hours, refetched in 15 minute steps, on the services running today and yesterday (for trips past midnight). It waits for the calendar dates, as the `service_id` days alone list each train once per variant. Trips are split by direction through the route's trips, and `upcomingArrivals` picks each station's next three (`keyOf` the stop). The countdown ticks every 30 s.
  - Before the routes load, Active Buses only shows when buses were handed over for the view transition.
- **Stops**, between Active Buses and the timetable (not for LRT lines, which have no recorded times): the direction's stops in the order buses reach them (`stopsInOrder`, `src/utils/routes.js`: average `stop_sequence` of each trip's first visit, across the direction's representative trips), each linking to the route's page for that stop (`stopRouteLink`, with `?agency=` for a regional route), with a warning icon and the effect when an alert in effect names it. Each stop shows how late the route's buses were there over the last week, from one request for the whole route (`['route-stops-stats', routeId]`): the "Usually …" chip, the average and the on-time share, and a short histogram (`DelayHistogram`, shared with the trip page's `StopDelayStats`) whose bars say what's in them when tapped. Stops without times say so. The histogram sits beside the stop on wider screens and under it on phones.
- A timetable for the selected direction, from the route's calendar dates (`['service-dates', routeId, serviceIds]`):
  - **Default: today's exact date** (`servicesOnDate`), so it shows what's actually running. A date button opens a picker limited to the feed's dates. Previous and next buttons beside it step to the nearest date the route runs on, and are disabled on a typical week. A "Special schedule on this date" chip shows when the date's services differ from a typical week, e.g. holidays.
  - **Weekday buttons** show a typical week in the selected schedule period (`regularServices`). That leaves out one-off services: a service is kept when it runs on at least half as many of that weekday's dates as the most frequent one. The buttons show nothing selected while an exact date is.
  - **A "Schedule" select** lists the periods (`schedulePeriods`) by date range, marked current or upcoming. It's hidden when there's only one. Picking a period switches to its typical week, and picking a date selects its period.
  - If the calendar fails to load, it falls back to the active-feed trips and the days in each `service_id` (`serviceRunsOnDay`), without the date button.
- On an exact date, each trip we recorded that day (`useRecordedTrips`) gets a small green dot in the top-right corner of its header cell. Typical weeks and future dates have no dots.
- **Scheduled / Actual:** on an exact date up to today (not a typical week, a future date or an LRT line), a toggle swaps the scheduled times for when each bus actually went by (`/stop-times/routes/:route/:date`, `['route-stop-times', …]`). It's in the URL as `?times=actual`, written with `router.replace`.
  - Each trip gets two columns under its header (`TimetableHeaderRow`'s `span`): the actual time, the scheduled time plus the delay (`actualStopTime`, `src/utils/actualTimes.js`), and the delay as the status chip's label ("2 min late"). Both are coloured like the chips, with the `text-` class on the cell as `.timetable-link` inherits its colour: `scheduleStatus` on the delay rounded to the minute, so 2 min or more late is warning, 2 min or more early is info, else success. A stop the bus wasn't seen passing shows a dash. Delays are matched by the cell's `stop_sequence`, as the table has a row per stop.
  - Today's aren't worked out until overnight, so today, a day with none in the direction, or a failed load shows a line saying so, with a button to the previous date the route ran.
- In the timetable, PM times are bold. Each trip's header time and every time in its column link to `/trips/:id` (with `?date=` on an exact date, so the trip page shows that day's run; `tripHref`), and each stop name links to the route's page for that stop, on the timetable's exact date if it isn't today. The time cells are plain `<a>` links routed by one delegated `openTripCell` handler on the `tbody`, because a `router-link` per cell would mean thousands of components.
- The timetable's header row sticks to the page just below the app bar, and the stop column sticks to the left. The page scrolls vertically and only the table's box scrolls sideways, so content added below the table scrolls normally.
  - CSS won't let a header inside the box stick to the page. Setting `overflow-x: auto`, `scroll` or `hidden` turns the other axis's `visible` into `auto`. That makes the box a scroll container in both directions, and sticky cells stick to it instead of the page. Only `clip` leaves `overflow-y` alone, but `clip` can't scroll.
  - So `useStickyTableHeader` (`src/composables/`) keeps a copy of the header row (`TimetableHeaderRow.vue`) in a sticky element above the box, at `top: var(--v-layout-top)` (0, as there's no app bar). Its columns are sized from the real header, which stays in the table with `visibility: hidden` to keep the layout. The copy's sideways scroll is kept in step with the box in both directions. The box is pulled up under the copy by the copy's height.
  - The copy and the box share a wrapper, so the header stops sticking where the table ends.
  - The columns are re-measured when the table resizes, or when its trips or stops change.
  - The table uses separate borders, because collapsed borders don't move with sticky cells. Its styles are in an unscoped `<style>` block under `.timetable-` classes, so they reach the header row component.
- There are no summary cards. The route id, the type (always bus) and the active-bus count were redundant and were removed.

### Trip details (`/trips/:tripId`, `TripDetails.vue`)
- **Heading:** the route header pattern with a large badge and the headsign (without the route number) as the `h1`, the route's long name in small text under it, and a chevron, linking to `/routes/:id?direction=` with the trip's direction. LRT trips have no badge and a bar in the line's colour instead, like the stop page. Under it, small subtext: the service days, the start and end times, and "Trip N · Bus N" (the bus from the latest recorded position, linking to the bus page).
- **Live status:** while the bus is out on the shown run (its latest position under 5 minutes old, `ACTIVE_TRIP_STALE_SECONDS`, and not past its last stop), a line under the heading shows an On time / N min late / early chip and "Next stop …, scheduled at …". It's worked out by `useBusTrip` from the latest position, like the map's bus card, so the two agree.
- **Order:** heading, map, service disruptions, the day and trip pickers, then the Stops / Positions toggle and the list. On phones (under 600px) the day picker, the trip picker and the toggle each take the full width.
- If the trip isn't in the feed (`getTrip` gives null, as for an old trip that's no longer scheduled), the page just says "Trip N not found."
- **Day:** a `DayPicker` under the map and disruptions picks which day's run is shown, in the URL as `?date=` (written with `router.replace`, and read again on back and forward).
  - Without `?date=` the page shows the latest recorded run, from `/bus/trips/:tripId` split at 30 min gaps. The positions come newest first, so the run is picked by its times. The picker shows the day that run started, or today. It refetches every 60 s while the run is active.
  - With a past or today's date it uses `/bus/trips/:tripId/:date`. A 404 keeps the schedule and map, with grey stops and no estimates, under "Not recorded on Wed, Oct 14" (or "Hasn't run yet today").
  - A future date makes no backend request. It shows the scheduled times only, and the subtitle says "Not run yet" instead of the bus.
  - Only days the route runs can be picked, from the calendar dates of all its services (`['service-dates', routeId, serviceIds]`, shared with the route page), up to the last date in the feed. Days before the calendar starts stay pickable, back about a year, as older feeds aren't in it. If the calendar fails, any day from a year back to 60 days ahead can be picked.
  - Picking a day this trip doesn't run on (a Saturday for a weekday trip) jumps, with `router.replace`, to the trip starting nearest to this one's start (`nearestByStart`).
- **Service disruptions:** under the map, a `ServiceAlertCard` for each alert in effect at some point between the trip's first and last scheduled time on the picked day, on its route, naming one of its stops or none (`alertsForTrip`). Hidden while switching. The stops an alert names get a warning chip ("Detour", "Stop moved") beside "Stop N", and the effect in their map tooltip.
- **Trip picker:** a `TripPicker` beside the day picker steps through the route's trips going the same direction on the picked day.
  - The day's trips (`tripsOnDate`, `src/utils/dayTrips.js`) are the route's trips (`['route-trips', routeId]`, shared with the route page) in that direction whose `service_id` runs on the date. Without calendar dates for it, the days in each `service_id` are used, within the trip's schedule period.
  - They're ordered by their first departure (`['trip-start-times', tripIds]`, `getTripStartTimes`). Past-midnight starts sort last.
  - Trips we recorded that day (`['route-day-runs', routeId, date]`) get a green `mdi-access-point` icon in the menu, and beside the label when it's the shown trip. Future days make no request.
  - Previous and next buttons, and a menu of start times, go to `/trips/:id?date=` with `router.push`, so back returns to the last trip.
  - The page reacts to `tripId` changing, as the router reuses it. The expanded stop resets.
  - **Switching keeps what's known.** The trip, shape, stop times and run queries use `placeholderData: keepPreviousData`. While any is still the previous trip's or day's (`switching`), the route header, pickers and map stay, the headsign/times lines become a skeleton and the stop list says "Loading...". The map draws a snapshot of the last settled trip, and fits the new one once it arrives (its `fitKey` is the loaded trip's id).
- A map (`TransitMap.vue`) with the route shape, stops coloured by lateness (tooltip: name, time, status), and the bus's latest recorded position as a bus pin with an age badge ("52s ago", `showAge`). The pin only shows while the run is going or for 10 minutes after its last position (`RECENT_RUN_SECONDS`, checked every 30 s), as an older position isn't where the bus is. Stop colours follow `scheduleStatus`, so they match the chips. It fits once per trip, so the 60 s refetch doesn't re-zoom it. Tapping a stop opens the trip's route at that stop on the trip's day (`stopRouteLink`, `?date=` left off for today). It's `bounded` to the Edmonton region and the trip's own stops, to save map tiles.
- The map renders while the page loads, so it's there for the view transition from the main map. The trip and its stop times use the bus card's `['trip-shape']` and `['trip-stop-times']` keys, so coming from a card the heading and map show straight away, with "Loading..." below the map until the run loads.
- **Stops / Positions:** a toggle between the map and the list switches the list between the scheduled stops and the run's recorded positions. It's in the URL as `?view=positions` (left off for stops), written with `router.replace`, and carried along by the day picker, the trip picker and the jump to the nearest trip, so the choice sticks while browsing.
- **Positions** list the run's positions oldest first, in the same card rows as the stops. Each shows the time to the second (`formatClockTimeWithSeconds`), the speed in km/h ("Stopped" at 0), the compass direction (`compassPoint`) with an arrow turned to the bearing, the nearest of the trip's stops within 150 m ("Near …", else "Between stops", `nearestStop`), a "N min gap" chip when the previous report was over 2 minutes earlier, and the bus when the run had more than one. All of it comes from the positions already loaded, with no extra requests. With no positions it says "No recorded positions".
  - Consecutive positions within 50 m of the first of them (`GROUP_POSITION_METRES`, `groupPositions` in `src/utils/positions.js`), as when the bus waits at a stop, share one row. It shows the first position's time, details and gap chip, with a "+N" chip for the rest. Tapping it opens the individual rows (one group at a time) without moving the map. Tapping one of those selects it. Tapping it again closes it and clears a selection inside it. Grouping only joins neighbours, so a loop passing the same spot twice gives two rows. The map pins and the "Positions (N)" count are still one per position.
  - The map keeps the stops and route line, drops the live bus pin, and shows positions as small pins with time badges ("2:24 PM"). They're thinned to about 64 px apart on screen (`thinPositions`, `src/utils/positions.js`), keeping the first and last, and only those in view are drawn. They're redrawn on every zoom and pan, so zooming in fills in more.
  - Tapping a row (or a pin) selects the position: it gets a larger highlighted pin with its time, the map flies to it (zoom 16 or closer) and scrolls into view, and the row is tinted. Tapping it again clears it. Tapping a pin inside a closed group opens that group. Changing trip, day or view clears the selection and closes the group.
- **Stops** are rows in one outlined card, like the stop page's cards (no `v-list`, so nothing gets clamped on mobile). They're top-aligned, so a stop's name always sits level with its time, however many lines either side takes:
  - left: the stop name (wraps) and "Stop N"
  - right: the scheduled time, large, and once the bus has passed the stop, "Actual ≈ time" and an On time / late / early chip (`scheduleStatus`)
  - Tapping a row expands it to show the disruptions naming the stop (the same `ServiceAlertCard`s as under the map, so the warning chip is explained), the last week at the stop (`StopDelayStats.vue`), the other routes serving the stop (as badge chips), a full-width "Route N at this stop" button (the line's name for LRT) to the trip's route at that stop on the trip's day (`stopRouteLink`), and a small "All routes at this stop" link to the stop's own page under it.
- **Last week at a stop** (`StopDelayStats.vue`, `src/utils/delayStats.js`): a "This trip" / "Whole route" toggle switches between this trip at the stop and every trip of the route at it. The choice is kept while opening other stops (not in the URL). Both load when the stop opens, so the toggle switches at once. It always covers the last 7 days up to yesterday, whatever day is picked.
  - A chip with the average rounded to the minute like the per-stop chips ("Usually 2 min late", `typicalStatus`), the average to the second (`formatDelay`) and the share on time (`onTimeShare`: bins from a minute early to under 2 late, near `scheduleStatus`'s rounding).
  - A histogram of whole minutes as CSS bars (no Chart.js), at most 28 px wide each. Every minute from the earliest to the latest is drawn, and -1 to 1 always, so the on-time band shows (`histogramBars`). Bars are coloured like the chips (`binColor`). The ends and 0 are labelled, the last end bin as "30+ min".
  - Under it, how many times it's from ("On 6 of the last 7 days", or "214 buses on 38 trips"). Tapping a bar swaps that for what's in it ("2–3 min late: 4 buses", `binLabel`), as there's no hover on a phone.
  - With no times it says so, as the data is only worked out nightly and older trips aren't in the open data.
- **Actual times** come from `estimateStopArrivals` (`src/utils/stopEstimates.js`, unit tested), using the latest run of recorded positions (split on 30-minute gaps) and the trip's route shape. A stop only gets a time once the bus has passed it, as the nearest position alone used to give one while the bus was still on its way:
  - Each position, oldest first, is placed along the shape. Progress only goes forward, and each position is looked for no further ahead than a bus could have driven since the last one (30 m/s plus 300 m), so a loop or a route that comes back past the same spot doesn't jump ahead. Positions over 150 m from the shape (a detour, a bad fix) are skipped.
  - Each stop is placed along the shape in trip order, no earlier than the stop before it, so a loop's last stop isn't placed at its start. Where the shape passes near a point more than once, the earliest close pass is taken.
  - A stop is passed once the bus is 25 m (`PASSED_METRES`) beyond it, or within 25 m of the end of the shape for the last stop. The 25 m also keeps a bus waiting at the first stop from counting until it leaves. The time is worked out between the positions either side of that point. A stop passed before the run's first position (by more than 100 m) gets no time.
  - Without the shape, no stop gets a time.
- Each stop's estimate is worked out once per render in `stopRows`, which the list and the map share.

### Bus details (`/buses/:busId`, `BusDetailsPage.vue`)
- Reached from any bus id (`BusLink`, see Shared UI).
- **Heading:** "Bus N", a "Live" chip while `active`, otherwise "Last seen 3h 5m ago" (amber, grey past an hour), an Electric chip for 8000–8999, and "Tracked since" the first sighting.
- A map (`TransitMap` with `showAge` and `followBus`) of the bus's latest position, with the route line and stops of its current trip, or the last trip it ran if it's out of service (or the expanded trip, see below). It centres on the bus at zoom 16 and flies to it whenever the position changes. The pin's age badge goes amber past 5 minutes, and past an hour the badge and pin go grey. The map renders while the bus loads, for the view transition from the main map.
- `['bus', busId]` refetches with `nextBusRefreshDelay` while the bus is active, and every 60 s otherwise. The current week's trips refetch when `lastSeen` changes.
- **Activity:** trip counts from `/bus/:busId/trip-counts` as a bar chart (`TripCountsChart`), with a Day / Week / Month toggle in the URL as `?stats=` (left off for Day). It covers the last 30 days, 12 weeks or 12 months (`tripCountsRange`, `src/utils/tripCounts.js`), starting no earlier than the first sighting. Above it, the total and the average per period (`summarizeCounts`), which leaves out the current period and any the bus was first seen partway through. Tapping a day's bar shows its week's trips and scrolls to them. Week bars aren't tappable, as the backend's Monday weeks don't line up with the Sunday trip weeks. Switching the toggle keeps the heading and toggle and shows a spinner in place of the chart and summary until that period's counts load (a period already fetched shows at once). The counts refetch when `lastSeen` changes.
- **Trips** are shown a week at a time, Sunday to Saturday (`src/utils/weeks.js`), picked with `WeekPicker` (see Shared UI). The current week is the default. The week's Sunday is in the URL as `?week=`, read on load and written back with `router.replace`, and left off for the current week. A future or invalid week falls back to the current one. Changing week collapses the expanded row. The trips are fetched with `from`/`to`, newest first, grouped under Today / Yesterday / "Monday, Oct 12" (`tripDayLabel`, Edmonton days). Each row is a route badge and the headsign without its route number (`headsignWithoutRoute`, so "4 University" reads "University" beside the 4 badge), the route's long name below, and the first-to-last seen times (`formatTripTimes`). The running trip ends in "now" with a Now chip (only in the current week). An empty week shows "No trips this week" or "No trips in the week of Oct 4". Trips not in the current feed show "Trip N", and out-of-service stretches show "Not in service".
  - The rows are in outlined cards like the trip page's stops, with no chevron. Tapping one expands it (one at a time, kept open through refreshes by `rowKey`, the trip and start time). It shows how long the bus was seen on it (`formatTripDuration`, "so far" while running), the average and top speed in km/h, how many positions were recorded, the trip id, and a full-width "View trip" button to `/trips/:id?date=` with the day the trip started (`edmontonDate`), so the trip page shows this run, disabled once the trip summaries have loaded without it (it's no longer in the schedule, so the trip page would say not found).
  - While a trip with an id is expanded, the map shows that trip's route line and stops, and stops following the bus to fit them (`fitKey` is the trip). Collapsing it goes back to following the bus on its own trip. When the bus isn't on a trip, the map shows the newest trip of the current week, but not of an older week being browsed.
- No record of the bus shows "Bus N hasn't been seen".

### Bus finders (`/electric`, `/hydrogen`, `BusFinderPage.vue`)
- One page for both, picked by the route's `kind` prop. The heading, a `TransitMap` of the buses (with age badges), and a list.
- Each row is the route badge, the headsign (`headsignWithoutRoute`, or "Not in service"), "Bus N · X km/h", and the distance from the viewer (`formatDistance`). Routes and headsigns come from one `['trip-summaries', tripIds]` query.
- The list is sorted by bus number until the viewer taps the locate button at the map's bottom right (same style as the main map's). Then it's nearest first, with distances, and the map shows their blue dot (`finderRows`, `src/utils/busFinder.js`). A snackbar shows if the location can't be found.
- The map follows the first bus: the nearest, or the one tapped. Tapping a row selects it (tinted) and shows a "Trip details" button. Tapping it again clears it.
- No buses out shows "No electric buses are out right now." or "The hydrogen bus isn't out right now."

### Others
- Electric and hydrogen bus stats, the status page (disk stats), and About.
- **Not found** (`NotFoundPage.vue`): the router's last route, `/:pathMatch(.*)*`, catches any other address, so a mistyped or old link says "Page not found" with the address and buttons to Buses, Routes and Stops instead of an empty page. Its tab title is "Page not found". Netlify's `_redirects` still serves it with a 200, as the app decides what exists.

## Shared UI

- **`TransitMap.vue`**: the Leaflet map for the route, trip, bus and bus finder pages. Props:
  - `stops`: `{ stop_id, stop_name, lat, lon, color?, tooltip?, disruption? }`. Drawn on a canvas, and tapping one opens `/stops/:id`, or where `stopLink(stop)` says (the route and trip pages open the route's page for the stop). A `disruption` label draws an amber ring around the stop
  - `buses`: `Bus[]` as `createBusIcon` pins, with no age badges. Tapping one opens its trip, if it's on one
  - `paths`: route lines, under the stops
  - `fitKey`: the map fits the stops and lines once per key, so data refreshes don't undo the user's panning
  - `showAge`: label pins with their report age, ticking every second
  - `followBus`: centre on the first bus and fly to it as it moves, instead of fitting the stops. Turning it off fits the stops and lines, and turning it back on re-centres on the bus
  - `positions`: past positions (`Bus` plus `key` and `label`), as small pins with a time badge, thinned to the zoom and the view
  - `selectedPosition`: one of them, always drawn, larger and on top, and flown to when its key changes. Tapping a position pin emits `select-position` with its key
  - `userLocation`: `[lat, lon]` of the viewer, drawn as a blue dot
  - `bounded`: keep the map inside `EDMONTON_BOUNDS` (`src/plugins/sharedMap.js`, where the main map's tiles used to stop) extended by its stops and lines, so it can't be dragged away and zooms out no further than the whole region (`maxBoundsViscosity` 1). The limit comes off when the page lets go of the map. Only the trip page sets it

  - when the shared map comes straight from another page, its first fit (or centring on the bus) flies there instead of jumping, unless reduced motion is preferred

  Pages set the height with `--transit-map-height` (default 360px, or 280px on mobile).
- **`WeekPicker.vue`**: picks a Sunday–Saturday week. `v-model` is the week's Sunday (`YYYY-MM-DD`), and `min`/`max` limit it to days the data can cover. Vuetify has no week picker, so it's previous/next buttons around a label ("This week", "Last week", "Oct 4 – 10"). The label opens a `v-date-picker` with the week's 7 days selected (`multiple`), so the whole week is highlighted. Tapping any day picks its week. Week numbers are hidden on phones, where they make the picker too wide.
- **`DayPicker.vue`**: picks a day, like `WeekPicker`. `v-model` is `YYYY-MM-DD`, with `min`, `max`, `today` (for the label) and an `allowed(date)` function. The label reads "Today", "Yesterday", "Tomorrow" or "Wed, Oct 14" (`formatDayLabel`), and opens a `v-date-picker`. Previous/next jump to the nearest allowed day.
- **`TripPicker.vue`**: picks one of a day's trips, like `DayPicker`. `trips` are `{trip_id, start}` earliest first, `current` is the shown trip's id, `recorded` is a `Set` of trip ids to mark as recorded, and it emits `select` with a trip id. Previous/next buttons around a label with the current start time ("8:15 AM"), which opens a list of start times scrolled to the current one.
- **`TripCountsChart.vue`**: a Chart.js bar chart of `TripCount`s for a `by` period, in the theme's primary colour, with "Wed, Oct 14" / "Week of Oct 12" / "October 2026" tooltips. With `clickable` it emits `select` with a bar's period. 200px tall, 160px on phones.
- **`TrainTimes.vue`**: scheduled LRT trains (`UpcomingArrival`s) side by side in `columns` slots: minutes from now large ("Due" this minute), the clock time under it, and the headsign under each only when they differ. Used by the stop page's LRT cards and the route page's Next Trains.
- **`ServiceAlertCard.vue`**: one service alert (`AlertTiming`) as a tonal warning `v-alert`: the header, an effect chip, when it applies ("Until Thu, Oct 29 at 6:00 PM", "Starts tomorrow at 10:00 AM, until …", "Until further notice", "+ 11 more days" for a recurring one, `formatAlertPeriod`), and the description clamped to two lines with More/Less. `now` is the local time, and `show-routes` adds badges linking to each affected route.
- **`BusLink.vue`**: the only way to show a bus id. A `router-link` to `/buses/:id` reading "Bus N" (the slot overrides the text), with a faint underline. It stops click propagation, so it works inside tappable rows. Used on the map's bus card, Active Buses cards, stop page bus rows, the trip page, and the electric and hydrogen finders. The routes list's bus chips link to the bus page too.
- **`createBusIcon`** (`src/plugins/busIcon.js`) options: `showAge` (a ticking age badge), `label` (a fixed badge, such as a time, with its own `.bus-time-badge` class so `refreshReportAges` leaves it alone), `history` (a smaller pin) and `selected`.
- **`formatDistance`** (`src/utils/geo.js`): "350 m", or "1.2 km" from a kilometre. Used for the stop page's buses and stop list, and the bus finders.
- **Report ages** (`src/utils/reportAge.js`): `formatReportAge` gives "52s ago", "4m 12s ago", "3h 5m ago", "2d ago", and the date past a week. `reportAgeLevel` gives fresh, stale (over 5 min) or old (over 1 h).
- **Route colours** (`routeColor`, `src/utils/routes.js`): GTFS `route_color`, which only ETS's static GTFS zip has (not the open data routes dataset or the backend). Only the LRT lines' are kept, as a constant: Capital `#0081BC`, Metro `#FF0000`, Valley `#008000`.
- **`RouteBadge.vue`**: the only way to show a route number. A filled primary pill showing `routeNumber(routeId)`, in sizes `small`, `default` and `large`. Attributes pass through to the root, so callers can add `style` and `class`.
- **Full-width actions** use `<v-btn block variant="tonal" color="primary">`, as with "Trip details" and the trip page's "Route N at this stop".
- **Route header pattern:** a badge, the headsign as the title with the route's long name in small text under it (or the long name alone when there's no headsign), and an `mdi-chevron-right` to the route page, in a `.route-header` link with a hover tint. The long name carries the `route-name` view transition name, so it morphs into the route page's heading. Used by the map's bus card, the stop page's cards and the trip page. LRT lines drop the badge for a bar in the line's colour.

## View transitions

These use the same-document View Transitions API (`src/utils/viewTransition.js`). The timing is set globally in `App.vue`: `::view-transition-group(*)`, 300 ms ease. None play when reduced motion is preferred (`prefersReducedMotion`) or the API is missing.

### Map gestures (`src/plugins/mapGestures.js`)
Two Leaflet handlers, added to every map by `src/plugins/leaflet.js`:
- **`oneFingerZoom`** (on by default): double tap and hold, then drag down to zoom in or up to zoom out, as in Google Maps. One zoom level per 100 px, around the tapped point, snapped to the nearest level on release. A double tap without dragging still zooms in a level. It works on pointer events with pointer capture, as the tile under the finger can be removed while zooming, and cancels the second tap's `touchstart` so Leaflet doesn't drag, the page doesn't scroll and no click or dblclick follows. Taps on zoom buttons and popups are left alone.
- **`twoFingerPan`** (off by default): for maps inside a scrolling page. The container gets `touch-action: pan-x pan-y` (`leaflet-two-finger-pan` in `mapGestures.css`), a one-finger touch is kept from Leaflet's drag so it scrolls the page, and two fingers pan and pinch through Leaflet's `touchZoom`, with `touchmove` cancelled so the browser doesn't pan the page too. Dragging with one finger shows "Use two fingers to move the map" over the map for 1.5 s. Mouse and pen are unaffected.
- **`ctrlScrollZoom`** (off by default): the desktop side of `twoFingerPan`. A wheel or trackpad scroll over the map is kept from Leaflet's `scrollWheelZoom`, so it scrolls the page, and shows "Use Ctrl + scroll to zoom the map" ("⌘ + scroll" on a Mac) for 1.5 s. With Ctrl held (or ⌘ on a Mac) Leaflet zooms as usual. A trackpad pinch arrives as a wheel with Ctrl held, so it still zooms. Both handlers share one hint element per map.
- `TransitMap` (route, trip, bus and bus finder pages) turns `twoFingerPan` and `ctrlScrollZoom` on when it takes the shared map, and `NewBusMap` turns them off, as the main map fills the screen. The stops map fills the screen too (its list scrolls on its own), so it keeps one-finger panning.

### Shared map (main map, trip, bus and route pages)

- **One map instance** (`src/plugins/sharedMap.js`). `NewBusMap` and `TransitMap` don't create maps. They draw their layers on one Leaflet map, which `attachSharedMap(container, release)` moves into the page and `detachSharedMap(token)` takes out. So tiles stay loaded between pages, and the map can fly from one page's view to the next. Only one page may show it at a time. The bus finders use it too, through `TransitMap`. The stops page keeps its own `StopsMap`.
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
  - `route-number` and `route-name`: always set on the route page's heading and the trip page's heading (the badge, left out for LRT trips, and the long name under the headsign)
  - `bus-${bus}`: always set on the route page's Active Buses cards, the trip page's bus link and the bus page's "Bus N" heading
  - the main map's bus card sets all three only once one of its links is tapped (route header, "Trip details", bus link). It goes away with the page, so it never clashes with another page's names
  - each name must be unique on a page, so pages with many routes or buses (the bus page's trip rows) don't name them

### Route page (route list, stop page or map → route page)

- `navigateWithTransition(router, to)` wraps `router.push` in `document.startViewTransition`, waiting for the lazy route to load and then `nextTick`.
- `transitionLinkClick(event, router, to, setNamed)` is the click handler for a `<router-link custom>` + `<a :href>`. It leaves modifier and middle clicks to the browser, so they still open new tabs. It switches the caller's names on before the old page is captured and off afterwards.
- **Names:** `route-number` (badge), `route-name` (long name) and `bus-${bus}` (bus label → Active Buses chip). Every name must be unique on the page, so the source side only sets names on the tapped route. The route page always sets them (see the names above).
- **Handoff:** the source passes `history.state = { routeLongName, buses: [{ bus, trip }] }`. The route page shows these until its own `routes` and `buses` queries load, so the new snapshot has something to morph into.
- The routes list's "View details" button does the same for `route-number` and `route-name` (only the tapped row is named), passing just `routeLongName` in history state.
- From the routes list and the stop page these only morph going forward. To and from the map pages, the shared-map transition covers both directions.

## Conventions

- **Branches:** before starting or pushing, `git fetch origin main`. PRs are often merged as new commits with different hashes, so drop commits that are already upstream and rebase onto `origin/main` (`git cherry -v origin/main HEAD` shows them).
- **Detail buttons** (the full-width tonal "Trip details", "View details", "View trip" and "Route N at this stop" buttons) are `size="large"` and `height="50"`, for a bigger tap target.
- **Commits** follow conventional style (`feat:`, `fix:`, `perf:`, `refactor:`, `test:`, `ci:`, `chore:`), lowercase, with a body explaining why.
- **Location is only asked for when the user taps a locate button.** Never call `navigator.geolocation` on load or from a watcher, for privacy. The main map, stops map and bus finders each have their own button.
- **Comments** are short, lowercase, and explain *why*. Match the surrounding density.
- **Code:** reuse the utilities above rather than re-deriving (time, service days, route numbers, geo, status labels in `src/utils/busStatus.js`). Keep pure logic in `src/utils/` so it can be unit tested.
- **Tests:** put Vitest tests in `tests/*.test.js` and import from `vitest` (no globals). Test against fixed dates. 2026-10-14 is a Wednesday.
- **Browser smoke tests** (`e2e/*.e2e.js`, Playwright, not picked up by Vitest) cover what the unit tests can't: opening a bus on the main map, swiping its sheet away on a phone, stepping between trips, a stop's week on the trip page, a live trip's status and age badge, a detoured stop's details, the trip map's bounds, a route timetable's actual times, a route's page for a stop, Ctrl + scroll on an in-page map, and the not-found page. They run against a production build (`vite build && vite preview`) on a desktop and a phone (Pixel 7) project.
  - `e2e/mockApi.js` answers every request: the backend (`VITE_APP_API_URL` is `http://api.test`), `data.edmonton.ca` by dataset id, and Mapbox tiles (aborted). Its feed is one route (8) with three trips (5001–5003, 8, 9 and 10 AM) along four stops and one trip back (6001, 11 AM, "8 Abbottsfield", direction 1) along the stops across the street (2004–2001) (the stop schedule view only answers a route's times at one stop), running every day, bus 4699 on trip 5002, a detour naming the last stop, and the same actual stop times for the route on any day. Add to it when a test needs more, and keep it small.
  - Import `test` and `expect` from `e2e/fixtures.js`, which installs the mocks and fails a test on any uncaught page error.
  - Wait for the bus sheet with `settledBox` before swiping it: it slides up from below the screen, and a box read before then aims the touch off screen.
  - The main map swaps each bus marker on every update, and the buses update twice on load (again once their routes are known), so tap a bus with `openBus`, which retries until its card opens.
  - Locally, a Chromium other than the one the installed Playwright expects can be used with `PLAYWRIGHT_CHROMIUM_PATH`. An already running `vite preview` on port 4173 is reused outside CI.
- **CI:**
  - `.github/workflows/eslint.yml` runs ESLint as a SARIF scan.
  - `.github/workflows/test.yml` ("Tests") runs `npm ci` and `npm test` on Node 22, on PRs and on pushes to `main`. Its second job, on PRs only, installs Playwright's Chromium and runs `npm run test:e2e`, uploading the HTML report and traces when it fails.
- **Dependencies:** npm 10.9 can crash with `Cannot read properties of null (reading 'edgesOut')` when adding packages with optional peers. Use `npx npm@11 i …` for the install. `npm ci` on npm 10 works fine.
- **UI checks:** use Playwright with Chromium (`/usr/bin/google-chrome` locally) at 1280px and 375px. Good stops to try:
  - `1987` (routes 8 and 902)
  - `5381` (West Edmonton Mall, 12 routes, a mix of live and quiet)
  - `1620` (downtown, includes regional agencies)
