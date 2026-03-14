'use client'

import { useState } from 'react'
import { fmt } from '@/lib/utils'
import type { Comment } from '@/types'

interface FeedbackCardProps {
  comment: Comment
  num?: number | null
  onDelete?: (id: string) => void
  onEdit?: (id: string, body: string) => Promise<void>
  blurred?: boolean
}

export default function FeedbackCard({ comment, num, onDelete, onEdit, blurred }: FeedbackCardProps) {
  const [editing, setEditing] = useState(false)
  const [editBody, setEditBody] = useState(comment.body)
  const [editLoading, setEditLoading] = useState(false)

  if (blurred) {
    return (
      <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm relative overflow-hidden">
        <div className="flex items-center gap-2 mb-2">
          {num != null && (
            <span className="w-6 h-6 rounded-full bg-gray-300 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {num}
            </span>
          )}
          <span className="text-sm font-medium text-gray-400 italic">Reviewer</span>
          <span className="ml-auto text-xs bg-amber-50 text-amber-600 rounded-full px-2 py-0.5 font-medium">🔒 Locked</span>
        </div>

        <p className="text-sm text-gray-700 leading-relaxed blur-sm select-none pointer-events-none">
          {comment.body}
        </p>

        {/* Gradient overlay reinforces that content is hidden */}
        <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-white to-transparent pointer-events-none" />
      </div>
    )
  }

  return (
    <div className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {num != null && (
            <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {num}
            </span>
          )}
          <span className="text-sm font-medium text-gray-700">
            {comment.reviewer_name || 'Anonymous'}
          </span>
          {comment.is_general && (
            <span className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">General</span>
          )}
          {comment.archived_at_version != null && (
            <span className="text-xs bg-amber-50 text-amber-600 rounded-full px-2 py-0.5">
              v{comment.archived_at_version}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-gray-400">{fmt(comment.created_at)}</span>
          {onEdit && !editing && (
            <button
              onClick={() => { setEditBody(comment.body); setEditing(true) }}
              className="text-gray-300 hover:text-indigo-400 text-xs transition-colors"
              title="Edit comment"
            >
              ✎
            </button>
          )}
          {onDelete && !editing && (
            <button
              onClick={() => onDelete(comment.id)}
              className="text-gray-300 hover:text-red-400 text-xs transition-colors"
              title="Delete comment"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {comment.selected_text && (
        <div className="bg-yellow-50 border-l-4 border-yellow-300 px-3 py-1.5 rounded-r text-xs text-gray-500 italic mb-2 line-clamp-2">
          &ldquo;{comment.selected_text}&rdquo;
        </div>
      )}

      {!editing && (
        <p className="text-sm text-gray-700 leading-relaxed">{comment.body}</p>
      )}

      {editing && (
        <div className="mt-1 space-y-2">
          <textarea
            value={editBody}
            onChange={e => setEditBody(e.target.value)}
            rows={3}
            autoFocus
            className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
          />
          <div className="flex gap-2">
            <button
              disabled={editLoading || editBody.trim().length < 5}
              onClick={async () => {
                if (!onEdit) return
                setEditLoading(true)
                try { await onEdit(comment.id, editBody.trim()) } finally { setEditLoading(false); setEditing(false) }
              }}
              className="text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-3 py-1.5 disabled:opacity-50 transition-colors"
            >
              {editLoading ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
