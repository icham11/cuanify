import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.VISUAL_BASE_URL || "http://localhost:3001";
const useManagedWebServer = !process.env.VISUAL_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  snapshotPathTemplate:
    "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1536, height: 960 },
      },
    },
    {
      name: "mobile-chromium",
      use: {
        browserName: "chromium",
        ...devices["Pixel 7"],
      },
    },
  ],
  webServer: useManagedWebServer
    ? {
        command: "npm run dev:webpack -- --port 3001",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      }
    : undefined,
});
