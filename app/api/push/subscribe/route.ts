import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function POST(req: NextRequest) {
  const { subscription, baby_id, user_id } = await req.json()

  await supabase.from('push_subscriptions').upsert(
    {
      user_id,
      baby_id,
      subscription: JSON.stringify(subscription),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const { user_id } = await req.json()

  if (!user_id) {
    return NextResponse.json({ error: 'user_id required' }, { status: 400 })
  }

  await supabase.from('push_subscriptions').delete().eq('user_id', user_id)

  return NextResponse.json({ ok: true })
}
