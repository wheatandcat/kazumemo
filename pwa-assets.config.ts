import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

const background = '#1D211C';

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
});
