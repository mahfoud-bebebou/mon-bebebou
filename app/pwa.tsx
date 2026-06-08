'use client'
import { useEffect } from 'react'
export default function PWAInstaller() {
  useEffect(() => {
    // Enregistre le service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(reg => console.log('SW registered:', reg))
        .catch(err => console.log('SW error:', err))
    }
  }, [])
  return null
}
