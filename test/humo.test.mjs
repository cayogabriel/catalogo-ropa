import { test, expect } from 'vitest';

test('el entorno de pruebas funciona', () => {
  expect(typeof process.version).toBe('string');
});
