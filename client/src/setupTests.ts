import '@testing-library/jest-dom';

// Mock import.meta
Object.defineProperty(global, 'import', {
  value: {
    meta: {
      env: {
        VITE_DISCORD_APPLICATION_ID: 'test-app-id',
      },
    },
  },
});
