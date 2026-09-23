import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'app/**/*.test.ts',
      'app/**/*.test.tsx',
      'electron/**/*.test.ts',
      'lib/**/*.test.ts',
      'packages/**/*.test.ts',
      'server/**/*.test.ts',
    ],
  },
});
