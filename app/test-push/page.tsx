'use client'
import { useState } from 'react'

const VAPID_KEY = 'VvbaxsFAW0BxLa61004fDHaU1fp2TYAXvOfp25URnkgbCf7jryzQyRWj7NFqwI4V-VMbbw4sv0_ceFwL08_3cA'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function TestPush() {
  const [log, setLog] = useState<string[]>([])

  const addLog = (msg: string) => {
    setLog(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  const testPush = async () => {
    setLog([])

    addLog('Notification in window: ' + ('Notification' in window))
    addLog('ServiceWorker in navigator: ' + ('serviceWorker' in navigator))
    addLog('PushManager in window: ' + ('PushManager' in window))
    addLog('Permission: ' + Notification.permission)

    if (Notification.permission !== 'granted') {
      addLog('Demande de permission...')
      const perm = await Notification.requestPermission()
      addLog('Permission après demande: ' + perm)
      if (perm !== 'granted') {
        addLog('ERREUR: Permission refusée')
        return
      }
    }

    try {
      const reg = await navigator.serviceWorker.ready
      addLog('SW ready ✅')

      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await existing.unsubscribe()
        addLog('Ancien abonnement supprimé')
      }

      const newSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
      })
      addLog('Abonnement créé ✅')
      addLog('Endpoint: ' + newSub.endpoint.slice(0, 60) + '...')

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: newSub.toJSON(),
          baby_id: 'cf31ec10-ef6e-4b8f-96b4-1737823d4f44',
          user_id: 'd1562a1a-0a59-4095-8696-263b7f0a369c'
        })
      })
      const json = await res.json()
      addLog('API response: ' + res.status + ' ' + JSON.stringify(json))
      addLog('🎉 SUCCÈS - Abonnement enregistré !')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      addLog('ERREUR: ' + message)
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h2>Test Push</h2>
      <button
        onClick={testPush}
        style={{
          padding: '12px 24px',
          backgroundColor: '#E8406A',
          color: 'white',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          marginBottom: 20
        }}
      >
        Tester les notifications
      </button>
      <div style={{ backgroundColor: '#f5f5f5', padding: 16, borderRadius: 8 }}>
        {log.length === 0 && <p>Clique sur le bouton pour tester</p>}
        {log.map((l, i) => (
          <div key={i} style={{
            padding: '4px 0',
            color: l.includes('ERREUR')
              ? 'red'
              : l.includes('✅') || l.includes('SUCCÈS')
                ? 'green'
                : 'black'
          }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  )
}
