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
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/test-fixtures/**'],
      // Measured baseline on 2026-11-27 after the LinkedIn DOM test suite,
      // excluding test fixtures: statements 81.35%, branches 75.59%,
      // functions 84.77%, lines 83.67%. Thresholds sit roughly one point below
      // so normal churn passes while a real regression fails.
      thresholds: {
        statements: 80,
        branches: 75,
        functions: 84,
        lines: 82,
      },
    },
  },
});
