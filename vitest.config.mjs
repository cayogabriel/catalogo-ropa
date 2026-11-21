import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'test/**/*.test.mjs',
      'apps-script/test/**/*.test.mjs',
      'apps-script/panel/dev/**/*.test.mjs',
      'contratos/**/*.test.mjs',
      'web/test/**/*.test.mjs',
    ],
    environment: 'node',
  },
});
