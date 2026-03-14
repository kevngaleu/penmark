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

  // Growth feature state
  const [totalComments, setTotalComments] = useState(0)
  const [totalReviewers, setTotalReviewers] = useState(0)
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

      // Fetch public comment + reviewer counts for social proof
      const countRes = await fetch(`/api/comment-count?slug=${slug}`)
      if (countRes.ok) {
        const { comments, reviewers } = await countRes.json()
        setTotalComments(comments)
        setTotalReviewers(reviewers)
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

    // Momentum message — nudge to add another comment
    setMomentumMsg(`✅ Comment added · This resume now has ${newTotal} comment${newTotal !== 1 ? 's' : ''}. Add another?`)
    setTimeout(() => setMomentumMsg(''), 6000)

    // Reviewer nudge after first comment
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
      {/* Topbar */}
      <div className="sticky top-0 bg-white border-b border-gray-100 z-30 px-4 py-3 flex items-center justify-between">
        <div>
          <span className="font-semibold text-gray-900 text-sm">{resume?.slug}</span>
          <span className="text-gray-400 text-xs ml-2">· Highlight text to comment</span>
        </div>
        <div className="flex items-center gap-3">
          {commentCount > 0 && (
            <span className="text-xs text-indigo-600 font-medium">
              {commentCount} from you
            </span>
          )}
          <button
            onClick={openGeneral}
            className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1.5 rounded-full hover:bg-indigo-700 transition-colors"
          >
            + General feedback
          </button>
          <button
            onClick={() => setShowOverlay(true)}
            className="border border-gray-200 text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-full hover:border-green-500 hover:text-green-600 transition-colors"
          >
            ✓ Done
          </button>
        </div>
      </div>

      {/* Social proof + review time bar */}
      <div className="bg-indigo-50 border-b border-indigo-100 px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-indigo-700">
          {totalComments > 0 && (
            <span>👥 {totalReviewers} reviewer{totalReviewers !== 1 ? 's' : ''} · 💬 {totalComments} comment{totalComments !== 1 ? 's' : ''}</span>
          )}
          {totalComments === 0 && (
            <span>📝 Highlight any text on the resume to leave an inline comment</span>
          )}
        </div>
        <span className="text-indigo-500 font-medium">⏱ ~2 min review</span>
      </div>

      {/* Momentum message */}
      {momentumMsg && (
        <div className="bg-green-50 border-b border-green-100 px-4 py-2 text-center text-xs text-green-700 font-medium">
          {momentumMsg}
        </div>
      )}

      {/* Guided feedback prompts */}
      <div className="max-w-3xl mx-auto px-4 pt-4">
        <p className="text-xs text-gray-500 font-medium mb-2">Help improve this resume — tap a prompt or highlight text:</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {PROMPTS.map(p => (
            <button
              key={p.label}
              onClick={() => openPrompt(p.label)}
              className="flex items-center gap-1.5 text-xs bg-white border border-gray-200 text-gray-700 rounded-full px-3 py-1.5 hover:border-indigo-400 hover:text-indigo-700 transition-colors shadow-sm"
            >
              <span>{p.emoji}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* PDF */}
      <div className="max-w-3xl mx-auto px-4 pb-6">
        {pdfUrl ? (
          <PdfViewer
            pdfUrl={pdfUrl}
            onSelection={handleSelection}
            markers={[]}
          />
        ) : (
          <div className="text-center py-20 text-gray-400 text-sm">Unable to load PDF.</div>
        )}
      </div>

      {/* Reviewer nudge — shown after first comment */}
      <div
        id="reviewer-nudge"
        className="hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-4 py-3 z-30 items-center justify-between max-w-lg mx-auto"
      >
        <span className="text-sm text-gray-600">Want feedback on your own resume?</span>
        <a
          href="/"
          className="text-sm text-indigo-600 font-semibold hover:underline whitespace-nowrap ml-3"
        >
          Create your free resume link in 30 seconds →
        </a>
      </div>

      {/* Comment sheet */}
      <CommentSheet
        open={sheetOpen}
        selectedText={selectedText}
        isGeneral={isGeneral}
        onSubmit={handleSubmitComment}
        onClose={() => { setSheetOpen(false); setSelectedText(null); setPromptBody(undefined) }}
        initialBody={promptBody}
      />

      {/* Post-review overlay */}
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
