// Service Worker — Cortadinhos com Carinho
const CACHE = 'cortadinhos-v1';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
});

// Recebe notificação push
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || '🛎️ Novo pedido!';
  const options = {
    body: data.body || 'Um novo pedido foi realizado.',
    icon: '/public/favicon-96x96.png',
    badge: '/public/favicon-96x96.png',
    vibrate: [200, 100, 200, 100, 200],
    data: { url: '/adm' },
    actions: [
      { action: 'ver', title: '👀 Ver no admin' },
      { action: 'fechar', title: 'Fechar' }
    ]
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Clique na notificação — abre o admin
self.addEventListener('notificationclick', e => {
  e.notification.close();
  if (e.action === 'fechar') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const adm = list.find(c => c.url.includes('/adm'));
      if (adm) return adm.focus();
      return clients.openWindow('/adm');
    })
  );
});
