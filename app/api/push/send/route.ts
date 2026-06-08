import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { getEffectiveBiberonIntervalMinutes } from '@/lib/user-settings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

function initWebPush(): boolean {
  const subject = process.env.VAPID_SUBJECT
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!subject || !publicKey || !privateKey) return false
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return true
}

export async function GET() {
  if (!initWebPush()) {
    return NextResponse.json({ sent: 0 })
  }

  // Récupère tous les abonnements
  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('*, babies(*)')

  if (!subscriptions?.length) {
    return NextResponse.json({ sent: 0 })
  }

  let sent = 0

  for (const sub of subscriptions) {
    const baby = sub.babies
    if (!baby) continue

    // Récupère le dernier biberon
    const { data: dernierBiberon } = await supabase
      .from('events')
      .select('*')
      .eq('baby_id', baby.id)
      .eq('type', 'biberon')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!dernierBiberon) continue

    const { data: userSettings } = await supabase
      .from('user_settings')
      .select(
        'notif_delay_minutes, notif_enabled, biberon_intervalle_auto, biberon_intervalle_minutes'
      )
      .eq('user_id', sub.user_id)
      .maybeSingle()

    if (userSettings?.notif_enabled === false) continue

    const delai = userSettings?.notif_delay_minutes ?? 15

    const ageJours = Math.floor(
      (Date.now() - new Date(baby.date_naissance).getTime()) / 86400000
    )

    const intervalleMin = getEffectiveBiberonIntervalMinutes(
      userSettings ?? {},
      ageJours,
      baby.parcours ?? 'artificiel'
    )

    const minutesEcoulees =
      (Date.now() - new Date(dernierBiberon.created_at).getTime()) / 60000
    const restant = intervalleMin - minutesEcoulees

    if (restant >= delai - 1 && restant <= delai + 1) {
      const subscription = JSON.parse(sub.subscription)
      const prenom =
        baby.prenom?.charAt(0).toUpperCase() +
        baby.prenom?.slice(1).toLowerCase()

      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({
            title: '🍼 Mon Bébébou',
            body: `Biberon de ${prenom} dans ${delai} minutes — prépare-toi !`,
          })
        )
        sent++
      } catch (err) {
        console.error('Push error:', err)
        // Supprime les abonnements invalides
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', sub.user_id)
      }
    }
  }

  return NextResponse.json({ sent })
}
