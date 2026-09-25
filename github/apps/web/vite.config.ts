import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Relative base lets the built dashboard be served by the backend itself.
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8600',
    },
  },
});
