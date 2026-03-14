'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import FeedbackCard from '@/components/FeedbackCard'
import PaywallModal from '@/components/PaywallModal'
import ArchiveModal from '@/components/ArchiveModal'
import { FREE_COMMENT_LIMIT } from '@/lib/constants'
import type { Resume, Comment } from '@/types'

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false })

export default function DashboardPage() {
  const router = useRouter()
  const [resume, setResume] = useState<Resume | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState('')

  // Modals
  const [showPaywall, setShowPaywall] = useState(false)
  const [showArchive, setShowArchive] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)

  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/')
        return
      }

      // Fetch resume
      const { data: resumeData } = await supabase
        .from('resumes')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (!resumeData) {
        // Check for pending upload from before magic link click
        // localStorage persists across tabs — magic link opens in a new tab
        const pending = localStorage.getItem('pendingUpload')
        const pendingFileData = localStorage.getItem('pendingFile')

        if (pending && pendingFileData) {
          // Convert base64 back to File and upload
          const { slug } = JSON.parse(pending)
          const res = await fetch(pendingFileData)
          const blob = await res.blob()
          const file = new File([blob], 'resume.pdf', { type: 'application/pdf' })
          const storagePath = `${user.id}/${slug}-v1.pdf`
          await supabase.storage.from('resumes').upload(storagePath, file, { upsert: true })
          const { data: newResume } = await supabase.from('resumes').insert({
            owner_id: user.id, slug, current_pdf_url: storagePath, current_version: 1,
          }).select().single()
          if (newResume) {
            await supabase.from('resume_versions').insert({
              resume_id: newResume.id, version_number: 1,
              pdf_url: storagePath, label: 'Version 1 — original',
            })
          }
          localStorage.removeItem('pendingUpload')
          localStorage.removeItem('pendingFile')
          window.location.reload()
          return
        }

        // No resume yet — redirect to upload
        router.push('/')
        return
      }

      setResume(resumeData)

      // Fetch comments
      const { data: commentsData } = await supabase
        .from('comments')
        .select('*')
        .eq('resume_id', resumeData.id)
        .order('created_at', { ascending: true })

      setComments(commentsData || [])

      // Get signed URL for current PDF
      const { data: signedData } = await supabase.storage
        .from('resumes')
        .createSignedUrl(resumeData.current_pdf_url, 3600)

      if (signedData?.signedUrl) setPdfUrl(signedData.signedUrl)

      setLoading(false)
    }

    load()
  }, [router])

  // Detect return from Stripe Checkout (?payment=success)
  // Using window.location directly (runs client-side only) to avoid useSearchParams Suspense requirement
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('payment') === 'success') {
      showToast('🔓 All feedback unlocked!')
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [showToast])

  function interceptReupload(file: File) {
    if (!resume) return
    // Uploads are always free — the paywall gates comment visibility, not versions
    const anchoredCount = comments.filter(c => !c.is_general && c.archived_at_version === null).length
    if (anchoredCount > 0) {
      setPendingFile(file)
      setShowArchive(true)
    } else {
      confirmReupload(file)
    }
  }

  async function confirmReupload(file?: File) {
    const f = file || pendingFile
    if (!f || !resume) return
    setShowArchive(false)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const newVersion = resume.current_version + 1
    const storagePath = `${user.id}/${resume.slug}-v${newVersion}.pdf`

    // Archive current inline comments
    const anchoredIds = comments
      .filter(c => !c.is_general && c.archived_at_version === null)
      .map(c => c.id)

    if (anchoredIds.length > 0) {
      await supabase
        .from('comments')
        .update({ archived_at_version: resume.current_version })
        .in('id', anchoredIds)
    }

    // Upload new PDF
    await supabase.storage.from('resumes').upload(storagePath, f, { upsert: true })

    // Insert new version record
    await supabase.from('resume_versions').insert({
      resume_id: resume.id,
      version_number: newVersion,
      pdf_url: storagePath,
      label: `Version ${newVersion}`,
    })

    // Update resume row
    await supabase
      .from('resumes')
      .update({ current_pdf_url: storagePath, current_version: newVersion })
      .eq('id', resume.id)

    showToast('✅ New version uploaded!')
    window.location.reload()
  }

  async function toggleLink() {
    if (!resume) return
    const supabase = createClient()
    await supabase
      .from('resumes')
      .update({ is_link_open: !resume.is_link_open })
      .eq('id', resume.id)
    setResume({ ...resume, is_link_open: !resume.is_link_open })
    showToast(resume.is_link_open ? 'Link closed — no new feedback' : 'Link open — reviewers can now comment')
  }

  async function deleteComment(id: string) {
    const supabase = createClient()
    await supabase.from('comments').delete().eq('id', id)
    setComments(prev => prev.filter(c => c.id !== id))
  }

  async function editComment(id: string, newBody: string) {
    const supabase = createClient()
    await supabase.from('comments').update({ body: newBody }).eq('id', id)
    setComments(prev => prev.map(c => c.id === id ? { ...c, body: newBody } : c))
  }

  function copyLink() {
    if (!resume) return
    navigator.clipboard.writeText(`${window.location.origin}/r/${resume.slug}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('Link copied!')
  }

  async function unlock() {
    if (!resume) return
    setCheckoutLoading(true)
    try {
      const res = await fetch('/api/checkout/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume_id: resume.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Checkout failed')
      window.location.href = data.url
    } catch (err) {
      console.error('Checkout error:', err)
      showToast('Something went wrong — please try again.')
      setCheckoutLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading your dashboard…
      </div>
    )
  }

  if (!resume) return null

  const reviewLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/r/${resume.slug}`
  const currentComments = comments.filter(c => c.archived_at_version === null && !c.is_general)
  const generalComments = comments.filter(c => c.is_general)
  const archivedByVersion: Record<number, Comment[]> = {}
  comments.filter(c => c.archived_at_version !== null).forEach(c => {
    const v = c.archived_at_version!
    if (!archivedByVersion[v]) archivedByVersion[v] = []
    archivedByVersion[v].push(c)
  })

  const uniqueReviewers = new Set(comments.map(c => c.reviewer_name || 'anonymous')).size
  const pagesWithFeedback = new Set(currentComments.map(c => c.page_number)).size

  // Comment visibility gate: first FREE_COMMENT_LIMIT comments are visible; rest are blurred unless paid
  const allVisible = comments.filter(c => c.archived_at_version === null)
  const isPaid = resume.is_paid
  const blurredCount = isPaid ? 0 : Math.max(0, allVisible.length - FREE_COMMENT_LIMIT)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <h1 className="font-bold text-gray-900">Penmark</h1>
          <button
            onClick={async () => {
              const supabase = createClient()
              await supabase.auth.signOut()
              router.push('/')
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Sign out
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* Share link card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900 text-sm">Your review link</h2>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              resume.is_link_open
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}>
              {resume.is_link_open ? 'Open' : 'Closed'}
            </span>
          </div>

          <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-600 font-mono mb-3 truncate">
            {reviewLink}
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl py-2.5 transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy link'}
            </button>
            <button
              onClick={() => {
                if (navigator.share) {
                  navigator.share({ title: 'Review my resume', url: reviewLink })
                } else {
                  copyLink()
                }
              }}
              className="flex-1 border border-gray-200 text-gray-700 text-sm rounded-xl py-2.5 hover:bg-gray-50 transition-colors"
            >
              Share
            </button>
            <button
              onClick={toggleLink}
              className="border border-gray-200 text-gray-700 text-xs rounded-xl px-3 py-2.5 hover:bg-gray-50 transition-colors"
            >
              {resume.is_link_open ? 'Close' : 'Open'}
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total comments', value: allVisible.length },
            { label: 'Reviewers', value: uniqueReviewers },
            { label: 'Pages with feedback', value: pagesWithFeedback },
          ].map(stat => (
            <div key={stat.label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-xs text-gray-400 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Feedback visibility summary — shown when there are locked comments */}
        {blurredCount > 0 && (
          <div className="bg-white rounded-xl border border-amber-100 shadow-sm px-4 py-3 flex items-center justify-between text-sm">
            <div className="flex items-center gap-3 text-gray-500 flex-wrap gap-y-1">
              <span>Feedback received: <strong className="text-gray-900">{allVisible.length}</strong></span>
              <span className="text-gray-300">·</span>
              <span>Visible: <strong className="text-gray-900">{FREE_COMMENT_LIMIT}</strong></span>
              <span className="text-gray-300">·</span>
              <span>Locked: <strong className="text-amber-600">{blurredCount}</strong></span>
            </div>
            <button
              onClick={() => setShowPaywall(true)}
              className="text-xs text-indigo-600 font-semibold hover:underline whitespace-nowrap ml-3"
            >
              Unlock →
            </button>
          </div>
        )}

        {/* PDF preview */}
        {pdfUrl && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">
                Version {resume.current_version}
              </span>
              <label className="text-xs text-indigo-600 font-semibold cursor-pointer hover:text-indigo-700">
                Upload new version
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) interceptReupload(f)
                    e.target.value = ''
                  }}
                />
              </label>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <PdfViewer
                pdfUrl={pdfUrl}
                onSelection={() => {}}
                isOwner
                highlightedTexts={currentComments
                  .filter(c => c.selected_text)
                  .map(c => c.selected_text!)}
                markers={currentComments.map((c, i) => ({
                  id: c.id,
                  page: c.page_number,
                  topPct: c.top_pct,
                  leftPct: c.left_pct,
                  num: i + 1,
                }))}
              />
            </div>
          </div>
        )}

        {/* Feedback list */}
        <div className="space-y-3">
          {comments.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
              <div className="text-3xl mb-3">👀</div>
              <p className="text-gray-500 text-sm">No feedback yet. Share your link to get started.</p>
            </div>
          ) : (
            <>
              {currentComments.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">
                    Current feedback — {currentComments.length}
                  </h3>
                  {currentComments.map((c, i) => {
                    const visibleIndex = allVisible.indexOf(c)
                    const isBlurred = !isPaid && visibleIndex >= FREE_COMMENT_LIMIT
                    if (isBlurred) return null
                    return (
                      <FeedbackCard key={c.id} comment={c} num={i + 1} onDelete={deleteComment} onEdit={editComment} />
                    )
                  })}
                  {/* Single lock card — replaces all individual blurred cards */}
                  {blurredCount > 0 && (
                    <div className="bg-white border-2 border-dashed border-amber-200 rounded-2xl overflow-hidden">
                      <div className="bg-gradient-to-b from-amber-50/60 to-white px-5 py-6 text-center">
                        <div className="text-2xl mb-2">🔒</div>
                        <p className="text-sm font-semibold text-gray-900 mb-1">
                          {blurredCount} more comment{blurredCount !== 1 ? 's' : ''} from your reviewers
                        </p>
                        <p className="text-xs text-gray-500 mb-4">
                          Your reviewers took time to help. Unlock to read everything.
                        </p>
                        <button
                          onClick={() => setShowPaywall(true)}
                          className="bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-xl px-6 py-3 transition-colors w-full"
                        >
                          Unlock all feedback — $9
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {Object.keys(archivedByVersion).sort((a, b) => Number(b) - Number(a)).map(ver => (
                <div key={ver}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mt-4 mb-2">
                    Version {ver} feedback — archived
                  </h3>
                  {archivedByVersion[Number(ver)].map(c => (
                    <FeedbackCard key={c.id} comment={c} onDelete={deleteComment} />
                  ))}
                </div>
              ))}

              {generalComments.length > 0 && (
                <>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1 mt-4 mb-2">
                    General feedback — {generalComments.length}
                  </h3>
                  {generalComments.map(c => {
                    const visibleIndex = allVisible.indexOf(c)
                    const isBlurred = !isPaid && visibleIndex >= FREE_COMMENT_LIMIT
                    if (isBlurred) return null
                    return (
                      <FeedbackCard key={c.id} comment={c} onDelete={deleteComment} onEdit={editComment} />
                    )
                  })}
                </>
              )}
            </>
          )}
        </div>


        {/* "I got the job" banner */}
        {!resume.hired_at && comments.length >= 3 && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
            <div className="text-2xl mb-2">🎉</div>
            <p className="text-sm font-medium text-green-800 mb-3">Got the job? Let us know!</p>
            <button
              onClick={async () => {
                const supabase = createClient()
                await supabase
                  .from('resumes')
                  .update({ hired_at: new Date().toISOString() })
                  .eq('id', resume.id)
                setResume({ ...resume, hired_at: new Date().toISOString() })
                showToast('🏆 Congratulations! Your outcome has been saved.')
              }}
              className="bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-xl px-6 py-2.5 transition-colors"
            >
              I got the job! 🏆
            </button>
          </div>
        )}

        {resume.hired_at && (
          <div className="bg-green-600 rounded-2xl p-5 text-center text-white">
            <div className="text-3xl mb-2">🏆</div>
            <p className="font-bold text-lg">You got the job!</p>
            <p className="text-green-100 text-sm mt-1">Congratulations — this resume did its job.</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <PaywallModal
        open={showPaywall}
        onUnlock={unlock}
        onClose={() => setShowPaywall(false)}
        loading={checkoutLoading}
      />
      <ArchiveModal
        open={showArchive}
        anchoredCount={comments.filter(c => !c.is_general && c.archived_at_version === null).length}
        onConfirm={() => confirmReupload()}
        onCancel={() => setShowArchive(false)}
      />

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-sm px-5 py-3 rounded-full shadow-lg z-50 whitespace-nowrap">
          {toast}
        </div>
      )}
    </div>
  )
}
