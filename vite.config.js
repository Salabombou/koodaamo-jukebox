import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ isSsrBuild }) => {
  if (isSsrBuild) {
    return {};
  }
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            discord: ['@discord/embedded-app-sdk'],
            hls: ['hls.js']
          }
        }
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          ws: true
        }
      }
    }
  };
});
