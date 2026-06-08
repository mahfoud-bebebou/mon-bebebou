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

function formatPrenom(prenom?: string | null): string {
  if (!prenom) return 'Bébé'
  return prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase()
}

function formatSiesteDuration(minutesSieste: number): string {
  const heures = Math.floor(minutesSieste / 60)
  const minutes = Math.floor(minutesSieste % 60)
  return heures > 0
    ? `${heures}h${String(minutes).padStart(2, '0')}`
    : `${Math.floor(minutesSieste)} min`
}

export async function GET() {
  if (!initWebPush()) {
    return NextResponse.json({ sent: 0 })
  }

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

    const { data: userSettings } = await supabase
      .from('user_settings')
      .select(
        'notif_delay_minutes, notif_enabled, biberon_intervalle_auto, biberon_intervalle_minutes, sieste_alerte_enabled, sieste_alerte_minutes, sieste_notif_enabled, nuit_notif_enabled'
      )
      .eq('user_id', sub.user_id)
      .maybeSingle()

    const subscription = JSON.parse(sub.subscription)
    const prenom = formatPrenom(baby.prenom)

    const sendPush = async (title: string, body: string) => {
      try {
        await webpush.sendNotification(
          subscription,
          JSON.stringify({ title, body })
        )
        sent++
      } catch (err) {
        console.error('Push error:', err)
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', sub.user_id)
      }
    }

    // ——— Biberon ———
    if (userSettings?.notif_enabled !== false) {
      const { data: dernierBiberon } = await supabase
        .from('events')
        .select('*')
        .eq('baby_id', baby.id)
        .eq('type', 'biberon')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (dernierBiberon) {
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
          await sendPush(
            '🍼 Mon Bébébou',
            `Biberon de ${prenom} dans ${delai} minutes — prépare-toi !`
          )
        }
      }
    }

    // ——— Sieste ———
    if (userSettings?.sieste_notif_enabled) {
      const { data: siesteActive } = await supabase
        .from('events')
        .select('*')
        .eq('baby_id', baby.id)
        .eq('type', 'sieste_active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (siesteActive) {
        const minutesSieste =
          (Date.now() - new Date(siesteActive.created_at).getTime()) / 60000
        const remainder = minutesSieste % 15

        if (remainder >= 14 && remainder <= 16) {
          await sendPush(
            '😴 Sieste en cours',
            `${prenom} dort depuis ${formatSiesteDuration(minutesSieste)}`
          )
        }

        if (userSettings.sieste_alerte_enabled) {
          const seuilMin = userSettings.sieste_alerte_minutes ?? 120
          if (Math.floor(minutesSieste) === seuilMin) {
            await sendPush(
              '⏰ Sieste longue',
              `${prenom} dort depuis ${Math.floor(minutesSieste / 60)}h — c'est long pour une sieste !`
            )
          }
        }
      }
    }

    // ——— Nuit ———
    if (userSettings?.nuit_notif_enabled) {
      const { data: modeNuitData } = await supabase
        .from('babies')
        .select('mode_nuit')
        .eq('id', baby.id)
        .single()

      if (modeNuitData?.mode_nuit?.actif) {
        const heureDebut = new Date(modeNuitData.mode_nuit.heure_debut)
        const minutesNuit = (Date.now() - heureDebut.getTime()) / 60000
        const remainder = minutesNuit % 60

        if (remainder >= 59 && remainder <= 61) {
          const heures = Math.floor(minutesNuit / 60)
          await sendPush(
            '🌙 Nuit en cours',
            `${prenom} dort depuis ${heures}h — bonne nuit ! 😴`
          )
        }
      }
    }
  }

  return NextResponse.json({ sent })
}
