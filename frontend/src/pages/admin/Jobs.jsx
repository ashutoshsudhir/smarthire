import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Briefcase, GraduationCap, MapPin, Plus, Target } from 'lucide-react'
import JDForm from '../../components/JDForm'
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { fmtDateTime } from '../../lib/format'

export default function Jobs() {
  const { data, error, loading, reload } = useApi('/jds')
  const [creating, setCreating] = useState(false)

  return (
    <div className="animate-fade-in">
      <PageHeader title="Jobs" subtitle="Select a job description to run AI resume screening and review its ranked shortlist."
        actions={<Button icon={Plus} onClick={() => setCreating(true)}>New job</Button>} />
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>
      ) : data.length === 0 ? (
        <Card><EmptyState icon={Briefcase} title="No jobs yet" description="Create your first job description." action={<Button icon={Plus} onClick={() => setCreating(true)}>New job</Button>} /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {data.map((j) => {
            const screened = j.candidate_count - j.pending_count
            return (
              <Link key={j.id} to={`/admin/jobs/${j.id}`} className="group">
                <Card className="flex h-full flex-col p-5 transition group-hover:-translate-y-0.5 group-hover:border-brand-300 group-hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><Briefcase className="h-5 w-5" /></div>
                    <div className="flex gap-1.5">
                      {j.pending_count > 0 && <Badge tone="amber" dot>{j.pending_count} to screen</Badge>}
                      {!j.is_active && <Badge>Inactive</Badge>}
                    </div>
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900 group-hover:text-brand-700">{j.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-500">{j.summary}</p>
                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{j.location}</span>
                    <span className="flex items-center gap-1"><GraduationCap className="h-3.5 w-3.5" />{j.experience_years}+ yrs</span>
                    <span className="flex items-center gap-1"><Target className="h-3.5 w-3.5" />Pass ≥ {j.pass_threshold}</span>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {j.must_have.slice(0, 4).map((s) => <Badge key={s} tone="brand">{s}</Badge>)}
                    {j.must_have.length > 4 && <Badge>+{j.must_have.length - 4}</Badge>}
                  </div>
                  <div className="mt-auto pt-5">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{screened}/{j.candidate_count} screened</span>
                      <span>Weights {Math.round(j.resume_weight * 100)}/{Math.round(j.qa_weight * 100)}</span>
                    </div>
                    <ProgressBar value={screened} max={j.candidate_count || 1} className="mt-1.5" />
                    <div className="mt-2 text-[11px] text-slate-400">Last screened: {j.last_screened_at ? fmtDateTime(j.last_screened_at) : 'never'}</div>
                  </div>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
      <JDForm open={creating} onClose={() => setCreating(false)} onSaved={reload} />
    </div>
  )
}
