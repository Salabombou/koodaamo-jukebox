import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), react()],
  envDir: mode !== "production" ? "../" : ".",
  server: {
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/api": {
        target: "http://localhost:5185",
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: "build",
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          discord: ["@discord/embedded-app-sdk"],
          hlsjs: ["hls.js"],
        },
      },
    },
  },
}));
