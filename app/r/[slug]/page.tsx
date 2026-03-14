'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { createClient } from '@/lib/supabase/client'
import CommentSheet from '@/components/CommentSheet'
import type { Resume } from '@/types'

const PdfViewer = dynamic(() => import('@/components/PdfViewer'), { ssr: false })

const PROMPTS = [
  { label: 'What part is confusing?', emoji: '🤔' },
  { label: 'What part is strongest?', emoji: '💪' },
  { label: 'What would you remove?',  emoji: '✂️' },
]

export default function ReviewPage() {
  const { slug } = useParams<{ slug: string }>()
  const [resume, setResume] = useState<Resume | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [linkClosed, setLinkClosed] = useState(false)

  // Comment sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [selectedText, setSelectedText] = useState<string | null>(null)
  const [isGeneral, setIsGeneral] = useState(false)
  const [selPage, setSelPage] = useState(1)
  const [selTop, setSelTop] = useState(0)
  const [selLeft, setSelLeft] = useState(0)
  const [promptBody, setPromptBody] = useState<string | undefined>(undefined)

  // Reviewer state
  const [commentCount, setCommentCount] = useState(0)
  const [showOverlay, setShowOverlay] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  // Growth feature state
  const [totalComments, setTotalComments] = useState(0)
  const [momentumMsg, setMomentumMsg] = useState('')

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const { data: resumeData, error } = await supabase
        .from('resumes')
        .select('*')
        .eq('slug', slug)
        .single()

      if (error || !resumeData) {
        setNotFound(true)
        setLoading(false)
        return
      }

      setResume(resumeData)

      if (!resumeData.is_link_open) {
        setLinkClosed(true)
        setLoading(false)
        return
      }

      const urlRes = await fetch(`/api/pdf-url?slug=${slug}`)
      if (urlRes.ok) {
        const { url } = await urlRes.json()
        setPdfUrl(url)
      }

      const countRes = await fetch(`/api/comment-count?slug=${slug}`)
      if (countRes.ok) {
        const { comments } = await countRes.json()
        setTotalComments(comments)
      }

      await supabase
        .from('resumes')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', resumeData.id)

      setLoading(false)
    }

    load()
  }, [slug])

  const handleSelection = useCallback(({ text, page, topPct, leftPct }: {
    text: string; page: number; topPct: number; leftPct: number
  }) => {
    setSelectedText(text)
    setIsGeneral(false)
    setSelPage(page)
    setSelTop(topPct)
    setSelLeft(leftPct)
    setPromptBody(undefined)
    setSheetOpen(true)
  }, [])

  function openPrompt(label: string) {
    setIsGeneral(true)
    setSelectedText(null)
    setPromptBody(label + ': ')
    setSheetOpen(true)
  }

  function openGeneral() {
    setIsGeneral(true)
    setSelectedText(null)
    setPromptBody(undefined)
    setSheetOpen(true)
  }

  async function handleSubmitComment(body: string, reviewerName: string) {
    if (!resume) return
    const supabase = createClient()

    const { error } = await supabase.from('comments').insert({
      resume_id: resume.id,
      reviewer_name: reviewerName || null,
      selected_text: isGeneral ? null : selectedText,
      body,
      page_number: isGeneral ? 1 : selPage,
      top_pct: isGeneral ? 0 : selTop,
      left_pct: isGeneral ? 0 : selLeft,
      is_general: isGeneral,
    })

    if (error) throw new Error(error.message)

    const newCount = commentCount + 1
    const newTotal = totalComments + 1
    setCommentCount(newCount)
    setTotalComments(newTotal)

    setMomentumMsg(`✅ Added · ${newTotal} comment${newTotal !== 1 ? 's' : ''} total. Add another?`)
    setTimeout(() => setMomentumMsg(''), 5000)

    if (newCount === 1) {
      setTimeout(() => {
        const nudge = document.getElementById('reviewer-nudge')
        if (nudge) nudge.style.display = 'flex'
      }, 500)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading resume…
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="text-4xl mb-4">🔍</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">Resume not found</h1>
        <p className="text-gray-500 text-sm">This link doesn&apos;t exist or has been removed.</p>
      </div>
    )
  }

  if (linkClosed) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-4">
        <div className="text-4xl mb-4">🔒</div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">This link is closed</h1>
        <p className="text-gray-500 text-sm">The job seeker has temporarily closed this link to new feedback.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Slim topbar ───────────────────────────────────────────── */}
      <div className="sticky top-0 bg-white border-b border-gray-100 z-30 h-11 px-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-medium text-gray-900 text-sm truncate">{resume?.slug}</span>
          {commentCount > 0 && (
            <span className="text-xs text-indigo-600 shrink-0">
              · {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
            </span>
          )}
        </div>
        <button
          onClick={() => setShowOverlay(true)}
          className="shrink-0 text-xs font-semibold text-gray-600 border border-gray-200 rounded-full px-3 py-1 hover:border-green-500 hover:text-green-600 transition-colors"
        >
          ✓ Done
        </button>
      </div>

      {/* ── Prompt chips — single scrollable row ──────────────────── */}
      <div className="bg-white border-b border-gray-100 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        <div className="flex items-center gap-2 px-4 py-2 w-max">
          <span className="text-xs text-gray-400 shrink-0">Ask:</span>
          {PROMPTS.map(p => (
            <button
              key={p.label}
              onClick={() => openPrompt(p.label)}
              className="shrink-0 flex items-center gap-1 text-xs bg-gray-50 border border-gray-200 text-gray-600 rounded-full px-3 py-1 hover:border-indigo-400 hover:text-indigo-600 transition-colors whitespace-nowrap"
            >
              <span>{p.emoji}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Momentum toast ────────────────────────────────────────── */}
      {momentumMsg && (
        <div className="fixed top-[88px] left-0 right-0 z-40 flex justify-center px-4 pointer-events-none">
          <div className="bg-gray-900 text-white text-xs font-medium rounded-full px-4 py-2 shadow-lg">
            {momentumMsg}
          </div>
        </div>
      )}

      {/* ── PDF — fills the screen ────────────────────────────────── */}
      <div className="relative max-w-3xl mx-auto pb-24">
        {/* Expand button */}
        {pdfUrl && (
          <button
            onClick={() => setFullscreen(true)}
            className="absolute top-3 right-5 z-20 bg-white/90 backdrop-blur-sm border border-gray-200 rounded-lg p-1.5 text-gray-500 hover:text-indigo-600 shadow-sm transition-colors"
            title="Open fullscreen"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </button>
        )}
        {pdfUrl ? (
          <PdfViewer pdfUrl={pdfUrl} onSelection={handleSelection} markers={[]} />
        ) : (
          <div className="text-center py-20 text-gray-400 text-sm">Unable to load PDF.</div>
        )}
      </div>

      {/* ── Fullscreen PDF modal ──────────────────────────────────── */}
      {fullscreen && pdfUrl && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col">
          <div className="flex items-center justify-between px-4 h-11 border-b border-gray-100 flex-shrink-0">
            <span className="text-sm font-medium text-gray-700 truncate">{resume?.slug}</span>
            <button
              onClick={() => setFullscreen(false)}
              className="shrink-0 text-xs text-gray-500 border border-gray-200 rounded-full px-3 py-1.5 hover:border-gray-400 transition-colors"
            >
              ✕ Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <PdfViewer
              pdfUrl={pdfUrl}
              onSelection={(info) => { setFullscreen(false); handleSelection(info) }}
              markers={[]}
            />
          </div>
        </div>
      )}

      {/* ── FAB — General comment ─────────────────────────────────── */}
      <button
        onClick={openGeneral}
        className="fixed bottom-6 right-4 z-30 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-sm font-semibold rounded-full shadow-lg px-4 py-3 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
        </svg>
        General
      </button>

      {/* ── Reviewer nudge — shown after first comment ────────────── */}
      <div
        id="reviewer-nudge"
        className="hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-30 items-center justify-between"
      >
        <span className="text-sm text-gray-600">Want feedback on your own resume?</span>
        <a
          href="/"
          className="text-sm text-indigo-600 font-semibold hover:underline whitespace-nowrap ml-3"
        >
          Get your free link →
        </a>
      </div>

      {/* ── Comment sheet ─────────────────────────────────────────── */}
      <CommentSheet
        open={sheetOpen}
        selectedText={selectedText}
        isGeneral={isGeneral}
        onSubmit={handleSubmitComment}
        onClose={() => { setSheetOpen(false); setSelectedText(null); setPromptBody(undefined) }}
        initialBody={promptBody}
      />

      {/* ── Post-review overlay ───────────────────────────────────── */}
      {showOverlay && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center px-6 text-center">
          <div className="text-4xl mb-4">🙌</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">You just helped someone.</h2>
          <p className="text-gray-500 text-sm mb-8 max-w-sm">
            Getting specific feedback like yours is exactly what job seekers need. Want the same for your resume?
          </p>
          <a
            href="/"
            className="w-full max-w-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-4 text-sm transition-colors mb-4 block"
          >
            Create my free resume link →
          </a>
          <div className="flex items-center gap-3 w-full max-w-sm mb-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">or pay it forward</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <button
            onClick={() => setShowOverlay(false)}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            Keep reviewing this resume
          </button>
        </div>
      )}
    </div>
  )
}
