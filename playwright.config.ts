import { defineConfig } from "@playwright/test";
const port = Number(process.env.LE_CHEF_TEST_PORT || 4279);
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: `http://localhost:${port}`, headless: true },
  webServer: {
    command: `npm run build && npm run preview -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
  },
  workers: 1,
  reporter: "list",
});
