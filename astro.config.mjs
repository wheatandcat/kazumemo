import { defineConfig } from 'astro/config';
import { serviceWorker } from './integrations/service-worker.mjs';

export default defineConfig({
  // OGP の画像・URL を絶対 URL にするために使う
  site: 'https://kazumemo.wheatandcat.workers.dev',
  output: 'static',
  integrations: [serviceWorker()],
});
