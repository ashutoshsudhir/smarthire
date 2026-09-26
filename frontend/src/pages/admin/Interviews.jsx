import { Link } from 'react-router-dom'
import { CalendarClock } from 'lucide-react'
import { Avatar, Card, EmptyState, ErrorState, PageHeader, Skeleton, StatusBadge } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

export default function Interviews() {
  const { data, error, loading, reload } = useApi('/interviews')
  const now = Date.now()
  const upcoming = (data || []).filter((i) => !i.decision && (!i.scheduled_at || new Date(i.scheduled_at).getTime() >= now - 3600_000))
  const other = (data || []).filter((i) => !upcoming.includes(i))
  const Section = ({ title, items }) => (
    <Card className="mb-6 overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4 text-sm font-semibold text-slate-900">{title} <span className="ml-1 text-slate-400">({items.length})</span></div>
      {items.length === 0 ? <EmptyState icon={CalendarClock} title="Nothing here" /> : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50/70"><tr><th className="th">Candidate</th><th className="th">Job</th><th className="th">Interviewer</th><th className="th">Date</th><th className="th">Candidate status</th><th className="th">Decision</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="td"><Link to={`/admin/candidates/${i.candidate.id}`} className="flex items-center gap-2.5 font-medium text-slate-900 hover:text-brand-700"><Avatar name={i.candidate.name} size="sm" />{i.candidate.name}</Link></td>
                  <td className="td">{i.candidate.jd_title}</td>
                  <td className="td">{i.interviewer.display_name}</td>
                  <td className="td">{fmtDateTime(i.scheduled_at)}</td>
                  <td className="td"><StatusBadge status={i.candidate.status} /></td>
                  <td className="td">{i.decision ? <StatusBadge status={i.decision} /> : <span className="text-slate-400">Pending</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
  return (
    <div className="animate-fade-in">
      <PageHeader title="Interviews" subtitle="Assignments and outcomes across all interviewers." />
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <Skeleton className="h-64 rounded-xl" /> : <>
        <Section title="Upcoming & pending decision" items={upcoming} />
        <Section title="Completed / past" items={other} />
      </>}
    </div>
  )
}
