import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft, Brain, CheckCircle2, ChevronDown, GraduationCap, ListChecks, MapPin, Pencil, RefreshCw, Sparkles, XCircle,
} from 'lucide-react'
import JDForm from '../../components/JDForm'
import SortableTh, { sortRows } from '../../components/SortableTh'
import {
  Avatar, Badge, BandBadge, Button, Card, CardHeader, ConfidenceMeter, ConfirmDialog, EmptyState, ErrorState, PageHeader,
  PageLoader, ScoreCell, SkillChips, StatusBadge, cn,
} from '../../components/ui'
import { api, errorMessage } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { fmtDateTime } from '../../lib/format'

function Config({ jd }) {
  const items = [
    ['Resume weight', `${Math.round(jd.resume_weight * 100)}%`], ['Q&A weight', `${Math.round(jd.qa_weight * 100)}%`],
    ['Pass threshold', jd.pass_threshold], ['Hold band', `${jd.pass_threshold - jd.hold_margin} – ${jd.pass_threshold}`],
    ['Confidence cutoff', jd.confidence_cutoff], ['Timer / question', `${jd.question_time_limit_sec}s`],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5">
      {items.map(([k, v]) => (
        <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-sm font-semibold text-slate-900">{v}</dd></div>
      ))}
    </dl>
  )
}

function Questions({ questions }) {
  const [open, setOpen] = useState(null)
  return (
    <div className="divide-y divide-slate-100">
      {questions.map((q, i) => (
        <div key={q.id}>
          <button onClick={() => setOpen(open === q.id ? null : q.id)} className="flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-slate-50">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">{i + 1}</span>
            <span className="flex-1 text-sm text-slate-700">{q.text}</span>
            <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition', open === q.id && 'rotate-180')} />
          </button>
          {open === q.id && (
            <div className="space-y-3 bg-slate-50/60 px-5 py-4 pl-13 text-sm">
              <div><div className="label">Reference answer</div><p className="text-slate-600">{q.reference_answer}</p></div>
              <div className="grid gap-3 md:grid-cols-3">
                {['score_5', 'score_3', 'score_0'].map((b) => (
                  <div key={b}><div className="label">{b.replace('score_', 'Score ')}</div>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-slate-600">{(q.rubric?.[b] || []).map((r) => <li key={r}>{r}</li>)}</ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function JobDetail() {
  const { jdId } = useParams()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useApi(`/jds/${jdId}`)
  const [screening, setScreening] = useState(false)
  const [lastRun, setLastRun] = useState(null)
  const [editing, setEditing] = useState(false)
  const [confirmRescreen, setConfirmRescreen] = useState(false)
  const [sort, setSort] = useState({ field: 'resume_score', dir: 'desc' })
  const [statusFilter, setStatusFilter] = useState('ALL')
  const autoRan = useRef(false)

  async function runScreening(force = false) {
    setScreening(true)
    setConfirmRescreen(false)
    const t = toast.loading('Running AI resume screening…')
    try {
      const r = await api.post(`/jds/${jdId}/screen`, { force })
      setLastRun(r.data)
      const { screened, promoted, filtered, errors } = r.data
      if (errors.length) toast.error(`${errors.length} resume(s) could not be scored: ${errors[0].error}`, { id: t })
      else if (screened === 0) toast.info('All resumes for this job are already screened.', { id: t })
      else toast.success(`Screened ${screened}: ${promoted.length} promoted to Screening, ${filtered.length} archived`, { id: t })
      if (promoted.length) toast.message(`Invitations sent (in-app) to ${promoted.length} candidate(s)`)
      await reload(true)
    } catch (e) {
      toast.error(errorMessage(e), { id: t })
    } finally {
      setScreening(false)
    }
  }

  // Per spec: opening a JD auto-scores any resumes that have not been screened yet.
  useEffect(() => {
    if (data && !autoRan.current && data.jd.pending_count > 0) {
      autoRan.current = true
      runScreening(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading || !data) return <PageLoader />
  const { jd, questions, candidates } = data
  const onSort = (field) => setSort((s) => ({ field, dir: s.field === field && s.dir === 'desc' ? 'asc' : 'desc' }))
  const statuses = ['ALL', ...new Set(candidates.map((c) => c.status))]
  const rows = sortRows(candidates.filter((c) => statusFilter === 'ALL' || c.status === statusFilter), sort)

  return (
    <div className="animate-fade-in">
      <PageHeader
        breadcrumb={<Link to="/admin/jobs" className="inline-flex items-center gap-1 hover:text-slate-700"><ArrowLeft className="h-3 w-3" />Jobs</Link>}
        title={jd.title}
        subtitle={<span className="inline-flex flex-wrap gap-x-4 gap-y-1"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{jd.location}</span><span className="inline-flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />{jd.experience_years}+ yrs · {jd.education}</span></span>}
        actions={<>
          <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit JD</Button>
          <Button variant="secondary" icon={RefreshCw} onClick={() => setConfirmRescreen(true)} disabled={screening}>Re-screen</Button>
          <Button icon={Brain} loading={screening} onClick={() => runScreening(false)}>Run resume screening</Button>
        </>}
      />

      {screening && (
        <Card className="mb-6 flex items-center gap-4 border-brand-200 bg-brand-50/60 p-4">
          <Sparkles className="h-5 w-5 animate-pulse text-brand-600" />
          <div className="text-sm text-brand-900"><span className="font-semibold">AI resume_match running…</span> Scoring each resume against the JD (score, matched skills, gaps, confidence).</div>
        </Card>
      )}
      {lastRun && !screening && lastRun.screened > 0 && (
        <Card className="mb-6 grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          <div className="flex items-center gap-3"><Brain className="h-5 w-5 text-brand-600" /><div className="text-sm"><div className="font-semibold text-slate-900">{lastRun.screened} resumes screened</div><div className="text-xs text-slate-500">Threshold {jd.pass_threshold}</div></div></div>
          <div className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div className="text-sm"><div className="font-semibold text-slate-900">{lastRun.promoted.length} moved to Screening</div><div className="text-xs text-slate-500">Q&A invitation sent (in-app)</div></div></div>
          <div className="flex items-center gap-3"><XCircle className="h-5 w-5 text-slate-400" /><div className="text-sm"><div className="font-semibold text-slate-900">{lastRun.filtered.length} archived</div><div className="text-xs text-slate-500">Reason recorded per candidate</div></div></div>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader title="Ranked shortlist" subtitle={`${candidates.length} candidates · click a row for full AI evidence`}
              action={<select className="input w-auto py-1.5 text-xs" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Filter by status">
                {statuses.map((s) => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.replace('_', ' ')}</option>)}
              </select>} />
            {rows.length === 0 ? <EmptyState title="No candidates" /> : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-100">
                  <thead className="bg-slate-50/70"><tr>
                    <SortableTh label="Candidate" field="name" sort={sort} onSort={onSort} />
                    <SortableTh label="ATS score" field="resume_score" sort={sort} onSort={onSort} />
                    <SortableTh label="Confidence" field="resume_confidence" sort={sort} onSort={onSort} />
                    <SortableTh label="Combined" field="combined_score" sort={sort} onSort={onSort} />
                    <th className="th">Band</th>
                    <SortableTh label="Status" field="status" sort={sort} onSort={onSort} />
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.map((c) => (
                      <tr key={c.id} onClick={() => navigate(`/admin/candidates/${c.id}`)} className="cursor-pointer hover:bg-slate-50">
                        <td className="td"><div className="flex items-center gap-2.5"><Avatar name={c.name} size="sm" /><div><div className="font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.experience_years} yrs · {c.id}</div></div></div></td>
                        <td className="td"><ScoreCell value={c.resume_score} /></td>
                        <td className="td"><ConfidenceMeter value={c.resume_confidence} cutoff={jd.confidence_cutoff} /></td>
                        <td className="td"><ScoreCell value={c.combined_score} /></td>
                        <td className="td"><BandBadge band={c.band} /></td>
                        <td className="td"><div className="flex items-center gap-1.5"><StatusBadge status={c.status} />{c.flags?.length > 0 && <Badge tone="amber">{c.flags.length} flag{c.flags.length > 1 ? 's' : ''}</Badge>}</div></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <ResumeEvidenceList candidates={candidates} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Scoring configuration" subtitle="Editable per job" action={<button onClick={() => setEditing(true)} className="text-xs font-semibold text-brand-600">Edit</button>} />
            <Config jd={jd} />
            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">Last screened: {jd.last_screened_at ? fmtDateTime(jd.last_screened_at) : 'never'}</div>
          </Card>
          <Card>
            <CardHeader title="Skills" />
            <div className="space-y-4 p-5">
              <div><div className="label">Must-have</div><SkillChips items={jd.must_have} tone="brand" /></div>
              <div><div className="label">Nice-to-have</div><SkillChips items={jd.nice_to_have} /></div>
            </div>
          </Card>
          <Card>
            <CardHeader title="Screening questions" subtitle={`${questions.length} rubric-backed questions`} icon={ListChecks} />
            <Questions questions={questions} />
          </Card>
        </div>
      </div>

      <JDForm open={editing} onClose={() => setEditing(false)} jd={jd} onSaved={() => reload(true)} />
      <ConfirmDialog open={confirmRescreen} onClose={() => setConfirmRescreen(false)} onConfirm={() => runScreening(true)}
        title="Re-screen resumes?" confirmLabel="Re-screen" loading={screening}
        message="Resumes of candidates who have not started the Q&A will be scored again with the current JD configuration. Promotions and archives are re-evaluated; every change is audited." />
    </div>
  )
}

function ResumeEvidenceList({ candidates }) {
  const scored = candidates.filter((c) => c.resume_analysis)
  if (!scored.length) return null
  return (
    <Card>
      <CardHeader title="Resume screening evidence" subtitle="AI resume_match output per candidate" icon={Brain} />
      <div className="divide-y divide-slate-100">
        {[...scored].sort((a, b) => b.resume_score - a.resume_score).map((c) => {
          const ra = c.resume_analysis
          return (
            <div key={c.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link to={`/admin/candidates/${c.id}`} className="text-sm font-semibold text-slate-900 hover:text-brand-700">{c.name}</Link>
                <div className="flex items-center gap-3"><span className="text-xs text-slate-500">ATS</span><ScoreCell value={c.resume_score} /><StatusBadge status={c.status} /></div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div><div className="label">Matched skills</div><SkillChips items={ra.matched_skills} tone="green" /></div>
                <div><div className="label">Gaps</div><SkillChips items={ra.gaps} tone="red" empty="No gaps" /></div>
                <p className="text-sm text-slate-600 md:col-span-2">{ra.summary}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
