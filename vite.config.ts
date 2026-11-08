import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // During `npm run dev`, API calls go to `wrangler pages dev` running on 8790.
    proxy: { '/api': 'http://localhost:8790' },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: { chart: ['chart.js'] },
      },
    },
  },
  test: {
    include: ['shared/**/*.test.ts'],
  },
});
