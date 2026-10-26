import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// Serves the e2e harness, which imports the library straight from ../../src so the tests exercise
// the code in this checkout (not the published package the marketing `site/` installs).
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: { port: 4204, strictPort: true },
});
