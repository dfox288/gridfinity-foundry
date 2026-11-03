import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// dev: `pnpm dev` with the server on :8742 (API_URL to change it)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": process.env.API_URL ?? "http://localhost:8742",
      "/files": process.env.API_URL ?? "http://localhost:8742",
    },
  },
  build: { chunkSizeWarningLimit: 2000 },
});
