import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: `npm run dev` here serves on :5173 and proxies the API + voice WS to the
// Express backend on :5182. Build: outputs to ../frontend-dist, which Express
// serves as the primary UI when present (see src/server.js static roots).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/voice/stream': { target: 'ws://localhost:5182', ws: true },
      '/api': { target: 'http://localhost:5182', changeOrigin: true }
    }
  },
  build: {
    outDir: '../frontend-dist',
    emptyOutDir: true
  }
});
