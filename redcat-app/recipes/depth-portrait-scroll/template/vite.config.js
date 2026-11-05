import { defineConfig } from 'vite';

// base './' so the built dist works from any static host or file path
// (same fix the frontend-libraries skill documents for Vite builds).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true },
});
