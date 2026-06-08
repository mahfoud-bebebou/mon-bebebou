'use client'
import { useEffect } from 'react'
export default function PWAInstaller() {
  useEffect(() => {
    // Enregistre le service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(reg => {
          console.log('SW registered:', reg)

          // Demande permission notifications
          if ('Notification' in window &&
              Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
              console.log('Notification permission:', permission)
            })
          }
        })
    }
  }, [])
  return null
}
