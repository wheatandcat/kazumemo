import { defineConfig } from 'astro/config';
import { serviceWorker } from './integrations/service-worker.mjs';

export default defineConfig({
  output: 'static',
  integrations: [serviceWorker()],
});
