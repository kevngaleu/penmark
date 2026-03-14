'use client'

import { useState, useEffect, useRef } from 'react'
import { fmt } from '@/lib/utils'
import type { Comment } from '@/types'

interface Props {
  comment: Comment
  /** Viewport rect of the highlighted span that was clicked */
  anchorRect: DOMRect
  onClose: () => void
  onEdit: (id: string, body: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export default function ReviewerCommentPopover({ comment, anchorRect, onClose, onEdit, onDelete }: Props) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [loading, setLoading] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  // Clamp position so popover always stays inside the viewport
  const POPOVER_W = 264
  const POPOVER_H = 160 // approximate; will grow for long comments
  const margin = 8

  const rawLeft = anchorRect.left
  const rawTop  = anchorRect.bottom + 6

  const left = Math.max(margin, Math.min(rawLeft, window.innerWidth  - POPOVER_W - margin))
  const top  = rawTop + POPOVER_H > window.innerHeight
    ? anchorRect.top - POPOVER_H - 6  // flip above if not enough room below
    : rawTop

  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const initials = (comment.reviewer_name || 'A')[0].toUpperCase()

  return (
    <>
      {/* Backdrop — transparent, catches outside clicks */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover card */}
      <div
        ref={popoverRef}
        className="fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden"
        style={{ width: POPOVER_W, left, top }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 pt-3 pb-2 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-gray-800 truncate leading-none">
                {comment.reviewer_name || 'You'}
              </p>
              <p className="text-[10px] text-gray-400 mt-0.5">{fmt(comment.created_at)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-300 hover:text-gray-500 text-xs leading-none p-1 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Selected text snippet */}
        {comment.selected_text && (
          <div className="mx-3.5 mt-2 bg-green-50 border-l-4 border-green-300 px-2.5 py-1 rounded-r text-[11px] text-gray-500 italic line-clamp-2">
            &ldquo;{comment.selected_text}&rdquo;
          </div>
        )}

        {/* Body / Edit form */}
        <div className="px-3.5 py-2.5">
          {!editing ? (
            <p className="text-sm text-gray-700 leading-relaxed">{comment.body}</p>
          ) : (
            <textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              rows={3}
              autoFocus
              className="w-full border border-indigo-200 rounded-lg px-2.5 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 px-3.5 pb-3">
          {!editing ? (
            <>
              <button
                onClick={() => { setEditBody(comment.body); setEditing(true) }}
                className="text-xs text-gray-500 hover:text-indigo-600 border border-gray-200 rounded-full px-3 py-1.5 transition-colors font-medium"
              >
                Edit
              </button>
              <button
                onClick={async () => {
                  setLoading(true)
                  try { await onDelete(comment.id) } finally { setLoading(false) }
                  onClose()
                }}
                disabled={loading}
                className="text-xs text-red-500 hover:text-red-700 border border-red-100 hover:border-red-200 rounded-full px-3 py-1.5 transition-colors font-medium disabled:opacity-40"
              >
                {loading ? '…' : 'Delete'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(false)}
                className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!editBody.trim()) return
                  setLoading(true)
                  try { await onEdit(comment.id, editBody.trim()); setEditing(false) }
                  finally { setLoading(false) }
                }}
                disabled={loading || !editBody.trim()}
                className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-full px-3 py-1.5 transition-colors font-medium disabled:opacity-40"
              >
                {loading ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
