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

        // Scale to fit container width, max 1.5×
        const containerWidth = container.clientWidth - 32
        const firstPage = await pdf.getPage(1)
        const naturalVp = firstPage.getViewport({ scale: 1.0 })
        const scale = Math.min(1.5, containerWidth > 0 ? containerWidth / naturalVp.width : 1.5)
        const dpr = window.devicePixelRatio || 1

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          if (cancelled) return

          const viewport = page.getViewport({ scale })

          // ── Page wrapper ──────────────────────────────────────────────────
          const pageWrapper = document.createElement('div')
          pageWrapper.className = 'pdf-page'
          pageWrapper.dataset.page = String(pageNum)
          pageWrapper.style.cssText = `position:relative;width:${viewport.width}px;height:${viewport.height}px;margin:0 auto 16px;box-shadow:0 2px 8px rgba(0,0,0,0.12);background:#fff;overflow:hidden;`

          // ── Canvas (crisp DPR rendering) ──────────────────────────────────
          const canvas = document.createElement('canvas')
          canvas.width = Math.round(viewport.width * dpr)
          canvas.height = Math.round(viewport.height * dpr)
          canvas.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;pointer-events:none;z-index:1;`
          const ctx = canvas.getContext('2d')!
          ctx.scale(dpr, dpr)
          await page.render({ canvasContext: ctx, viewport }).promise
          if (cancelled) return

          // ── Text overlay ──────────────────────────────────────────────────
          // We bypass renderTextLayer entirely and position every span ourselves
          // using the same viewport transform matrix that PDF.js uses for the canvas.
          // This guarantees spans sit exactly over the canvas glyphs — no CSS
          // transform-origin hacks, no dependency on renderTextLayer internals.
          //
          // viewport.transform = [a, b, c, d, e, f]
          //   CSS x  =  a·pdfX  +  c·pdfY  +  e
          //   CSS y  =  b·pdfX  +  d·pdfY  +  f
          // Standard upright page: [scale, 0, 0, -scale, 0, viewport.height]
          const [va, vb, vc, vd, ve, vf] = viewport.transform

          const textLayerDiv = document.createElement('div')
          textLayerDiv.className = 'textLayer'
          textLayerDiv.style.cssText = `position:absolute;top:0;left:0;width:${viewport.width}px;height:${viewport.height}px;z-index:2;user-select:text;-webkit-user-select:text;`

          const textContent = await page.getTextContent()
          if (cancelled) return

          for (const rawItem of textContent.items) {
            // TextItem has {str, transform, width, height}; TextMarkedContent does not
            const item = rawItem as { str?: string; transform?: number[]; width?: number; height?: number }
            if (!item.str || !item.transform || !item.str.trim()) continue

            // item.transform = text matrix [ta, tb, tc, td, te, tf]
            // (te, tf) = glyph origin (baseline, left edge) in PDF user space
            const [ta, tb, , , te, tf] = item.transform

            // Convert origin to CSS viewport coordinates
            const cssLeft     = va * te + vc * tf + ve
            const cssBaseline = vb * te + vd * tf + vf

            // Font size in PDF user units → CSS pixels
            // For standard text matrix the first column magnitude is the font size
            const fontSizePdf = Math.sqrt(ta * ta + tb * tb)
            const fontSizeCss = Math.max(fontSizePdf * viewport.scale, 1)

            // Span dimensions in CSS pixels
            const widthCss  = Math.max((item.width  ?? 0) * viewport.scale, 1)
            const heightCss = item.height && item.height > 0
              ? item.height * viewport.scale
              : fontSizeCss

            // Top edge: baseline is at cssBaseline; text box extends upward by heightCss
            const topCss = cssBaseline - heightCss

            const span = document.createElement('span')
            span.textContent = item.str
            span.style.cssText = [
              'position:absolute',
              `left:${cssLeft.toFixed(2)}px`,
              `top:${topCss.toFixed(2)}px`,
              `width:${widthCss.toFixed(2)}px`,
              `height:${heightCss.toFixed(2)}px`,
              'color:transparent',
              'white-space:pre',
              'cursor:text',
              'user-select:text',
              'pointer-events:auto',
              'line-height:1',
            ].join(';')
            span.style.setProperty('-webkit-user-select', 'text')
            textLayerDiv.appendChild(span)
          }

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

  // ── Selection handler ───────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded) return

    // Collect every span whose bounding rect overlaps ANY of the selection's
    // per-line rects, sort into reading order, join with spaces.
    // Uses getClientRects() (one tight rect per line) rather than
    // getBoundingClientRect() (one big union rect) to avoid pulling in spans
    // from rows the user never touched.
    function captureCleanText(sel: Selection, pageEl: HTMLElement): string {
      if (sel.rangeCount === 0) return sel.toString().trim()
      const range    = sel.getRangeAt(0)
      const selRects = Array.from(range.getClientRects())
      if (selRects.length === 0) return sel.toString().trim()

      const spans = Array.from(pageEl.querySelectorAll('.textLayer span'))
      const collected: { text: string; rect: DOMRect }[] = []

      for (const span of spans) {
        const text = span.textContent || ''
        if (!text.trim()) continue
        const r = span.getBoundingClientRect()
        if (r.width === 0) continue

        const overlaps = selRects.some(sr =>
          !(r.right  < sr.left   - 4 ||
            r.left   > sr.right  + 4 ||
            r.bottom < sr.top    - 4 ||
            r.top    > sr.bottom + 4)
        )
        if (overlaps) collected.push({ text, rect: r })
      }

      if (collected.length === 0) return sel.toString().trim()

      // Reading order: top → bottom, then left → right within each row
      collected.sort((a, b) => {
        const rowDiff = Math.round(a.rect.top) - Math.round(b.rect.top)
        if (Math.abs(rowDiff) > 5) return rowDiff
        return a.rect.left - b.rect.left
      })

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

      const range     = sel.getRangeAt(0)
      const container = containerRef.current
      if (!container) return

      let pageEl: HTMLElement | null = null
      let node: Node | null = range.commonAncestorContainer
      while (node && node !== container) {
        if (node instanceof HTMLElement && node.dataset.page) { pageEl = node; break }
        node = node.parentNode
      }
      if (!pageEl) return

      const pageNum  = parseInt(pageEl.dataset.page!)
      const pageRect = pageEl.getBoundingClientRect()
      const rangeRect = range.getBoundingClientRect()

      const topPct  = ((rangeRect.top  - pageRect.top)  / pageRect.height) * 100
      const leftPct = ((rangeRect.left - pageRect.left) / pageRect.width)  * 100

      onSelection({
        text:    captureCleanText(sel, pageEl),
        page:    pageNum,
        topPct:  Math.max(0, Math.min(100, topPct)),
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
              top:  pageEl.offsetTop  + (marker.topPct  / 100) * pageEl.offsetHeight - 12,
              left: pageEl.offsetLeft + (marker.leftPct / 100) * pageEl.offsetWidth  - 12,
            }}
          >
            {marker.num ?? '•'}
          </div>
        )
      })}

      <style>{`
        .textLayer span::selection {
          background: rgba(99, 102, 241, 0.35);
          color: transparent;
        }
      `}</style>
    </div>
  )
}
