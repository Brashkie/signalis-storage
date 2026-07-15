import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Node environment — these stores touch the filesystem.
    environment: 'node',
    globals: false,
    include: ['__tests__/**/*.test.ts'],

    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        // Interface-only files (no runtime code to cover)
        'src/codec.ts',
        'src/types.ts',
        '**/*.d.ts',
      ],
      // Storage is small and fully exercised — hold a high bar.
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
