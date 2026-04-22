import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Dev config:
  // - proxy /api/* → backend FastAPI for same-origin fetches
  // - allowedHosts: *.ngrok-free.dev for device QA via ngrok tunnel
  // Prod: this dev server is not used, these settings are ignored
  server: {
    port: 5173,
    host: true,
    allowedHosts: [".ngrok-free.dev"],
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
