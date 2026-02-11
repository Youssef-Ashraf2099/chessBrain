import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg', 'sounds/*.mp3', 'movements/*.png'],
      manifest: {
        name: 'Chess Replay',
        short_name: 'Chess Replay',
        description: 'Chess Replay and Game Review for Youssef-2099',
        theme_color: '#00809dff',
        background_color: '#1a2332',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'icons/icons8-chess-com-48.png',
            sizes: '48x48',
            type: 'image/png'
          },
          {
            src: 'icons/icons8-chess-com-96.png',
            sizes: '96x96',
            type: 'image/png'
          },
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/chess-512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            src: 'icons/chess-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,mp3,wasm}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.chess\.com\/pub\/player\/.+/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'chess-api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 1 week
              },
            },
          },
        ],
      },
      devOptions: {
        enabled: true
      }
    })
  ],
});
