import { defineConfig } from 'vite';

// Cross-origin isolation lets the HD voices (voices-hd.ts) run the model on several CPU threads. `credentialless`
// keeps cross-origin images, fonts and the room server working without them having to opt in. The same two headers
// are served in production by public/_headers.
const isolation = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' };

export default defineConfig({
  server: { port: 3730, strictPort: true, host: '127.0.0.1', headers: isolation },
  preview: { port: 3731, strictPort: true, headers: isolation },
  build: { target: 'es2022', sourcemap: false, chunkSizeWarningLimit: 900 },
});
