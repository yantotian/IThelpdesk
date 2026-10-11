import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import viteCompression from 'vite-plugin-compression'
import path from 'path'

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    // Emit precompressed .gz alongside hashed assets so nginx can serve them
    // directly via `gzip_static` without compressing on every request.
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
      threshold: 1024,
      deleteOriginFile: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Group the core React runtime into a long-cached chunk. We deliberately
        // avoid grouping feature libraries (recharts, jspdf, radix) here: doing
        // so hoists shared runtime helpers into those chunks and pulls them into
        // the initial preload graph, defeating route-level code splitting.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('react-router')) return 'react';
          if (
            id.includes('react-dom') ||
            id.includes('/react/') ||
            id.includes('scheduler')
          ) {
            return 'react';
          }
        },
      },
    },
  },
  server: {
    // Uploads are NOT proxied from /uploads: they are only reachable through
    // /api/files/<signed-token>, which the Express API authorizes.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
