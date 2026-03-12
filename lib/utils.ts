/** Format a timestamp as relative time ("2 hours ago") */
export function fmt(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/** Escape HTML special characters to prevent XSS */
export function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Generate a URL-safe slug from a name and role */
export function generateSlug(name: string, role: string): string {
  const year = new Date().getFullYear()
  const base = `${name}-${role}-${year}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base}-${suffix}`
}

/** Community counter — seeded algorithmically */
export function getCommunityCount(): number {
  const base = 118
  const weeksSinceLaunch = Math.floor(
    (Date.now() - new Date('2026-03-01').getTime()) / (7 * 86400000)
  )
  return base + weeksSinceLaunch * 9 + new Date().getDay() * 3
}
