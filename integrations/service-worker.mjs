import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateSW } from 'workbox-build';

/**
 * ビルド後の dist を precache する Service Worker (sw.js) を生成する。
 * @vite-pwa/astro が Astro 7 未対応のため workbox-build を直接使う。
 * @returns {import('astro').AstroIntegration}
 */
export function serviceWorker() {
  return {
    name: 'kazumemo:service-worker',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = fileURLToPath(dir);
        const { count, size, warnings } = await generateSW({
          globDirectory: outDir,
          globPatterns: ['**/*.{html,js,css,svg,png,ico,webmanifest}'],
          swDest: join(outDir, 'sw.js'),
          mode: 'production',
          clientsClaim: true,
          skipWaiting: true,
          cleanupOutdatedCaches: true,
          // 詳細画面は /users/detail/?id=... のようにクエリで受けるので、クエリを無視して precache に当てる
          ignoreURLParametersMatching: [/.*/],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
              handler: 'StaleWhileRevalidate',
              options: { cacheName: 'google-fonts-css' },
            },
            {
              urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-files',
                cacheableResponse: { statuses: [0, 200] },
                expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              },
            },
          ],
        });
        for (const warning of warnings) logger.warn(warning);
        logger.info(`sw.js generated: ${count} files precached (${(size / 1024).toFixed(1)} KiB)`);
      },
    },
  };
}
