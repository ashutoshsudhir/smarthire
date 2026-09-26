import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Brain, CalendarClock, CheckCircle2, ClipboardList, Flag, GitCommitHorizontal, History, LayoutGrid, ListPlus,
  Mail, MapPin, ShieldAlert, UserCheck, UserPlus,
} from 'lucide-react'
import AssignInterviewModal from '../../components/AssignInterviewModal'
import AuditTimeline from '../../components/AuditTimeline'
import { AntiCheat, FlagList, QAPerformance, ResumeAnalysis, ScoreSummary } from '../../components/Evidence'
import Notes from '../../components/Notes'
import {
  Avatar, Badge, BandBadge, Button, Card, CardHeader, EmptyState, ErrorState, Field, Modal, PageLoader, StatusBadge, Tabs,
} from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { STATUS_META, fmtDate, fmtDateTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const NEXT_STEP_SUGGESTIONS = ['Technical Round 2', 'HR Discussion', 'Background Check', 'Offer Discussion']

function InfoRow({ label, children }) {
  return <div className="flex justify-between gap-4 py-2 text-sm"><dt className="text-slate-500">{label}</dt><dd className="text-right font-medium text-slate-800">{children}</dd></div>
}

function StatusModal({ open, onClose, candidate, onSaved }) {
  const [status, setStatus] = useState(candidate.status)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await api.post(`/candidates/${candidate.id}/status`, { status, reason: reason || undefined })
      toast.success(`Status changed to ${STATUS_META[status]?.label || status}`)
      onSaved(); onClose()
    } catch (e) { toast.error(errorMessage(e)) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Change status" subtitle="Human override of the AI-suggested status. Recorded in the audit log."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>Update status</Button></>}>
      <div className="space-y-4">
        <Field label="New status">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {Object.entries(STATUS_META).filter(([k]) => k !== 'HIRED').map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </Field>
        <Field label="Reason"><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this changing?" /></Field>
      </div>
    </Modal>
  )
}

function FinalDecisionModal({ open, onClose, candidate, onSaved }) {
  const [decision, setDecision] = useState('HIRED')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  async function save() {
    setSaving(true)
    try {
      await api.post(`/candidates/${candidate.id}/final-decision`, { decision, reason: reason || undefined })
      toast.success(decision === 'HIRED' ? `${candidate.name} marked as hired` : `${candidate.name} rejected`)
      onSaved(); onClose()
    } catch (e) { toast.error(errorMessage(e)) } finally { setSaving(false) }
  }
  return (
    <Modal open={open} onClose={onClose} title="Final hiring decision" subtitle="AI scores and interviewer input are evidence. This decision is yours."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={decision === 'HIRED' ? 'success' : 'danger'} loading={saving} onClick={save}>Confirm {decision === 'HIRED' ? 'hire' : 'rejection'}</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {['HIRED', 'REJECTED'].map((d) => (
            <button key={d} type="button" onClick={() => setDecision(d)}
              className={`rounded-xl border p-4 text-left transition ${decision === d ? (d === 'HIRED' ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20' : 'border-red-500 bg-red-50 ring-2 ring-red-500/20') : 'border-slate-200 hover:border-slate-300'}`}>
              <div className="text-sm font-semibold text-slate-900">{d === 'HIRED' ? 'Hire' : 'Reject'}</div>
              <div className="text-xs text-slate-500">{d === 'HIRED' ? 'Extend an offer' : 'Close the application'}</div>
            </button>
          ))}
        </div>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Interviewer decision: <b>{candidate.interview?.decision ? STATUS_META[candidate.interview.decision]?.label : 'not submitted yet'}</b> · Combined score <b>{candidate.combined_score ?? '—'}</b> ({candidate.band || 'no band'})
        </div>
        <Field label="Reason (optional)"><textarea className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}

function NextSteps({ c, onSaved }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  async function add(desc) {
    const d = (desc ?? text).trim()
    if (!d) return
    setSaving(true)
    try {
      await api.post(`/candidates/${c.id}/next-steps`, { description: d })
      setText(''); toast.success('Next step added'); onSaved()
    } catch (e) { toast.error(errorMessage(e)) } finally { setSaving(false) }
  }
  return (
    <Card>
      <CardHeader title="Next steps" subtitle="Pipeline log shown to the candidate once they pass screening" icon={ListPlus} />
      <div className="border-b border-slate-100 p-5">
        <div className="flex gap-2">
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Technical Round 2" onKeyDown={(e) => e.key === 'Enter' && add()} />
          <Button loading={saving} onClick={() => add()} disabled={!text.trim()}>Add</Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {NEXT_STEP_SUGGESTIONS.map((s) => <button key={s} onClick={() => add(s)} className="rounded-full border border-slate-200 px-2.5 py-0.5 text-xs text-slate-600 hover:border-brand-300 hover:text-brand-700">+ {s}</button>)}
        </div>
      </div>
      {c.next_steps.length === 0 ? <EmptyState title="No next steps logged" /> : (
        <ul className="divide-y divide-slate-100">
          {c.next_steps.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="flex items-center gap-2 font-medium text-slate-800"><GitCommitHorizontal className="h-4 w-4 text-brand-500" />{s.description}</span>
              <span className="text-xs text-slate-400">{fmtDateTime(s.created_at)} · {s.author?.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export default function CandidateProfile() {
  const { candidateId } = useParams()
  const { data: c, error, loading, reload } = useApi(`/candidates/${candidateId}`)
  const [tab, setTab] = useState('overview')
  const [modal, setModal] = useState(null)
  const [busy, setBusy] = useState(null)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !c) return <PageLoader />
  const refresh = () => reload(true)

  async function promote() {
    setBusy('promote')
    try {
      await api.post(`/candidates/${c.id}/promote`, { reason: 'Manually promoted after human review' })
      toast.success(`${c.name} moved to Screening; Q&A invitation sent (in-app)`); refresh()
    } catch (e) { toast.error(errorMessage(e)) } finally { setBusy(null) }
  }
  async function rescore(answerId) {
    setBusy(answerId)
    try { await api.post(`/answers/${answerId}/score`); toast.success('Answer scored'); refresh() }
    catch (e) { toast.error(errorMessage(e)) } finally { setBusy(null) }
  }

  const canAssign = ['PASSED', 'HOLD', 'INTERVIEW_SCHEDULED', 'ON_HOLD', 'NO_SHOW'].includes(c.status)
  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'resume', label: 'Resume Analysis', icon: Brain },
    { id: 'qa', label: 'Q&A', icon: ClipboardList, count: c.answers.length || null },
    { id: 'interview', label: 'Interview', icon: CalendarClock },
    { id: 'audit', label: 'Audit', icon: History, count: c.audit?.length || null },
  ]

  return (
    <div className="animate-fade-in">
      <div className="mb-4 text-xs font-medium text-slate-500"><Link to="/admin/candidates" className="inline-flex items-center gap-1 hover:text-slate-700"><ArrowLeft className="h-3 w-3" />Candidates</Link></div>
      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={c.name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900">{c.name}</h1>
                <StatusBadge status={c.status} />
                <BandBadge band={c.band} />
                {c.final_decision && <Badge tone={c.final_decision === 'HIRED' ? 'emerald' : 'red'}>Final: {c.final_decision}</Badge>}
              </div>
              <div className="mt-1 text-sm text-slate-600"><Link to={`/admin/jobs/${c.jd_id}`} className="font-medium text-brand-700 hover:underline">{c.jd_title}</Link> · Applied {fmtDate(c.applied_at)}</div>
              <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{c.email}</span>
                <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{c.location}</span>
                <span>{c.experience_years} yrs experience</span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {['FILTERED', 'APPLIED'].includes(c.status) && <Button size="sm" variant="secondary" icon={UserPlus} loading={busy === 'promote'} onClick={promote}>Promote to screening</Button>}
                {canAssign && <Button size="sm" icon={UserCheck} onClick={() => setModal('assign')}>{c.interview ? 'Change interview' : 'Assign interviewer'}</Button>}
                <Button size="sm" variant="secondary" icon={Flag} onClick={() => setModal('status')}>Change status</Button>
                {c.band && <Button size="sm" variant="success" icon={CheckCircle2} onClick={() => setModal('final')}>Final decision</Button>}
              </div>
            </div>
          </div>
          <ScoreSummary c={c} />
        </div>
      </Card>

      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mt-6">
        {tab === 'overview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              {c.flags.length > 0 && <Card><CardHeader title="Human-in-the-loop flags" icon={ShieldAlert} /><div className="p-5"><FlagList flags={c.flags} /></div></Card>}
              <Card>
                <CardHeader title="Pipeline" subtitle={c.status_reason} icon={History} />
                {c.status_history.length === 0 ? <EmptyState title="No status changes yet" /> : (
                  <ol className="space-y-4 p-5">
                    {c.status_history.map((h, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <div className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-sm">
                            {h.from_status && <><StatusBadge status={h.from_status} /><span className="text-slate-400">→</span></>}
                            <StatusBadge status={h.to_status} />
                            <span className="text-xs text-slate-400">{fmtDateTime(h.created_at)} · {h.actor}</span>
                          </div>
                          {h.reason && <p className="mt-1 text-xs text-slate-500">{h.reason}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
              <NextSteps c={c} onSaved={refresh} />
            </div>
            <div className="space-y-6">
              <Card>
                <CardHeader title="Candidate information" />
                <dl className="divide-y divide-slate-100 px-5">
                  <InfoRow label="Candidate ID">{c.id}</InfoRow>
                  <InfoRow label="Education">{c.education}</InfoRow>
                  <InfoRow label="Experience">{c.experience_years} years</InfoRow>
                  <InfoRow label="Location">{c.location}</InfoRow>
                  <InfoRow label="Profile type"><Badge>{c.profile_type.replace(/_/g, ' ')}</Badge></InfoRow>
                  <InfoRow label="Current stage">{c.stage}</InfoRow>
                </dl>
              </Card>
              <Card>
                <CardHeader title="Interview" icon={CalendarClock} />
                <dl className="divide-y divide-slate-100 px-5">
                  <InfoRow label="Interviewer">{c.interview?.interviewer?.display_name || '—'}</InfoRow>
                  <InfoRow label="Date">{fmtDateTime(c.interview?.scheduled_at)}</InfoRow>
                  <InfoRow label="Decision">{c.interview?.decision ? <StatusBadge status={c.interview.decision} /> : '—'}</InfoRow>
                </dl>
              </Card>
              <Card><CardHeader title="Anti-cheat telemetry" subtitle="Admin only · never auto-rejects" /><div className="p-5"><AntiCheat telemetry={c.telemetry} /></div></Card>
            </div>
          </div>
        )}
        {tab === 'resume' && <ResumeAnalysis c={c} />}
        {tab === 'qa' && (
          <div className="space-y-6">
            <Card><CardHeader title="Anti-cheat telemetry" subtitle="Captured client-side during the Q&A · admin only" /><div className="p-5"><AntiCheat telemetry={c.telemetry} /></div></Card>
            <QAPerformance c={c} onRescore={rescore} rescoring={busy} />
          </div>
        )}
        {tab === 'interview' && (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="space-y-6">
              <Card>
                <CardHeader title="Interview assignment" icon={CalendarClock} action={canAssign && <Button size="sm" variant="secondary" onClick={() => setModal('assign')}>{c.interview ? 'Change' : 'Assign'}</Button>} />
                {!c.interview ? <EmptyState title="No interview assigned" description={canAssign ? 'Assign an interviewer and date.' : 'Available once Q&A screening is complete (PASS or HOLD).'} /> : (
                  <dl className="divide-y divide-slate-100 px-5">
                    <InfoRow label="Interviewer">{c.interview.interviewer.display_name}</InfoRow>
                    <InfoRow label="Email">{c.interview.interviewer.email}</InfoRow>
                    <InfoRow label="Scheduled">{fmtDateTime(c.interview.scheduled_at)}</InfoRow>
                    <InfoRow label="Status">{c.interview.status}</InfoRow>
                    <InfoRow label="Decision">{c.interview.decision ? <StatusBadge status={c.interview.decision} /> : 'Pending'}</InfoRow>
                  </dl>
                )}
              </Card>
              <NextSteps c={c} onSaved={refresh} />
            </div>
            <div className="lg:col-span-2"><Notes candidateId={c.id} notes={c.notes} onAdded={refresh} title="Interview notes" /></div>
          </div>
        )}
        {tab === 'audit' && <Card className="p-6"><AuditTimeline events={c.audit} /></Card>}
      </div>

      <AssignInterviewModal open={modal === 'assign'} onClose={() => setModal(null)} candidate={c} onSaved={refresh} />
      {modal === 'status' && <StatusModal open onClose={() => setModal(null)} candidate={c} onSaved={refresh} />}
      {modal === 'final' && <FinalDecisionModal open onClose={() => setModal(null)} candidate={c} onSaved={refresh} />}
    </div>
  )
}
