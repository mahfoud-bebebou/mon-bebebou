'use client'
import { useEffect } from 'react'

const VAPID_KEY =
  'VvbaxsFAW0BxLa61004fDHaU1fp2TYAXvOfp25URnkgbCf7jryzQyRWj7NFqwI4V-VMbbw4sv0_ceFwL08_3cA'

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
            applicationServerKey: VAPID_KEY,
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
