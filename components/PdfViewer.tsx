'use client'

import { useEffect, useRef, useState } from 'react'

interface SelectionInfo {
  text: string
  page: number
  topPct: number
  leftPct: number
}

interface PdfViewerProps {
  pdfUrl: string
  onSelection: (info: SelectionInfo) => void
  isOwner?: boolean
  markers?: Array<{ id: string; page: number; topPct: number; leftPct: number; num?: number }>
}

export default function PdfViewer({ pdfUrl, onSelection, markers = [] }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadPdf() {
      try {
        // Dynamic import — PDF.js must be client-side only
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`

        const pdf = await pdfjsLib.getDocument(pdfUrl).promise
        if (cancelled) return


        const container = containerRef.current
        if (!container) return

        container.innerHTML = ''

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          if (cancelled) return

          const viewport = page.getViewport({ scale: 1.5 })

          // Page wrapper
          const pageWrapper = document.createElement('div')
          pageWrapper.className = 'pdf-page'
          pageWrapper.dataset.page = String(pageNum)
          pageWrapper.style.cssText = `position:relative;width:${viewport.width}px;height:${viewport.height}px;margin:0 auto 16px;box-shadow:0 2px 8px rgba(0,0,0,0.12);background:#fff;`

          // Canvas
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          canvas.style.cssText = 'position:absolute;top:0;left:0;'

          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return

          // Text layer for selection
          const textLayerDiv = document.createElement('div')
          textLayerDiv.className = 'textLayer'
          textLayerDiv.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;`

          const textContent = await page.getTextContent()
          if (cancelled) return

          const rtl = pdfjsLib.renderTextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport,
            textDivs: [],
          })
          await rtl.promise
          if (cancelled) return

          pageWrapper.appendChild(canvas)
          pageWrapper.appendChild(textLayerDiv)
          container.appendChild(pageWrapper)
        }

        setLoaded(true)
      } catch (err) {
        if (!cancelled) setError('Failed to load PDF. Please try again.')
        console.error(err)
      }
    }

    loadPdf()
    return () => { cancelled = true }
  }, [pdfUrl])

  // Text selection handler
  useEffect(() => {
    if (!loaded) return

    function handleMouseUp() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) return

      const range = sel.getRangeAt(0)
      const container = containerRef.current
      if (!container) return

      // Find which page the selection is on
      let pageEl: HTMLElement | null = null
      let node: Node | null = range.commonAncestorContainer
      while (node && node !== container) {
        if (node instanceof HTMLElement && node.dataset.page) {
          pageEl = node
          break
        }
        node = node.parentNode
      }
      if (!pageEl) return

      const pageNum = parseInt(pageEl.dataset.page!)
      const pageRect = pageEl.getBoundingClientRect()
      const rangeRect = range.getBoundingClientRect()

      const topPct = ((rangeRect.top - pageRect.top) / pageRect.height) * 100
      const leftPct = ((rangeRect.left - pageRect.left) / pageRect.width) * 100

      onSelection({
        text: sel.toString().trim(),
        page: pageNum,
        topPct: Math.max(0, Math.min(100, topPct)),
        leftPct: Math.max(0, Math.min(100, leftPct)),
      })
    }

    document.addEventListener('mouseup', handleMouseUp)
    return () => document.removeEventListener('mouseup', handleMouseUp)
  }, [loaded, onSelection])

  return (
    <div className="relative">
      {!loaded && !error && (
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          Loading PDF…
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center py-20 text-red-400 text-sm">{error}</div>
      )}
      <div ref={containerRef} className="pdf-container px-4 py-4" />

      {/* Comment markers */}
      {loaded && markers.map(marker => {
        const pageEl = containerRef.current?.querySelector(`[data-page="${marker.page}"]`) as HTMLElement
        if (!pageEl) return null
        return (
          <div
            key={marker.id}
            className="absolute z-10 w-6 h-6 rounded-full bg-indigo-600 text-white text-xs flex items-center justify-center font-bold shadow pointer-events-none"
            style={{
              top: pageEl.offsetTop + (marker.topPct / 100) * pageEl.offsetHeight - 12,
              left: pageEl.offsetLeft + (marker.leftPct / 100) * pageEl.offsetWidth - 12,
            }}
          >
            {marker.num ?? '•'}
          </div>
        )
      })}

      <style>{`
        .textLayer { opacity: 1; }
        .textLayer span { color: transparent; position: absolute; cursor: text; }
        .textLayer ::selection { background: rgba(99,102,241,0.3); }
      `}</style>
    </div>
  )
}
