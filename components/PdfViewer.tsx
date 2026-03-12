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
          // pointer-events:none lets mouse events pass through to the text layer above
          canvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:1;'

          const ctx = canvas.getContext('2d')!
          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return

          // Text layer for selection
          const textLayerDiv = document.createElement('div')
          textLayerDiv.className = 'textLayer'
          textLayerDiv.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;z-index:2;`

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

    // PM-015 fix: collect all spans that visually overlap with the selection rect
    // and join them in reading order. sel.toString() follows DOM order which can
    // be out of sync with visual order in PDF.js text layers, producing truncated
    // or garbled text (e.g. "mobile-first fina" instead of "mobile-first financial").
    function captureCleanText(sel: Selection, pageEl: HTMLElement): string {
      if (sel.rangeCount === 0) return sel.toString().trim()
      const selRect = sel.getRangeAt(0).getBoundingClientRect()
      if (selRect.width === 0 && selRect.height === 0) return sel.toString().trim()

      const spans = Array.from(pageEl.querySelectorAll('.textLayer span'))
      const collected: { text: string; rect: DOMRect }[] = []

      for (const span of spans) {
        const text = span.textContent || ''
        if (!text.trim()) continue
        const r = span.getBoundingClientRect()
        if (r.width === 0) continue
        // Include span if it intersects the selection rect (2px tolerance)
        const overlaps = !(r.right < selRect.left - 2 || r.left > selRect.right + 2 ||
                           r.bottom < selRect.top - 2 || r.top > selRect.bottom + 2)
        if (overlaps) collected.push({ text, rect: r })
      }

      if (collected.length === 0) return sel.toString().trim()

      // Sort by reading order: top-to-bottom, left-to-right
      collected.sort((a, b) => {
        const rowDiff = Math.round(a.rect.top) - Math.round(b.rect.top)
        if (Math.abs(rowDiff) > 3) return rowDiff
        return a.rect.left - b.rect.left
      })

      // Join, inserting a space wherever there is a visible gap between spans
      let result = ''
      let prev: DOMRect | null = null
      for (const { text, rect } of collected) {
        if (result && prev) {
          const sameRow = Math.abs(rect.top - prev.top) <= 3
          if (!sameRow || rect.left - prev.right > 0) result += ' '
        }
        result += text
        prev = rect
      }
      return result.replace(/\s+/g, ' ').trim()
    }

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
        text: captureCleanText(sel, pageEl),
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
        .textLayer span {
          color: transparent;
          position: absolute;
          cursor: text;
          user-select: text;
          -webkit-user-select: text;
          pointer-events: auto;
          white-space: pre;
        }
        .textLayer ::selection { background: rgba(99,102,241,0.3); color: transparent; }
      `}</style>
    </div>
  )
}
