'use client'

import { fmt } from '@/lib/utils'
import type { Comment } from '@/types'

interface FeedbackCardProps {
  comment: Comment
  num?: number | null
  onDelete?: (id: string) => void
  blurred?: boolean
}

function previewText(text: string, words = 8): string {
  const parts = text.trim().split(/\s+/)
  if (parts.length <= words) return text
  return parts.slice(0, words).join(' ') + '…'
}

export default function FeedbackCard({ comment, num, onDelete, blurred }: FeedbackCardProps) {
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

        <p className="text-sm text-gray-500 leading-relaxed">
          &ldquo;{previewText(comment.body)}&rdquo;
        </p>

        {/* Fade-out overlay at the bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
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
          {onDelete && (
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

      <p className="text-sm text-gray-700 leading-relaxed">{comment.body}</p>
    </div>
  )
}
