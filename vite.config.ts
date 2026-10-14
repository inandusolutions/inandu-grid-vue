/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [vue(), dts({ include: ['src'], exclude: ['src/**/*.test.*', 'src/test-setup.ts'] })],
  build: {
    lib: {
      entry: fileURLToPath(new URL('src/index.ts', import.meta.url)),
      formats: ['es', 'cjs'],
      fileName: 'inandu-grid-vue',
    },
    rollupOptions: {
      external: ['vue', 'jspdf'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
});
