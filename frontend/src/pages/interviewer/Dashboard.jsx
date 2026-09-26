import { Link } from 'react-router-dom'
import { CalendarClock, CheckCircle2, ClipboardList, Users } from 'lucide-react'
import { Avatar, BandBadge, Card, CardHeader, EmptyState, ErrorState, PageHeader, ScoreCell, Skeleton, StatCard, StatusBadge } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

export default function InterviewerDashboard() {
  const { data, error, loading, reload } = useApi('/interviewer/candidates')
  if (error) return <ErrorState message={error} onRetry={reload} />
  const rows = data || []
  const pending = rows.filter((r) => !r.interview_decision)
  const schedule = [...pending].sort((a, b) => new Date(a.interview_date || 0) - new Date(b.interview_date || 0))

  return (
    <div className="animate-fade-in">
      <PageHeader title="My interviews" subtitle="Only candidates assigned to you by the hiring manager are shown." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Assigned" value={loading ? '…' : rows.length} icon={Users} />
        <StatCard label="Awaiting decision" value={loading ? '…' : pending.length} icon={ClipboardList} tone="amber" />
        <StatCard label="Decided" value={loading ? '…' : rows.length - pending.length} icon={CheckCircle2} tone="green" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="overflow-hidden xl:col-span-2">
          <CardHeader title="Assigned candidates" icon={Users} />
          {loading ? <div className="p-5"><Skeleton className="h-40" /></div> : rows.length === 0 ? (
            <EmptyState icon={Users} title="No candidates assigned yet" description="The hiring manager will assign candidates to you after screening." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/70"><tr><th className="th">Candidate</th><th className="th">Job</th><th className="th">Interview</th><th className="th">Combined</th><th className="th">Status</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="td"><div className="flex items-center gap-2.5"><Avatar name={c.name} size="sm" /><span className="font-medium text-slate-900">{c.name}</span></div></td>
                      <td className="td">{c.jd_title}</td>
                      <td className="td">{fmtDateTime(c.interview_date)}</td>
                      <td className="td"><div className="flex items-center gap-2"><ScoreCell value={c.combined_score} /><BandBadge band={c.band} /></div></td>
                      <td className="td"><StatusBadge status={c.status} /></td>
                      <td className="td text-right"><Link to={`/interviewer/candidates/${c.id}`} className="rounded-md px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">Review →</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card>
          <CardHeader title="Interview schedule" icon={CalendarClock} />
          {schedule.length === 0 ? <EmptyState title="No upcoming interviews" /> : (
            <ul className="divide-y divide-slate-100">
              {schedule.map((c) => {
                const d = c.interview_date ? new Date(c.interview_date) : null
                return (
                  <li key={c.id}>
                    <Link to={`/interviewer/candidates/${c.id}`} className="flex items-center gap-4 px-5 py-3 hover:bg-slate-50">
                      <div className="w-12 shrink-0 rounded-lg bg-brand-50 py-1.5 text-center">
                        <div className="text-[10px] font-semibold text-brand-600 uppercase">{d ? d.toLocaleString(undefined, { month: 'short' }) : '—'}</div>
                        <div className="text-lg leading-none font-bold text-brand-800">{d ? d.getDate() : '?'}</div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{c.name}</div>
                        <div className="text-xs text-slate-500">{d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : 'Time TBD'} · {c.jd_title}</div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
