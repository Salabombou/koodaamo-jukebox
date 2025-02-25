import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [tailwindcss(), react()],
  envDir: mode !== "production" ? "../" : ".",
  server: {
    strictPort: true,
    allowedHosts: true,
    hmr: {
      path: "/.proxy/hmr",
      clientPort: 443,
    },
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
        ws: true,
      },
    },
    port: 8080,
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
        },
      },
    },
  },
}));
