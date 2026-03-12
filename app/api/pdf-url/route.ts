import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const slug = searchParams.get('slug')

  if (!slug) return NextResponse.json({ error: 'Missing slug' }, { status: 400 })

  // Service role bypasses RLS — safe because we validate the slug exists first
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: resume } = await supabase
    .from('resumes')
    .select('current_pdf_url, is_link_open')
    .eq('slug', slug)
    .single()

  if (!resume) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!resume.is_link_open) return NextResponse.json({ error: 'Link closed' }, { status: 403 })

  const { data: signedData } = await supabase.storage
    .from('resumes')
    .createSignedUrl(resume.current_pdf_url, 3600)

  if (!signedData?.signedUrl) {
    return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 })
  }

  return NextResponse.json({ url: signedData.signedUrl })
}
