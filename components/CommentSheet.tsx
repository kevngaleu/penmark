'use client'

import { useState, useEffect } from 'react'

interface CommentSheetProps {
  open: boolean
  selectedText: string | null
  isGeneral: boolean
  onSubmit: (body: string, reviewerName: string) => Promise<void>
  onClose: () => void
  initialBody?: string
}

export default function CommentSheet({ open, selectedText, isGeneral, onSubmit, onClose, initialBody }: CommentSheetProps) {
  const [body, setBody] = useState('')
  const [reviewerName, setReviewerName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // When opened with a prompt, seed the body; otherwise restore draft
  useEffect(() => {
    if (!open) return
    if (initialBody) {
      setBody(initialBody)
      return
    }
    const draft = localStorage.getItem('penmark-draft')
    if (draft) {
      try {
        const { body: savedBody, ts } = JSON.parse(draft)
        if (Date.now() - ts < 30 * 60 * 1000) setBody(savedBody)
      } catch { /* ignore */ }
    }
  }, [open, initialBody])

  // Autosave draft — skip when the body was seeded from a prompt chip so the
  // prompt text doesn't bleed into the next highlight-triggered sheet open.
  useEffect(() => {
    if (body && !initialBody) {
      localStorage.setItem('penmark-draft', JSON.stringify({ body, ts: Date.now() }))
    }
  }, [body, initialBody])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (body.trim().length < 20) {
      setError('Please write at least 20 characters — make it useful!')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onSubmit(body.trim(), reviewerName.trim())
      setBody('')
      setReviewerName('')
      localStorage.removeItem('penmark-draft')
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 p-6 max-w-lg mx-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

        <h3 className="font-semibold text-gray-900 mb-1">
          {isGeneral ? 'General feedback' : 'Leave a comment'}
        </h3>

        {selectedText && (
          <div className="bg-yellow-50 border-l-4 border-yellow-300 px-3 py-2 rounded-r text-sm text-gray-600 mb-4 italic line-clamp-2">
            &ldquo;{selectedText}&rdquo;
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Be specific and constructive — what would you change and why?"
            rows={4}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            autoFocus
          />

          <div className="text-xs text-gray-400 text-right">
            {body.length < 20
              ? `${20 - body.length} more characters needed`
              : `${body.length} characters ✓`}
          </div>

          <input
            type="text"
            value={reviewerName}
            onChange={e => setReviewerName(e.target.value)}
            placeholder="Your name (optional — leave blank to be anonymous)"
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading || body.trim().length < 20}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Submitting…' : 'Submit feedback'}
          </button>

          <p className="text-xs text-center text-gray-400">
            The job seeker will be notified by email
          </p>
        </form>
      </div>
    </>
  )
}
