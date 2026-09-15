import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:5174", headless: true },
  workers: 1,
  reporter: "list",
});
