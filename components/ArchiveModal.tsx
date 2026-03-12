'use client'

interface ArchiveModalProps {
  open: boolean
  anchoredCount: number
  onConfirm: () => void
  onCancel: () => void
}

export default function ArchiveModal({ open, anchoredCount, onConfirm, onCancel }: ArchiveModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-2xl">
        <div className="text-4xl mb-4">📁</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Archive existing comments?</h2>
        <p className="text-gray-500 text-sm mb-6">
          You have <strong>{anchoredCount} inline comment{anchoredCount !== 1 ? 's' : ''}</strong> anchored
          to the current version. They&apos;ll be archived and still visible in your dashboard —
          just grouped under Version {'{current}'}.
        </p>
        <button
          onClick={onConfirm}
          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors mb-2"
        >
          Upload new version
        </button>
        <button
          onClick={onCancel}
          className="w-full border border-gray-200 text-gray-500 rounded-xl py-2.5 text-sm hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
