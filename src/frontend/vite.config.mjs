import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // keeps the Create React App variable name (REACT_APP_API_URL) working
  envPrefix: ["VITE_", "REACT_APP_"],
  server: {
    host: true,
    port: 3000,
    strictPort: true,
    // file changes on the bind mount don't always reach the container without polling
    watch: { usePolling: process.env.WATCHPACK_POLLING === "true" },
  },
  preview: { host: true, port: 3000 },
  build: { outDir: "build" },
});
