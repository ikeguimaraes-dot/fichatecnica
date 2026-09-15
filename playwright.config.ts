import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:4173", headless: true },
  webServer: {
    command: "npm run build && npm run preview -- --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
  workers: 1,
  reporter: "list",
});
