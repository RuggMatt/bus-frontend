import { defineConfig, devices } from "@playwright/test";
import { API_URL } from "./e2e/mockApi.js";

const PORT = 4173;

// browser smoke tests against a production build, with every request answered by
// the fake feed in e2e/mockApi.js. Run with `npm run test:e2e`
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.js",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    timezoneId: "America/Edmonton",
    // a Chromium already on the machine, when the installed Playwright's isn't
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: `vite build && vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    env: {
      VITE_APP_API_URL: API_URL,
      VITE_APP_SODA_APP_TOKEN: "",
      VITE_APP_MAPBOX_ACCESS_TOKEN: "",
    },
  },
});
