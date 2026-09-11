import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Mirror the "@/*" path alias declared in tsconfig.json so runtime +
    // build resolution matches the editor/typecheck resolution.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // Listen on 0.0.0.0 so the dev server is reachable from outside the
    // container (directly on :5173 and through nginx on :80).
    host: true,
    port: 5173,
    watch: {
      // Docker bind mounts on macOS/Windows don't reliably deliver native FS
      // events into the container, so Vite would miss edits. Polling makes HMR
      // fire on every save. Drop this if you ever run the dev server on the host.
      usePolling: true,
    },
  },
});
