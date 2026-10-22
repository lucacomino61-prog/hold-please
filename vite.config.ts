import { defineConfig } from 'vite';

export default defineConfig({
  server: { port: 3730, strictPort: true, host: '127.0.0.1' },
  preview: { port: 3731, strictPort: true },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
});