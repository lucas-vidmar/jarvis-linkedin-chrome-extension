import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      // Count every source module, including ones no test imports yet, so the
      // totals reflect the whole `src/` tree rather than only the files a test
      // happened to load.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
      // Measured baseline on 2026-11-27: statements 28.96%, branches 32.67%,
      // functions 38.13%, lines 29.75%. Thresholds sit roughly one point below
      // so normal churn passes while a real regression fails.
      thresholds: {
        statements: 28,
        branches: 31,
        functions: 37,
        lines: 29,
      },
    },
  },
});
