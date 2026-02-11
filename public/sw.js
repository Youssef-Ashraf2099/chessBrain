/* global workbox */

importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js",
);

if (workbox) {
  workbox.core.skipWaiting();
  workbox.core.clientsClaim();

  workbox.routing.registerRoute(
    ({ url, request }) =>
      url.origin === self.location.origin &&
      (request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "image" ||
        request.destination === "audio" ||
        request.destination === "font" ||
        url.pathname.endsWith(".wasm")),
    new workbox.strategies.CacheFirst({
      cacheName: "static-assets",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 120,
          maxAgeSeconds: 60 * 60 * 24 * 30,
        }),
      ],
    }),
  );

  workbox.routing.registerRoute(
    ({ url }) =>
      url.origin === "https://api.chess.com" &&
      url.pathname.includes(`/pub/player/${"Youssef-2099".toLowerCase()}`),
    new workbox.strategies.StaleWhileRevalidate({
      cacheName: "chess-api",
      plugins: [
        new workbox.expiration.ExpirationPlugin({
          maxEntries: 50,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        }),
      ],
    }),
  );
}
