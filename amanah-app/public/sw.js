// Kill-switch SW: remove any stale registration/caches from old versions.
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));

    const clientsList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clientsList.map(client => client.navigate(client.url)));

    await self.registration.unregister();
  })());
});
