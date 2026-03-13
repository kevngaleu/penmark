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
        const containerWidth = container.clientWidth - 32
        const firstPage = await pdf.getPage(1)
        const naturalVp = firstPage.getViewport({ scale: 1.0 })
        const scale = Math.min(1.5, containerWidth > 0 ? containerWidth / naturalVp.width : 1.5)

        // Device pixel ratio — doubles canvas resolution on Retina displays
        const dpr = window.devicePixelRatio || 1

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          if (cancelled) return

          const viewport = page.getViewport({ scale })

          // Page wrapper
          const pageWrapper = document.createElement('div')
          pageWrapper.className = 'pdf-page'
          pageWrapper.dataset.page = String(pageNum)
          pageWrapper.style.cssText = `position:relative;width:${viewport.width}px;height:${viewport.height}px;margin:0 auto 16px;box-shadow:0 2px 8px rgba(0,0,0,0.12);background:#fff;overflow:hidden;`

          // Canvas with DPR correction for crisp Retina rendering
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width * dpr)
          canvas.height = Math.round(viewport.height * dpr)
          canvas.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;pointer-events:none;z-index:1;`

          const ctx = canvas.getContext('2d')!
          ctx.scale(dpr, dpr)
          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return

          // Text layer — same CSS pixel dimensions as canvas
          const textLayerDiv = document.createElement('div')
          textLayerDiv.className = 'textLayer'
          textLayerDiv.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;z-index:2;user-select:text;-webkit-user-select:text;`

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

          // CRITICAL: set transform-origin and cursor as INLINE styles after renderTextLayer.
          // CSS rules can be overridden or mis-ordered; inline styles win unconditionally.
          // PDF.js applies scaleX(n) starting from the left edge — origin must be 0% 0%
          // or every span shifts horizontally, misaligning cursor hit areas from canvas text.
          textLayerDiv.querySelectorAll('span').forEach((el) => {
            const s = (el as HTMLElement).style
            s.transformOrigin = '0% 0%'
            s.cursor = 'text'
            s.pointerEvents = 'auto'
            s.userSelect = 'text'
            s.setProperty('-webkit-user-select', 'text')
            // Ensure color is transparent — some PDF.js builds set their own color
            s.color = 'transparent'
          })

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

    // PM-015: collect spans that overlap the selection, sort by reading order, join.
    //
    // Key improvement: use range.getClientRects() (per-line rects) instead of
    // getBoundingClientRect() (a single union rect). The union rect for a
    // multi-line selection can span several lines, accidentally pulling in spans
    // the user never touched. Per-line rects are tight and accurate.
    function captureCleanText(sel: Selection, pageEl: HTMLElement): string {
      if (sel.rangeCount === 0) return sel.toString().trim()
      const range = sel.getRangeAt(0)
      const selRects = Array.from(range.getClientRects())
      if (selRects.length === 0) return sel.toString().trim()

      const spans = Array.from(pageEl.querySelectorAll('.textLayer span'))
      const collected: { text: string; rect: DOMRect }[] = []

      for (const span of spans) {
        const text = span.textContent || ''
        if (!text.trim()) continue
        const r = span.getBoundingClientRect()
        if (r.width === 0) continue

        // Span must overlap at least one of the selection's per-line rects
        const overlaps = selRects.some(sr =>
          !(r.right < sr.left - 4 || r.left > sr.right + 4 ||
            r.bottom < sr.top - 4 || r.top > sr.bottom + 4)
        )
        if (overlaps) collected.push({ text, rect: r })
      }

      if (collected.length === 0) return sel.toString().trim()

      // Sort reading order: top-to-bottom, then left-to-right within each row
      collected.sort((a, b) => {
        const rowDiff = Math.round(a.rect.top) - Math.round(b.rect.top)
        if (Math.abs(rowDiff) > 5) return rowDiff
        return a.rect.left - b.rect.left
      })

      // Join spans; add space at row breaks or visible horizontal gaps
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
