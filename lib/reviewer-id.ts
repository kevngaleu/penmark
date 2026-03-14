const KEY = 'penmark-reviewer-id'

/** Returns a stable UUID for this browser, creating one on first call. */
export function getReviewerId(): string {
  if (typeof window === 'undefined') return ''
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(KEY, id)
  }
  return id
}
