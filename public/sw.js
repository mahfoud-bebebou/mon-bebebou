const CACHE_NAME = 'bebebou-v1'
const urlsToCache = ['/', '/login', '/register']
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => 
      cache.addAll(urlsToCache)
    )
  )
})
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response =>
      response || fetch(event.request)
    )
  )
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
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  )
})
