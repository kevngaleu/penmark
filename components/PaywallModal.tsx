'use client'

import { FOUNDING_PRICE, LAUNCH_PRICE } from '@/lib/constants'

interface PaywallModalProps {
  open: boolean
  onUnlock: () => void
  onClose: () => void
}

export default function PaywallModal({ open, onUnlock, onClose }: PaywallModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="text-4xl mb-4">📄</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">You&apos;ve used your 3 free revisions</h2>
        <p className="text-gray-500 text-sm mb-6">
          Most job seekers revise their resume 5–7 times before landing interviews.
          Unlock unlimited revisions while job hunting.
        </p>
        <button
          onClick={onUnlock}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl py-4 text-base transition-colors mb-2"
        >
          Unlock for ${FOUNDING_PRICE} →
        </button>
        <p className="text-xs text-gray-400 mb-4">
          Founding member price · rises to ${LAUNCH_PRICE} after first 100 users
        </p>
        <button
          onClick={onClose}
          className="w-full border border-gray-200 text-gray-500 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  )
}
