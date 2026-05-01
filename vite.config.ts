/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  build: {
    target: 'safari14',
    rollupOptions: {
      output: {
        // Function form (works in Vite 5/6/7/8). The object form was
        // dropped in Vite 8 / Rolldown, which broke local + Vercel
        // builds the moment the lockfile resolved vite to ^8.0.10.
        manualChunks(id: string) {
          if (!id.includes('node_modules/')) return undefined;
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/@supabase/')) return 'vendor-supabase';
          if (
            id.includes('node_modules/recharts/') ||
            id.includes('node_modules/d3-')
          ) {
            return 'vendor-charts';
          }
          if (id.includes('node_modules/lucide-react/')) return 'vendor-icons';
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
