const CACHE_NAME = 'bebebou-v1'
self.addEventListener('install', event => {
  self.skipWaiting()
})
self.addEventListener('activate', event => {
  event.waitUntil(clients.claim())
})
// NE PAS intercepter les requêtes de navigation
// Laisser le réseau gérer toutes les pages
self.addEventListener('fetch', event => {
  // Ignore les requêtes non-GET
  if (event.request.method !== 'GET') return
  
  // Ignore les requêtes de navigation (pages HTML)
  // pour éviter les conflits avec les redirections Next.js
  if (event.request.mode === 'navigate') return
  
  // Cache uniquement les assets statiques (images, fonts, etc.)
  const url = new URL(event.request.url)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/logo-icon')
  ) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(event.request).then(cached =>
          cached || fetch(event.request).then(response => {
            cache.put(event.request, response.clone())
            return response
          })
        )
      )
    )
  }
})
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(
      data.title || '🍼 Mon Bébébou',
      {
        body: data.body || "C'est l'heure du biberon !",
        icon: '/logo-icon-192.png',
        badge: '/logo-icon-192.png',
        vibrate: [200, 100, 200],
        data: { url: '/' }
      }
    )
  )
})
self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/'))
})
