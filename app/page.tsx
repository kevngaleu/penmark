'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { generateSlug, getCommunityCount } from '@/lib/utils'

type Step = 'upload' | 'email' | 'sent'

export default function UploadPage() {
  const [step, setStep] = useState<Step>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const communityCount = getCommunityCount()

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped?.type === 'application/pdf') {
      setFile(dropped)
      setStep('email')
    } else {
      setError('Please upload a PDF file.')
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (selected?.type === 'application/pdf') {
      setFile(selected)
      setStep('email')
    } else {
      setError('Please upload a PDF file.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !email || !name || !role) return
    setLoading(true)
    setError('')

    try {
      const supabase = createClient()
      const slug = generateSlug(name, role)

      // Store pending upload info for post-auth pickup on dashboard
      // localStorage persists across tabs — needed because magic link opens in a new tab
      localStorage.setItem('pendingUpload', JSON.stringify({ slug, fileName: file.name }))

      // Store file as base64 for post-auth upload
      const reader = new FileReader()
      reader.onload = () => {
        try { localStorage.setItem('pendingFile', reader.result as string) } catch { /* quota */ }
      }
      reader.readAsDataURL(file)

      // Send magic link — Supabase creates/finds user and emails them
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { slug, name },
        },
      })
      if (otpError) throw otpError

      setStep('sent')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-white flex flex-col items-center px-4 py-12">
      <h1 className="text-4xl font-bold text-gray-900 text-center max-w-xl leading-tight mb-3">
        Turn messy resume feedback into clear, actionable comments — in one place.
      </h1>
      <p className="text-gray-500 text-center max-w-sm mb-8">
        Share one link. Reviewers annotate your resume directly — no sign-up needed.
      </p>

      <div className="text-sm text-gray-400 mb-8">
        <span className="font-semibold text-gray-700">{communityCount.toLocaleString()}</span> resumes reviewed this week
      </div>

      <div className="flex flex-wrap gap-2 justify-center mb-10">
        {['🔒 Private link', '🔗 Permanent URL', '📱 Works on WhatsApp', '✉️ No sign-up for reviewers'].map(pill => (
          <span key={pill} className="text-xs bg-gray-100 text-gray-600 rounded-full px-3 py-1">{pill}</span>
        ))}
      </div>

      <div className="w-full max-w-md bg-white border border-gray-200 rounded-2xl shadow-sm p-8">

        {step === 'upload' && (
          <>
            <div
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-gray-200 hover:border-indigo-300'
              }`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
            >
              <div className="text-4xl mb-3">📄</div>
              <p className="font-medium text-gray-700 mb-1">Drop your resume here</p>
              <p className="text-sm text-gray-400">or click to browse · PDF only · max 10 MB</p>
            </div>
            <input ref={fileRef} type="file" accept="application/pdf" className="hidden" onChange={handleFileChange} />
            {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}
          </>
        )}

        {step === 'email' && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex items-center gap-2 bg-indigo-50 rounded-lg px-3 py-2 mb-2">
              <span className="text-indigo-500">📄</span>
              <span className="text-sm text-indigo-700 font-medium truncate">{file?.name}</span>
              <button type="button" className="ml-auto text-xs text-indigo-400 hover:text-indigo-600"
                onClick={() => { setFile(null); setStep('upload') }}>Change</button>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your first name</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)}
                placeholder="Kwame"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your target role</label>
              <input type="text" required value={role} onChange={e => setRole(e.target.value)}
                placeholder="Product Manager"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Your email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <p className="text-xs text-gray-400 mt-1">We&apos;ll email you your link and notify you when feedback arrives.</p>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl py-3 text-sm transition-colors disabled:opacity-60">
              {loading ? 'Creating your link…' : 'Get my free resume link →'}
            </button>
            <p className="text-xs text-center text-gray-400">Free · No credit card · Your link is yours forever</p>
          </form>
        )}

        {step === 'sent' && (
          <div className="text-center py-4">
            <div className="text-5xl mb-4">📬</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Check your inbox</h2>
            <p className="text-gray-500 text-sm mb-4">
              We sent a magic link to <strong>{email}</strong>.<br />
              Click it to access your dashboard and start sharing.
            </p>
            <p className="text-xs text-gray-400">Can&apos;t find it? Check your spam folder.</p>
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-gray-400">
        Already have a link?{' '}
        <a href="/dashboard" className="text-indigo-600 hover:underline">Go to dashboard →</a>
      </p>
    </main>
  )
}
