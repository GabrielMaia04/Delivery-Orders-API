// Service Worker - Hortifruti
const CACHE = 'hortifruti-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Recebe notificação push
self.addEventListener('push', e => {
  const data = e.data ?e.data.json() : {};
  const title = data.title || 'Novo pedido!';
  const options = {
    body: data.body || 'Um novo pedido foi realizado.',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: '/loja' },
    actions: [
      { action: 'ver', title: 'Ver pedido' }
    ]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Clique na notificação - abre o sistema
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length > 0) return list[0].focus();
      return clients.openWindow('/loja');
    })
  );
});
