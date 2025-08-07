import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  publicDir: "public",
  envDir: "../",
  server: {
    strictPort: true,
    allowedHosts: true,
    hmr: {
      path: "/.proxy/hmr",
      clientPort: 443,
    },
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY || "http://localhost:5000",
        changeOrigin: true,
        ws: true,
      },
    },
    port: process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 8080,
  },
  build: {
    outDir: "build",
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          discord: ["@discord/embedded-app-sdk", "@xhayper/discord-rpc"],
          microsoft: ["@microsoft/signalr"],
          hlsjs: ["hls.js"],
          dnd: ["@dnd-kit/core", "@dnd-kit/sortable", "@dnd-kit/utilities"],
        },
      },
    },
  },
});
