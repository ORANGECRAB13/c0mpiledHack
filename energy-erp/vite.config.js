import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/erp/',
  build: {
    outDir: '../energy-erp-dist',
    emptyOutDir: true
  },
  server: {
    port: 5182
  }
});
