export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    webpush.setVapidDetails(
      'mailto:contact@monbebebou.fr',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
      process.env.VAPID_PRIVATE_KEY!
    )
    const now = new Date()
    const in15 = new Date(now.getTime() + 15 * 60 * 1000)
    const in16 = new Date(now.getTime() + 16 * 60 * 1000)
    const { data: events } = await supabase
      .from('events')
      .select('user_id, created_at')
      .eq('type', 'biberon')
      .gte('created_at', new Date(now.getTime() - 4 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
    if (!events || events.length === 0) return Response.json({ sent: 0 })
    const latest: Record<string, typeof events[0]> = {}
    for (const e of events) { if (!latest[e.user_id]) latest[e.user_id] = e }
    let sent = 0
    for (const [userId, event] of Object.entries(latest)) {
      const nextFeed = new Date(new Date(event.created_at).getTime() + 180 * 60 * 1000)
      if (nextFeed >= in15 && nextFeed <= in16) {
        const { data: subs } = await supabase.from('push_subscriptions').select('subscription').eq('user_id', userId)
        if (!subs) continue
        for (const sub of subs) {
          try {
            await webpush.sendNotification(sub.subscription, JSON.stringify({ title: '🍼 Biberon dans 15 min', body: 'Prochain biberon à ' + nextFeed.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) }))
            sent++
          } catch (err) { console.error('Push error:', err) }
        }
      }
    }
    return Response.json({ sent })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
