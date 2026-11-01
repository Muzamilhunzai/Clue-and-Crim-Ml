import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// In development the browser talks to Vite (5173); /api is proxied to the Express server (4000).
// The frontend never touches the SQLite file: it only ever calls the REST API.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 700 },
});
