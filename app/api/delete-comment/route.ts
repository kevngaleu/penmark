import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  const { commentId, reviewerUuid } = await req.json()
  if (!commentId || !reviewerUuid) {
    return NextResponse.json({ error: 'missing params' }, { status: 400 })
  }

  // Service-role client: bypasses RLS, but we enforce ownership via reviewer_uuid
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  const { error } = await supabase
    .from('comments')
    .delete()
    .eq('id', commentId)
    .eq('reviewer_uuid', reviewerUuid) // only deletes if UUID matches — security gate

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
