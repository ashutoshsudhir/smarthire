import { Link, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, ArrowRight, Briefcase, CalendarClock, CheckCircle2, Clock, Filter, PauseCircle, UserX, Users, XCircle,
} from 'lucide-react'
import {
  Avatar, BandBadge, Card, CardHeader, EmptyState, ErrorState, PageHeader, ProgressBar, ScoreCell, Skeleton, StatCard,
  StatusBadge,
} from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { humanEvent, timeAgo } from '../../lib/format'

const STAGE_COLORS = ['bg-slate-400', 'bg-sky-500', 'bg-blue-500', 'bg-brand-500', 'bg-violet-500', 'bg-emerald-500']

function Funnel({ funnel }) {
  const max = Math.max(...funnel.map((f) => f.count), 1)
  return (
    <div className="space-y-3">
      {funnel.map((f, i) => (
        <div key={f.stage} className="flex items-center gap-3">
          <div className="w-32 shrink-0 text-xs font-medium text-slate-600 sm:w-36">{f.stage}</div>
          <div className="h-7 flex-1 overflow-hidden rounded-lg bg-slate-100">
            <div className={`h-full rounded-lg ${STAGE_COLORS[i]} transition-all duration-700`} style={{ width: `${Math.max((f.count / max) * 100, f.count ? 6 : 0)}%` }} />
          </div>
          <div className="w-10 text-right text-sm font-bold text-slate-800 tabular-nums">{f.count}</div>
        </div>
      ))}
    </div>
  )
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const stats = useApi('/dashboard/stats')
  const cands = useApi('/candidates', { params: { sort: 'combined_score', order: 'desc', limit: 200 } })
  const audit = useApi('/audit-logs', { params: { limit: 8 } })
  const jds = useApi('/jds')

  if (stats.error) return <ErrorState message={stats.error} onRetry={stats.reload} />
  const s = stats.data
  const rows = cands.data?.items || []
  const flagged = rows.filter((r) => r.flags?.length)
  const top = rows.filter((r) => r.combined_score != null).slice(0, 5)

  return (
    <div className="animate-fade-in">
      <PageHeader title="Hiring dashboard" subtitle="Live view of every candidate across the SmartHire pipeline." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {!s ? [...Array(8)].map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />) : <>
          <StatCard label="Total candidates" value={s.total_candidates} icon={Users} onClick={() => navigate('/admin/candidates')}
            hint={`${s.pending_resume_screening} awaiting resume screening`} />
          <StatCard label="Screening" value={s.screening} icon={Clock} tone="blue" onClick={() => navigate('/admin/candidates?status=SCREENING')} hint="Invited to Q&A" />
          <StatCard label="Interviews" value={s.interviews_scheduled} icon={CalendarClock} tone="violet" onClick={() => navigate('/admin/interviews')} hint={`${s.upcoming_interviews} scheduled`} />
          <StatCard label="Accepted" value={s.accepted} icon={CheckCircle2} tone="green" onClick={() => navigate('/admin/candidates?status=ACCEPTED,HIRED')} hint={`${s.hired} hired`} />
          <StatCard label="Filtered" value={s.filtered} icon={Filter} tone="slate" onClick={() => navigate('/admin/candidates?status=FILTERED')} hint="Below resume threshold" />
          <StatCard label="On hold" value={s.hold} icon={PauseCircle} tone="amber" onClick={() => navigate('/admin/candidates?status=HOLD,ON_HOLD')} />
          <StatCard label="Rejected" value={s.rejected} icon={XCircle} tone="red" onClick={() => navigate('/admin/candidates?status=REJECTED')} />
          <StatCard label="No-show" value={s.no_show} icon={UserX} tone="orange" onClick={() => navigate('/admin/candidates?status=NO_SHOW')} />
        </>}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Hiring pipeline" subtitle="Candidates that reached each stage" />
          <div className="p-5">
            {s ? <Funnel funnel={s.funnel} /> : <Skeleton className="h-56" />}
            {s && (
              <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4 text-xs text-slate-500">
                {s.funnel.map((f, i) => (
                  <span key={f.stage} className="flex items-center gap-1.5">
                    {i > 0 && <ArrowRight className="h-3 w-3 text-slate-300" />}
                    <span className="font-medium text-slate-600">{f.stage}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Needs human review" subtitle="Low confidence, score disagreement or anti-cheat signals" icon={AlertTriangle} />
          <div className="divide-y divide-slate-100">
            {cands.loading ? <div className="p-5"><Skeleton className="h-40" /></div>
              : flagged.length === 0 ? <EmptyState title="Nothing flagged" description="Flags appear after resume screening and Q&A." />
              : flagged.slice(0, 6).map((c) => (
                <Link key={c.id} to={`/admin/candidates/${c.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50">
                  <Avatar name={c.name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800">{c.name}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="mt-0.5 truncate text-xs text-amber-700">{c.flags.map((f) => f.code.replace(/_/g, ' ').toLowerCase()).join(' · ')}</div>
                  </div>
                </Link>
              ))}
          </div>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2 overflow-hidden">
          <CardHeader title="Top ranked candidates" subtitle="By combined score (resume + Q&A)"
            action={<Link to="/admin/candidates" className="text-xs font-semibold text-brand-600 hover:text-brand-700">View all →</Link>} />
          {top.length === 0 ? <EmptyState title="No combined scores yet" description="Run resume screening on a job, then candidates complete the Q&A round." action={<Link to="/admin/jobs" className="text-sm font-semibold text-brand-600">Go to jobs →</Link>} /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/70"><tr><th className="th">Candidate</th><th className="th">Job</th><th className="th">Combined</th><th className="th">Band</th><th className="th">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {top.map((c) => (
                    <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/candidates/${c.id}`)}>
                      <td className="td"><div className="flex items-center gap-2.5"><Avatar name={c.name} size="sm" /><span className="font-medium text-slate-900">{c.name}</span></div></td>
                      <td className="td">{c.jd_title}</td>
                      <td className="td"><ScoreCell value={c.combined_score} /></td>
                      <td className="td"><BandBadge band={c.band} /></td>
                      <td className="td"><StatusBadge status={c.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Recent activity" action={<Link to="/admin/audit" className="text-xs font-semibold text-brand-600 hover:text-brand-700">Audit log →</Link>} />
          <ul className="divide-y divide-slate-100">
            {(audit.data?.items || []).map((a) => (
              <li key={a.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-slate-800">{humanEvent(a.event_type)}</span>
                  <span className="text-xs text-slate-400">{timeAgo(a.created_at)}</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-500">{a.actor} · {a.candidate_id || a.jd_id || '—'}</div>
              </li>
            ))}
            {audit.data?.items?.length === 0 && <EmptyState title="No activity yet" />}
          </ul>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader title="Open roles" icon={Briefcase} action={<Link to="/admin/jobs" className="text-xs font-semibold text-brand-600 hover:text-brand-700">Manage jobs →</Link>} />
        <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-3">
          {(jds.data || []).map((j) => {
            const screened = j.candidate_count - j.pending_count
            return (
              <Link key={j.id} to={`/admin/jobs/${j.id}`} className="rounded-lg border border-slate-200 p-4 transition hover:border-brand-300 hover:shadow-sm">
                <div className="text-sm font-semibold text-slate-900">{j.title}</div>
                <div className="mt-0.5 text-xs text-slate-500">{j.location} · threshold {j.pass_threshold}</div>
                <ProgressBar value={screened} max={j.candidate_count || 1} className="mt-3" />
                <div className="mt-1.5 text-xs text-slate-500">{screened}/{j.candidate_count} resumes screened · {j.screening_count} in screening</div>
              </Link>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
