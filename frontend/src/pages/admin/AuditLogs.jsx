import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react'
import { metaSummary } from '../../components/AuditTimeline'
import { Badge, Card, EmptyState, ErrorState, PageHeader, Skeleton } from '../../components/ui'
import { fmtDateTime, humanEvent } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const EVENTS = ['LOGIN', 'JD_CREATED', 'JD_UPDATED', 'SCREENING_RUN', 'RESUME_SCORED', 'CANDIDATE_PROMOTED', 'CANDIDATE_FILTERED',
  'INVITATION_SENT', 'QA_STARTED', 'ANSWER_SUBMITTED', 'ANSWER_SCORED', 'QA_COMPLETED', 'COMBINED_SCORED', 'INTERVIEW_ASSIGNED',
  'INTERVIEWER_CHANGED', 'INTERVIEW_DATE_UPDATED', 'INTERVIEW_DECISION', 'STATUS_CHANGED', 'FINAL_DECISION', 'NOTE_ADDED',
  'NEXT_STEP_ADDED', 'ANSWER_SCORE_FAILED', 'RESUME_SCORE_FAILED', 'LOGIN_FAILED']
const PAGE = 25

export default function AuditLogs() {
  const [eventType, setEventType] = useState('')
  const [candidate, setCandidate] = useState('')
  const [page, setPage] = useState(0)
  const { data, error, loading, reload } = useApi('/audit-logs', {
    params: { event_type: eventType || undefined, candidate_id: candidate || undefined, limit: PAGE, offset: page * PAGE },
  })
  const total = data?.total || 0
  return (
    <div className="animate-fade-in">
      <PageHeader title="Audit log" subtitle="Every score, status transition, assignment and note, timestamped and persisted." />
      <Card className="mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <select className="input" value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(0) }} aria-label="Event type">
          <option value="">All events</option>
          {EVENTS.map((e) => <option key={e} value={e}>{humanEvent(e)}</option>)}
        </select>
        <select className="input" value={candidate} onChange={(e) => { setCandidate(e.target.value); setPage(0) }} aria-label="Candidate">
          <option value="">All candidates</option>
          {Array.from({ length: 10 }, (_, i) => `cand-${i + 1}`).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="flex items-center text-sm text-slate-500">{total} events</div>
      </Card>
      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/70"><tr><th className="th">Timestamp</th><th className="th">Event</th><th className="th">Actor</th><th className="th">Role</th><th className="th">Candidate</th><th className="th">Details</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !data ? [...Array(6)].map((_, i) => <tr key={i}><td colSpan={6} className="px-4 py-3"><Skeleton className="h-6" /></td></tr>)
                  : data.items.length === 0 ? <tr><td colSpan={6}><EmptyState icon={ScrollText} title="No events" /></td></tr>
                  : data.items.map((e) => (
                    <tr key={e.id} className="align-top hover:bg-slate-50">
                      <td className="td text-xs text-slate-500">{fmtDateTime(e.created_at)}</td>
                      <td className="td"><Badge tone="brand">{humanEvent(e.event_type)}</Badge></td>
                      <td className="td font-medium">{e.actor}</td>
                      <td className="td text-xs">{e.role}</td>
                      <td className="td">{e.candidate_id ? <Link to={`/admin/candidates/${e.candidate_id}`} className="text-brand-700 hover:underline">{e.candidate_id}</Link> : <span className="text-slate-400">{e.jd_id || '—'}</span>}</td>
                      <td className="px-4 py-3 text-xs text-slate-600 min-w-[18rem] max-w-xl whitespace-normal break-words">{metaSummary(e)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>{total ? `${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} of ${total}` : '0 results'}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40" aria-label="Previous"><ChevronLeft className="h-4 w-4" /></button>
              <button disabled={(page + 1) * PAGE >= total} onClick={() => setPage(page + 1)} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40" aria-label="Next"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
