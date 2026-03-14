'use client'

import { UNLOCK_PRICE } from '@/lib/constants'

interface PaywallModalProps {
  open: boolean
  onUnlock: () => void
  onClose: () => void
  loading?: boolean
}

export default function PaywallModal({ open, onUnlock, onClose, loading = false }: PaywallModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="text-4xl mb-4">🔓</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Unlock all your feedback</h2>
        <p className="text-gray-500 text-sm mb-6">
          Your reviewers took time to help you — see everything they said about your resume.
        </p>
        <button
          onClick={onUnlock}
          disabled={loading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl py-4 text-base transition-colors mb-2 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Redirecting to checkout…
            </>
          ) : (
            `Unlock for $${UNLOCK_PRICE} →`
          )}
        </button>
        <p className="text-xs text-gray-400 mb-4">
          One-time payment · all comments visible forever
        </p>
        <button
          onClick={onClose}
          disabled={loading}
          className="w-full border border-gray-200 text-gray-500 rounded-xl py-2.5 text-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
