import { Activity } from 'lucide-react'
import { fmtDateTime, humanEvent } from '../lib/format'
import { Badge, EmptyState } from './ui'

const TONE = {
  LOGIN: 'slate', RESUME_SCORED: 'brand', CANDIDATE_PROMOTED: 'green', CANDIDATE_FILTERED: 'zinc', INVITATION_SENT: 'blue',
  QA_STARTED: 'blue', ANSWER_SUBMITTED: 'blue', ANSWER_SCORED: 'brand', QA_COMPLETED: 'blue', COMBINED_SCORED: 'brand',
  INTERVIEW_ASSIGNED: 'violet', INTERVIEWER_CHANGED: 'violet', INTERVIEW_DATE_UPDATED: 'violet', INTERVIEW_DECISION: 'emerald',
  STATUS_CHANGED: 'amber', NOTE_ADDED: 'slate', NEXT_STEP_ADDED: 'slate', FINAL_DECISION: 'emerald',
  ANSWER_SCORE_FAILED: 'red', RESUME_SCORE_FAILED: 'red', LOGIN_FAILED: 'red',
}

export function metaSummary(e) {
  const m = e.metadata || {}
  switch (e.event_type) {
    case 'RESUME_SCORED': return `score ${m.score} · confidence ${m.confidence} · threshold ${m.threshold}`
    case 'STATUS_CHANGED': return `${m.from_status || '—'} → ${m.to_status}${m.reason ? ` · ${m.reason}` : ''}`
    case 'ANSWER_SCORED': return `${m.question_id}: ${m.score}/5 · confidence ${m.confidence}`
    case 'ANSWER_SUBMITTED': return `${m.question_id} · ${m.time_taken_sec}s${m.auto_submitted ? ' · auto-submitted' : ''} · tabs ${m.telemetry?.tab_switches ?? 0}, paste ${m.telemetry?.paste_count ?? 0}, copy ${m.telemetry?.copy_count ?? 0}`
    case 'COMBINED_SCORED': return `resume ${m.resume_score} × ${m.resume_weight} + Q&A ${m.qa_normalized} × ${m.qa_weight} = ${m.combined} → ${m.band}`
    case 'INTERVIEW_ASSIGNED': return `${m.interviewer}${m.scheduled_at ? ` on ${fmtDateTime(m.scheduled_at)}` : ''}`
    case 'INTERVIEW_DATE_UPDATED': return `${fmtDateTime(m.from_date)} → ${fmtDateTime(m.to_date)}`
    case 'INTERVIEWER_CHANGED': return `${m.from_interviewer} → ${m.to_interviewer}`
    case 'INTERVIEW_DECISION': return `${m.decision}${m.reason ? ` · ${m.reason}` : ''}`
    case 'NOTE_ADDED': return m.note
    case 'NEXT_STEP_ADDED': return m.next_step
    case 'FINAL_DECISION': return `${m.decision}${m.reason ? ` · ${m.reason}` : ''}`
    case 'CANDIDATE_PROMOTED': case 'CANDIDATE_FILTERED': return m.reason
    case 'JD_UPDATED': return m.changes ? `changed: ${Object.keys(m.changes).join(', ') || 'nothing'}` : JSON.stringify(m)
    case 'SCREENING_RUN': return `screened ${m.screened} · promoted ${m.promoted} · filtered ${m.filtered}${m.errors ? ` · errors ${m.errors}` : ''}`
    default: return Object.keys(m).length ? JSON.stringify(m) : ''
  }
}

export default function AuditTimeline({ events }) {
  if (!events?.length) return <EmptyState icon={Activity} title="No audit events yet" />
  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-6">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[31px] top-1 h-3 w-3 rounded-full border-2 border-white bg-brand-500 ring-2 ring-brand-100" />
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={TONE[e.event_type] || 'slate'}>{humanEvent(e.event_type)}</Badge>
            <span className="text-xs text-slate-500">{fmtDateTime(e.created_at)}</span>
            <span className="text-xs text-slate-400">by <b className="font-semibold text-slate-600">{e.actor}</b> ({e.role})</span>
          </div>
          <p className="mt-1 break-words text-sm text-slate-600">{metaSummary(e)}</p>
        </li>
      ))}
    </ol>
  )
}
