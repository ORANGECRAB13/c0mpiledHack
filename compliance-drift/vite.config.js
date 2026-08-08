import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5188,
    // The compliance assistant runs on the main Vocare backend.
    // ws:true so the live officer-voice WebSocket (/api/voice/officer) proxies too.
    proxy: { '/api': { target: 'http://localhost:5182', ws: true, changeOrigin: true } }
  }
});
