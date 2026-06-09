// Reset complet du service worker
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', async () => {
  const subs = await self.registration.pushManager.getSubscription()
  if (subs) await subs.unsubscribe()
  await clients.claim()
})
