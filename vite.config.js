import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Mã commit đang build (GitHub Actions có sẵn GITHUB_SHA), dùng làm số phiên bản hiển thị trong app
function commitSha() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

// App được host tại https://tmduc30697.github.io/drafts/ nên base phải là /drafts/
export default defineConfig({
  base: '/drafts/',
  define: {
    __APP_VERSION__: JSON.stringify(commitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
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
