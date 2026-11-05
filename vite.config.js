import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// The API port is read from FixHistory/.env (PORT), defaulting to 5000.
// During development every request to /api is forwarded to the Express server,
// so the browser sees one address and the login cookie works without CORS issues.
export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, '..', '');
  const apiTarget = `http://127.0.0.1:${rootEnv.PORT || 5000}`;
  const proxy = { '/api': { target: apiTarget, changeOrigin: false } };

  return {
    plugins: [react()],
    server: { port: 5173, strictPort: true, proxy },
    preview: { port: 4173, proxy },
    build: { outDir: 'dist', chunkSizeWarningLimit: 1500 },
  };
});
