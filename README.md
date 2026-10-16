# bus-frontend 🚌

The frontend for https://bus.ruggmatt.dev: live Edmonton Transit buses on a map, stop arrivals, route timetables, and the recorded history of every trip and bus.

It reads live and recorded positions from [bus-data-collection](https://github.com/ruggmatt/bus-data-collection), and the schedule from the City of Edmonton's open data. 

Built with Vue 3, Vite, Vuetify, TanStack Vue Query and Leaflet.

## Setup

Requires Node 22.

```sh
npm ci
cp .env.example .env
```

Then fill in `.env`:

- `VITE_APP_API_URL`: the bus-data-collection backend
- `VITE_APP_SODA_APP_TOKEN`: a City of Edmonton open data app token
- `VITE_APP_MAPBOX_ACCESS_TOKEN`: a Mapbox token for the map tiles

## Scripts

```sh
npm run dev     # dev server with hot reload
npm run build   # production build in dist/
npm run lint    # eslint over src/ and tests/ (also runs on pre-commit)
npm test        # vitest unit tests
```

## How it works

[SPEC.md](SPEC.md) describes the pages, data sources, shared components and conventions. Keep it up to date when behaviour changes.
