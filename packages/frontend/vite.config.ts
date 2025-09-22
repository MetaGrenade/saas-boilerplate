import { resolve } from 'node:path';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@saas-boilerplate/shared': resolve(__dirname, '../shared/src'),
    },
  },
  server: {
    port: 5173,
    open: true
  },
  preview: {
    port: 4173
  }
});
