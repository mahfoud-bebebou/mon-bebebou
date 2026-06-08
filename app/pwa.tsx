'use client'
import { useEffect } from 'react'

export default function PWAInstaller() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(async (reg) => {
        console.log('SW registered')

        if (!('PushManager' in window)) return

        const permission = await Notification.requestPermission()
        if (permission !== 'granted') return

        // S'abonne aux notifications push
        const existing = await reg.pushManager.getSubscription()
        const subscription =
          existing ||
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
          }))

        // Récupère user et baby depuis Supabase
        const { createClient } = await import('@supabase/supabase-js')
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        )

        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) return

        const { data: profile } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .single()

        if (!profile?.family_id) return

        const { data: baby } = await supabase
          .from('babies')
          .select('id')
          .eq('family_id', profile.family_id)
          .single()

        if (!baby) return

        // Enregistre l'abonnement
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription: subscription.toJSON(),
            baby_id: baby.id,
            user_id: user.id,
          }),
        })
      })
    }
  }, [])
  return null
}
