import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Brain, CalendarClock, ClipboardList, Gavel, LayoutGrid } from 'lucide-react'
import { AntiCheat, FlagList, QAPerformance, ResumeAnalysis, ScoreSummary } from '../../components/Evidence'
import Notes from '../../components/Notes'
import { Avatar, BandBadge, Button, Card, CardHeader, ConfirmDialog, ErrorState, Field, PageLoader, StatusBadge, Tabs, cn } from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { STATUS_META, fmtDateTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const DECISIONS = [
  { id: 'ACCEPTED', label: 'Accepted', cls: 'border-emerald-500 bg-emerald-50 text-emerald-800 ring-emerald-500/20' },
  { id: 'REJECTED', label: 'Rejected', cls: 'border-red-500 bg-red-50 text-red-800 ring-red-500/20' },
  { id: 'ON_HOLD', label: 'On-Hold', cls: 'border-amber-500 bg-amber-50 text-amber-800 ring-amber-500/20' },
  { id: 'NO_SHOW', label: 'No-Show', cls: 'border-orange-500 bg-orange-50 text-orange-800 ring-orange-500/20' },
]

function DecisionPanel({ c, onSaved }) {
  const [choice, setChoice] = useState(c.interview?.decision || '')
  const [reason, setReason] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [saving, setSaving] = useState(false)
  const locked = Boolean(c.final_decision)
  async function save() {
    setSaving(true)
    try {
      await api.post(`/candidates/${c.id}/status`, { status: choice, reason: reason || undefined })
      toast.success(`Decision recorded: ${STATUS_META[choice].label}`)
      setConfirm(false); setReason(''); onSaved()
    } catch (e) { toast.error(errorMessage(e)) } finally { setSaving(false) }
  }
  return (
    <Card>
      <CardHeader title="Interview decision" icon={Gavel} subtitle={c.interview?.decision ? `Current: ${STATUS_META[c.interview.decision].label} · ${fmtDateTime(c.interview.decided_at)}` : 'Submit after the interview'} />
      <div className="space-y-4 p-5">
        <div className="grid grid-cols-2 gap-2">
          {DECISIONS.map((d) => (
            <button key={d.id} type="button" disabled={locked} onClick={() => setChoice(d.id)}
              className={cn('rounded-lg border px-3 py-2.5 text-sm font-semibold transition disabled:opacity-50', choice === d.id ? `${d.cls} ring-2` : 'border-slate-200 text-slate-700 hover:border-slate-300')}>
              {d.label}
            </button>
          ))}
        </div>
        <Field label="Reason (optional)"><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} disabled={locked} /></Field>
        <Button className="w-full" disabled={!choice || locked} onClick={() => setConfirm(true)}>Submit decision</Button>
        <p className="text-xs text-slate-500">{locked ? 'The hiring manager has made the final decision.' : 'Your decision is evidence for the hiring manager, who makes the final call.'}</p>
      </div>
      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={save} loading={saving} title="Submit interview decision?"
        confirmLabel={`Mark ${STATUS_META[choice]?.label || ''}`} message={`${c.name} will be marked as ${STATUS_META[choice]?.label}. This is recorded in the audit log.`} />
    </Card>
  )
}

export default function CandidateReview() {
  const { candidateId } = useParams()
  const { data: c, error, loading, reload } = useApi(`/candidates/${candidateId}`)
  const [tab, setTab] = useState('overview')
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !c) return <PageLoader />
  const refresh = () => reload(true)
  const tabs = [
    { id: 'overview', label: 'Overview', icon: LayoutGrid },
    { id: 'resume', label: 'Resume evidence', icon: Brain },
    { id: 'qa', label: 'Q&A answers', icon: ClipboardList, count: c.answers.length || null },
  ]
  return (
    <div className="animate-fade-in">
      <div className="mb-4 text-xs font-medium text-slate-500"><Link to="/interviewer/dashboard" className="inline-flex items-center gap-1 hover:text-slate-700"><ArrowLeft className="h-3 w-3" />My interviews</Link></div>
      <Card className="mb-6 p-5 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <Avatar name={c.name} size="lg" />
            <div>
              <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-bold text-slate-900">{c.name}</h1><StatusBadge status={c.status} /><BandBadge band={c.band} /></div>
              <div className="mt-1 text-sm text-slate-600">{c.jd_title} · {c.experience_years} yrs · {c.location}</div>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700"><CalendarClock className="h-3.5 w-3.5" />Interview {fmtDateTime(c.interview?.scheduled_at)}</div>
            </div>
          </div>
          <ScoreSummary c={c} />
        </div>
      </Card>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Tabs tabs={tabs} active={tab} onChange={setTab} />
          <div className="mt-6 space-y-6">
            {tab === 'overview' && <>
              {c.flags.length > 0 && <Card><CardHeader title="Flags for attention" /><div className="p-5"><FlagList flags={c.flags} /></div></Card>}
              <Card><CardHeader title="Anti-cheat signals" /><div className="p-5"><AntiCheat telemetry={c.telemetry} /></div></Card>
              <Notes candidateId={c.id} notes={c.notes} onAdded={refresh} title="Interview notes" />
            </>}
            {tab === 'resume' && <ResumeAnalysis c={c} />}
            {tab === 'qa' && <QAPerformance c={c} />}
          </div>
        </div>
        <div className="space-y-6"><DecisionPanel c={c} onSaved={refresh} /></div>
      </div>
    </div>
  )
}
