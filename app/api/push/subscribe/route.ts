export const dynamic = 'force-dynamic'

import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    const { subscription, userId } = await req.json()
    if (!subscription || !userId) {
      return Response.json({ error: 'Missing data' }, { status: 400 })
    }
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert({ user_id: userId, subscription, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  try {
    const { userId } = await req.json()
    if (!userId) return Response.json({ error: 'Missing userId' }, { status: 400 })
    await supabase.from('push_subscriptions').delete().eq('user_id', userId)
    return Response.json({ ok: true })
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}
