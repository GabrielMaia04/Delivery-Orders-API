self.addEventListener('install', event => {
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', event => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = {};
  }

  const title = data.title || 'Novo pedido';
  const options = {
    body: data.body || 'Um novo pedido foi realizado.',
    icon: '/public/favicon-96x96.png',
    badge: '/public/favicon-96x96.png',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/adm/' },
    actions: [
      { action: 'ver', title: 'Ver no admin' },
      { action: 'fechar', title: 'Fechar' }
    ]
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'fechar') return;

  const url = event.notification.data?.url || '/adm/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const adminClient = clients.find(client => client.url.includes('/adm'));
      if (adminClient) return adminClient.focus();
      return self.clients.openWindow(url);
    })
  );
});
