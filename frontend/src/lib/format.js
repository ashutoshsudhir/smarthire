export const STATUS_META = {
  APPLIED: { label: 'Applied', tone: 'slate' },
  FILTERED: { label: 'Filtered', tone: 'zinc' },
  SCREENING: { label: 'Screening', tone: 'blue' },
  PASSED: { label: 'Passed', tone: 'green' },
  HOLD: { label: 'Hold', tone: 'amber' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  INTERVIEW_SCHEDULED: { label: 'Interview Scheduled', tone: 'violet' },
  ACCEPTED: { label: 'Accepted', tone: 'emerald' },
  ON_HOLD: { label: 'On Hold', tone: 'amber' },
  NO_SHOW: { label: 'No-Show', tone: 'orange' },
  HIRED: { label: 'Hired', tone: 'emerald' },
}

export const BAND_META = {
  PASS: { label: 'PASS', tone: 'green' },
  HOLD: { label: 'HOLD', tone: 'amber' },
  REJECT: { label: 'REJECT', tone: 'red' },
}

export function fmtDate(iso, opts = {}) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', ...opts })
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(iso) {
  if (!iso) return ''
  const s = (Date.now() - new Date(iso).getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}

export const fmtScore = (v, digits = 0) => (v === null || v === undefined ? '—' : Number(v).toFixed(digits))
export const fmtPct = (v) => (v === null || v === undefined ? '—' : `${Math.round(v * 100)}%`)

export function scoreTone(v) {
  if (v === null || v === undefined) return 'slate'
  if (v >= 75) return 'green'
  if (v >= 60) return 'amber'
  return 'red'
}

// datetime-local <-> ISO helpers
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export const fromLocalInput = (v) => (v ? new Date(v).toISOString() : null)

export const humanEvent = (e) => e.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()).replace(/^Qa /, 'Q&A ')
