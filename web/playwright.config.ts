// End-to-end checks in a real browser against a running app: `docker compose up -d --build`, then `pnpm e2e`
// (E2E_URL points elsewhere, e.g. E2E_URL=http://localhost:5173 for `pnpm dev`). WebGL in headless Chromium runs on
// SwiftShader, so it works without a GPU.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.e2e.ts",
  timeout: 90_000,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_URL ?? "http://localhost:8742",
    viewport: { width: 1600, height: 950 },
    launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
});
