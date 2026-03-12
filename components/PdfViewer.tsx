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
        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`

        const pdf = await pdfjsLib.getDocument(pdfUrl).promise
        if (cancelled) return

        const container = containerRef.current
        if (!container) return

        container.innerHTML = ''

        // Compute scale to fit container width (max 1.5x)
        // Avoids PDF overflowing its container and causing layout mismatches
        const containerWidth = container.clientWidth - 32 // minus px-4 padding on both sides
        const firstPage = await pdf.getPage(1)
        const naturalVp = firstPage.getViewport({ scale: 1.0 })
        const scale = Math.min(1.5, containerWidth > 0 ? containerWidth / naturalVp.width : 1.5)

        // Device pixel ratio — doubles canvas resolution on Retina displays
        const dpr = window.devicePixelRatio || 1

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          if (cancelled) return

          // Viewport in CSS pixels
          const viewport = page.getViewport({ scale })

          // Page wrapper — sized in CSS pixels
          const pageWrapper = document.createElement('div')
          pageWrapper.className = 'pdf-page'
          pageWrapper.dataset.page = String(pageNum)
          pageWrapper.style.cssText = `position:relative;width:${viewport.width}px;height:${viewport.height}px;margin:0 auto 16px;box-shadow:0 2px 8px rgba(0,0,0,0.12);background:#fff;overflow:hidden;`

          // Canvas — internal resolution scaled by DPR for crisp Retina rendering
          // CSS size matches viewport (CSS pixels); canvas pixels = viewport * dpr
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width * dpr)
          canvas.height = Math.round(viewport.height * dpr)
          canvas.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;pointer-events:none;z-index:1;`

          const ctx = canvas.getContext('2d')!
          ctx.scale(dpr, dpr) // scale context to match DPR before rendering
          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return

          // Text layer — same CSS pixel dimensions as canvas so spans align exactly
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

    // PM-015: collect all spans that visually overlap the selection rect and join
    // them in reading order. sel.toString() follows DOM order which doesn't match
    // visual order in PDF.js text layers — words split across spans produce
    // truncated text like "mobile-first fina" instead of "mobile-first financial".
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
        // Span overlaps selection rect (4px tolerance accounts for scaleX rounding)
        const overlaps = !(r.right < selRect.left - 4 || r.left > selRect.right + 4 ||
                           r.bottom < selRect.top - 4 || r.top > selRect.bottom + 4)
        if (overlaps) collected.push({ text, rect: r })
      }

      if (collected.length === 0) return sel.toString().trim()

      // Sort by reading order: top-to-bottom, then left-to-right within each row
      collected.sort((a, b) => {
        const rowDiff = Math.round(a.rect.top) - Math.round(b.rect.top)
        if (Math.abs(rowDiff) > 5) return rowDiff
        return a.rect.left - b.rect.left
      })

      // Join spans, adding a space wherever there is a visible gap between them
      let result = ''
      let prev: DOMRect | null = null
      for (const { text, rect } of collected) {
        if (result && prev) {
          const sameRow = Math.abs(rect.top - prev.top) <= 5
          if (!sameRow || rect.left - prev.right > 1) result += ' '
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
          white-space: pre;
          cursor: text;
          user-select: text;
          -webkit-user-select: text;
          pointer-events: auto;
          /* Critical: PDF.js scaleX transforms must originate from the left edge.
             Default transform-origin is 50% 50% (center), which shifts spans
             horizontally and misaligns them with the canvas-rendered text. */
          transform-origin: 0% 0%;
        }
        .textLayer ::selection {
          background: rgba(99, 102, 241, 0.3);
          color: transparent;
        }
      `}</style>
    </div>
  )
}
