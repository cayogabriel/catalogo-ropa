import { defineConfig } from 'astro/config';
import { SITIO, BASE } from './sitio.config.mjs';

export default defineConfig({
  site: SITIO,
  base: BASE,
  trailingSlash: 'always',
});
