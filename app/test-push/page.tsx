'use client'
import { useState, useEffect } from 'react'

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || 'BCUTKFGmJ8DHGazRtKVj2RsXDSe0heBdk3imiPBTYSirGf9u6KvtN4TzmhvN4FRZ-XQn4Gk5CBi8D92BbpTsyhs'

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export default function TestPush() {
  const [log, setLog] = useState<string[]>([])
  const [isPWA, setIsPWA] = useState(false)

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsPWA(standalone)
  }, [])

  const addLog = (msg: string) => {
    setLog(prev => [...prev, msg])
  }

  const testPush = async () => {
    setLog([])

    if (!isPWA) {
      addLog('❌ Tu dois ouvrir cette page depuis l\'icône Bébébou sur l\'écran d\'accueil')
      addLog('Pas depuis Safari directement')
      return
    }

    addLog('✅ Mode PWA détecté')
    addLog('Notification: ' + ('Notification' in window))
    addLog('PushManager: ' + ('PushManager' in window))

    if (!('Notification' in window) || !('PushManager' in window)) {
      addLog('❌ API Push non disponible sur cet appareil')
      return
    }

    addLog('Permission actuelle: ' + Notification.permission)

    if (Notification.permission !== 'granted') {
      const perm = await Notification.requestPermission()
      addLog('Permission après demande: ' + perm)
      if (perm !== 'granted') {
        addLog('❌ Permission refusée - active dans Réglages iOS → Notifications → Bébébou')
        return
      }
    }

    try {
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Ne pas désenregistrer le SW - juste vider l'abonnement push
      let reg = await navigator.serviceWorker.getRegistration()
      if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js')
        addLog('SW enregistré ✅')
      } else {
        addLog('SW déjà actif ✅')
      }
      await navigator.serviceWorker.ready
      addLog('✅ Service Worker prêt')

      const existing = await reg.pushManager.getSubscription()
      if (existing) {
        await existing.unsubscribe()
        addLog('Ancien abonnement supprimé ✅')
      }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY)
      })
      addLog('✅ Abonnement push créé')

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          baby_id: 'cf31ec10-ef6e-4b8f-96b4-1737823d4f44',
          user_id: 'd1562a1a-0a59-4095-8696-263b7f0a369c'
        })
      })
      const json = await res.json()
      addLog('API: ' + res.status + ' ' + JSON.stringify(json))
      addLog('🎉 SUCCÈS ! Abonnement enregistré en base')
      addLog('Tu vas recevoir les notifications biberon !')

    } catch(err: any) {
      addLog('❌ ERREUR: ' + err.message)
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'monospace', backgroundColor: '#FDF8F2', minHeight: '100vh' }}>
      <h2 style={{ color: '#E8406A' }}>Test Push</h2>

      {!isPWA && (
        <div style={{
          backgroundColor: '#FFF0F5',
          border: '2px solid #E8406A',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          fontSize: 14
        }}>
          ⚠️ <strong>Ouvre cette page depuis l&apos;icône Bébébou</strong> sur ton écran d&apos;accueil, pas depuis Safari
        </div>
      )}

      {isPWA && (
        <div style={{
          backgroundColor: '#F0FFF0',
          border: '2px solid #4CAF50',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          fontSize: 14
        }}>
          ✅ Mode PWA détecté - tu peux tester !
        </div>
      )}

      <button
        onClick={testPush}
        style={{
          padding: '14px 24px',
          backgroundColor: '#E8406A',
          color: 'white',
          border: 'none',
          borderRadius: 12,
          fontSize: 16,
          fontWeight: 700,
          marginBottom: 20,
          width: '100%'
        }}
      >
        Tester les notifications
      </button>

      <div style={{
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 12,
        border: '1px solid #F0E8F5'
      }}>
        {log.length === 0 && (
          <p style={{ color: '#8B7FA0', margin: 0 }}>
            Clique le bouton pour tester
          </p>
        )}
        {log.map((l, i) => (
          <div key={i} style={{
            padding: '4px 0',
            fontSize: 13,
            color: l.includes('❌') ? '#E8406A' : l.includes('✅') || l.includes('🎉') ? '#4CAF50' : '#4A3F5C',
            borderBottom: '1px solid #F0E8F5'
          }}>
            {l}
          </div>
        ))}
      </div>
    </div>
  )
}
