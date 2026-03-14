import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: resume } = await supabase
    .from('resumes')
    .select('id')
    .eq('slug', slug)
    .single()

  if (!resume) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { count: commentCount } = await supabase
    .from('comments')
    .select('*', { count: 'exact', head: true })
    .eq('resume_id', resume.id)
    .is('archived_at_version', null)

  const { count: reviewerCount } = await supabase
    .from('comments')
    .select('reviewer_name', { count: 'exact', head: true })
    .eq('resume_id', resume.id)
    .is('archived_at_version', null)
    .not('reviewer_name', 'is', null)

  return NextResponse.json({
    comments: commentCount ?? 0,
    reviewers: reviewerCount ?? 0,
  })
}
