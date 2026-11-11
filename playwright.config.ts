import { defineConfig, devices } from "@playwright/test";

// One smoke test against the dev server, with Supabase answered from fixtures (e2e/fake-supabase.ts).
export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:5179", trace: "off" },
  projects: [
    // Folded: one column, the detail is a sheet.
    { name: "zugeklappt", use: { ...devices["Galaxy S9+"], viewport: { width: 412, height: 915 } } },
    // Unfolded in landscape: list and detail side by side.
    { name: "aufgeklappt", use: { viewport: { width: 1180, height: 820 } } },
  ],
  webServer: {
    command: "npx vite --port 5179 --strictPort",
    url: "http://localhost:5179",
    reuseExistingServer: !process.env.CI,
  },
});
