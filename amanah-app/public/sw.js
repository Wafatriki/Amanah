// Service Worker para manejar notificaciones push
const CACHE_NAME = 'amanah-v2-notif-only';

// Instalación del Service Worker
self.addEventListener('install', event => {
  console.log('Service Worker instalado - v2');
  self.skipWaiting(); // Activar inmediatamente
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  console.log('Service Worker activado - v2');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Limpiando cache viejo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Manejo de notificaciones push
self.addEventListener('push', event => {
  console.log('Push recibido:', event);

  let notificationData = {
    title: 'Amanah - Nueva Notificación',
    options: {
      icon: '/assets/logos/amanah-logo.svg',
      badge: '/assets/logos/amanah-logo.svg',
      tag: 'amanah-notification',
      requireInteraction: true
    }
  };

  if (event.data) {
    try {
      const data = event.data.json();
      notificationData = {
        title: data.title || notificationData.title,
        options: {
          body: data.body || '',
          icon: data.icon || '/assets/logos/amanah-logo.svg',
          badge: data.badge || '/assets/logos/amanah-logo.svg',
          tag: data.tag || 'amanah-notification',
          requireInteraction: true,
          data: data
        }
      };
    } catch (e) {
      notificationData.options.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, notificationData.options)
  );
});

// Manejo de mensajes desde la app (postMessage)
self.addEventListener('message', event => {
  console.log('[SW-MESSAGE] Mensaje recibido:', event.data);

  if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
    const { title, options } = event.data;
    console.log('[SW-MESSAGE] Mostrando notificación:', title);

    self.registration.showNotification(title, {
      icon: '/assets/logos/amanah-logo.svg',
      badge: '/assets/logos/amanah-logo.svg',
      requireInteraction: true,
      ...options,
      tag: options?.tag || 'amanah-notification'
    }).then(() => {
      console.log('[SW-MESSAGE] ✅ Notificación mostrada exitosamente');
    }).catch(error => {
      console.error('[SW-MESSAGE] ❌ Error mostrando notificación:', error);
    });
  }
});

// Manejo de click en notificación push
self.addEventListener('notificationclick', event => {
  console.log('Notificación clickeada');
  event.notification.close();

  // Abrir o enfocar la app
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(clientList => {
      for (let client of clientList) {
        if (client.url === '/' || client.url.includes('localhost') || client.url.includes('amanah')) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});

// NO CACHEAR REQUESTS - Dejar que siempre vayan a la red
self.addEventListener('fetch', event => {
  // El Service Worker solo está aquí para notificaciones push
  // NO hacemos caching de requests para evitar problemas con POST/PUT/DELETE
});
