import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5188,
    // The compliance assistant runs on the main Vocare backend.
    proxy: { '/api': 'http://localhost:5182' }
  }
});
