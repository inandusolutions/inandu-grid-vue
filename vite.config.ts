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
      external: ['vue', 'jspdf', '@inandu-solutions/grid-core'],
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    // Measured 2026-11-19: statements 87.5, branches 82.1, functions 89.2, lines 89.1.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.test.*', 'src/test-setup.ts'],
      reporter: ['text-summary', 'text'],
      // A few points under what is measured today: a drop fails CI, normal change does not. Raise them when coverage rises.
      thresholds: { statements: 84, branches: 79, functions: 86, lines: 86 },
    },
  },
});
