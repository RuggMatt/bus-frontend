# Agent notes

- Read `SPEC.md` first. It describes how the app works, the data sources and the conventions, and should be kept up to date when behaviour changes.
- The backend (`VITE_APP_API_URL`, the bus-data-collection server) describes its API in OpenAPI 3.1 at `http://localhost:3000/openapi.json` when it's running locally. Fetch it before adding or changing backend calls, as it may have endpoints SPEC.md doesn't list yet.
