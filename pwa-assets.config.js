import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Sinh icon PWA từ public/logo.svg: npx @vite-pwa/assets-generator@1
// Icon iOS và maskable dùng nền tối phủ kín (hệ điều hành tự bo góc)
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0.25, resizeOptions: { background: '#191919' } },
    apple: { ...minimal2023Preset.apple, padding: 0.2, resizeOptions: { background: '#191919' } },
  },
  images: ['public/logo.svg'],
});
