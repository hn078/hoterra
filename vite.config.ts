import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Production is a history-based SPA. Root-relative assets keep deep routes
  // such as /workforce/:requestId from resolving assets under /workforce/assets.
  base: '/',
  server: {
    port: 5173,
  },
  preview: {
    allowedHosts: true,
  },
});
