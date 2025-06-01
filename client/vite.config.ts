import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  envDir: "../",
  server: {
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: "http://localhost:5185",
        changeOrigin: true,
        ws: true,
        //rewrite: (path) => path.replace(/^\/api/, ""),
      },
      "/test": {
        target: "http://localhost:8000",
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/test/, ""),
      },
    },
  },
});
