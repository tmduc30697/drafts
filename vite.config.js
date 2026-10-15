import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// App được host tại https://tmduc30697.github.io/drafts/ nên base phải là /drafts/
export default defineConfig({
  base: '/drafts/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt': có bản mới thì hỏi người dùng (snackbar), không tự reload giữa lúc đang gõ
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'logo.svg'],
      manifest: {
        name: 'Drafts',
        short_name: 'Drafts',
        description: 'Ghi chú kiểu Notion, đồng bộ giữa điện thoại và máy tính',
        lang: 'vi',
        start_url: '/drafts/',
        scope: '/drafts/',
        display: 'standalone',
        background_color: '#191919',
        theme_color: '#191919',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache sẵn toàn bộ app để mở được khi offline (chunk editor khá lớn nên nới giới hạn)
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
