import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'app/store/**/*.test.ts',
      'electron/**/*.test.ts',
      'lib/**/*.test.ts',
      'packages/**/*.test.ts',
      'server/**/*.test.ts',
    ],
  },
});
