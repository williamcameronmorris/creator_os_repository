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
        // recharts (with its d3 dependencies) and the Supabase client are the
        // two heavy deps that would otherwise sit in the entry chunk. Splitting
        // them out keeps the entry small and lets both cache across deploys
        // that only touch app code. React is named explicitly so it stays in
        // its own chunk instead of being absorbed into the recharts one.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          recharts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
