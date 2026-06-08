'use client'
import { useState } from 'react'

const VAPID_KEY = 'BFvgxcal0hATPPbDa3q0HVvFK_YymRVNknJQWFpIq04ac-8NgKKqZPrPTqBbYsqsDXyCcNqY2DWCN4wi-EEMMvw'

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

    try {
      const reg = await navigator.serviceWorker.ready
      addLog('SW ready ✅')

      const sub = await reg.pushManager.getSubscription()
      addLog('Existing sub: ' + (sub ? '✅ oui' : '❌ non'))

      const newSub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_KEY
      })
      addLog('New sub créé ✅')
      addLog('Endpoint: ' + newSub.endpoint.slice(0, 50) + '...')

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: newSub.toJSON(),
          baby_id: 'cf31ec10-ef6e-4b8f-96b4-1737823d4f44',
          user_id: 'd1562a1a-0a59-4095-869f-example'
        })
      })
      addLog('API response: ' + res.status)

    } catch(err: any) {
      addLog('ERREUR: ' + err.message)
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
            color: l.includes('ERREUR') ? 'red' : l.includes('✅') ? 'green' : 'black'
          }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  )
}
