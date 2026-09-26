import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Award, Briefcase, CalendarClock, CheckCircle2, Clock, GitCommitHorizontal, MapPin, PlayCircle, UserRound } from 'lucide-react'
import StageTracker from '../../components/StageTracker'
import { Badge, BandBadge, Button, Card, CardHeader, EmptyState, ErrorState, PageHeader, PageLoader, ProgressBar, ScoreRing, StatusBadge } from '../../components/ui'
import { fmtDate, fmtDateTime } from '../../lib/format'
import { useApi } from '../../lib/useApi'

const BAND_COPY = {
  PASS: { title: 'You passed the screening', tone: 'text-emerald-700', bg: 'from-emerald-50' },
  HOLD: { title: 'Your screening is on hold for review', tone: 'text-amber-700', bg: 'from-amber-50' },
  REJECT: { title: 'Screening complete', tone: 'text-slate-700', bg: 'from-slate-50' },
}

export function ResultCard({ result }) {
  if (!result?.available) {
    return (
      <Card className="p-6">
        <div className="flex items-center gap-3 text-sm text-slate-600"><Clock className="h-5 w-5 text-brand-600" />{result?.pending_reason || 'Your answers are being evaluated. Check back shortly.'}</div>
      </Card>
    )
  }
  const copy = BAND_COPY[result.band]
  return (
    <Card className="overflow-hidden">
      <div className={`bg-gradient-to-br ${copy.bg} to-white p-6`}>
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <ScoreRing value={result.aggregate_score} size={116} sub="of 100" />
          <div className="text-center sm:text-left">
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Screening result</div>
            <div className={`mt-1 text-xl font-bold ${copy.tone}`}>{copy.title}</div>
            <div className="mt-2 flex items-center justify-center gap-2 sm:justify-start"><span className="text-sm text-slate-600">Band</span><BandBadge band={result.band} /></div>
          </div>
        </div>
      </div>
      <div className="grid gap-6 border-t border-slate-100 p-6 md:grid-cols-2">
        <div>
          <div className="label">Category breakdown</div>
          <div className="space-y-3">
            {result.categories.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span className="text-slate-600">{c.name}</span>
                {c.level ? <Badge tone="brand">{c.level}</Badge> : <span className="font-semibold text-slate-900">{c.score ?? '—'} / {c.max}</span>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="label">Per-question scores</div>
          <div className="space-y-2.5">
            {result.breakdown.map((q) => (
              <div key={q.label}>
                <div className="flex justify-between text-xs"><span className="truncate pr-3 text-slate-600" title={q.topic}>{q.label}</span><span className="font-semibold text-slate-800">{q.score ?? '—'}/{q.max}</span></div>
                <ProgressBar value={q.score || 0} max={q.max} className="mt-1" height="h-1.5" tone={q.score >= 4 ? 'green' : q.score >= 3 ? 'amber' : 'red'} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function CandidateDashboard() {
  const app = useApi('/me/application')
  const a = app.data
  const result = useApi(a ? `/candidates/${a.candidate_id}/result` : null, { enabled: Boolean(a?.screening_completed) })

  useEffect(() => {
    if (a?.can_start_screening && !a.screening_in_progress) {
      const key = `smarthire.invite.${a.candidate_id}`
      try {
        if (!sessionStorage.getItem(key)) {
          toast.info('You have been invited to the online screening round.', { description: 'Start whenever you are ready.' })
          sessionStorage.setItem(key, '1')
        }
      } catch { /* ignore */ }
    }
  }, [a])

  if (app.error) return <ErrorState message={app.error} onRetry={app.reload} />
  if (app.loading || !a) return <PageLoader />
  const stopped = ['FILTERED', 'REJECTED'].includes(a.status)

  return (
    <div className="animate-fade-in">
      <PageHeader title={`Hi ${a.name}`} subtitle="Track your application in real time." />
      <Card className="p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-xl bg-brand-50 p-3 text-brand-600"><Briefcase className="h-6 w-6" /></div>
            <div>
              <div className="text-lg font-semibold text-slate-900">{a.job.title}</div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{a.job.location}</span>
                <span>Applied {fmtDate(a.applied_at)}</span>
              </div>
            </div>
          </div>
          <div className="text-left sm:text-right"><div className="label">Current status</div><StatusBadge status={a.status} label={a.status_label} /></div>
        </div>
        <div className="mt-8"><StageTracker stage={a.stage} stopped={stopped} /></div>
        {a.next_step_message && <div className="mt-6 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">{a.next_step_message}</div>}
      </Card>

      {a.can_start_screening && (
        <Card className="mt-6 overflow-hidden border-brand-200">
          <div className="flex flex-col gap-4 bg-gradient-to-r from-brand-600 to-violet-600 p-6 text-white sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-lg font-semibold">{a.screening_in_progress ? 'Continue your screening' : 'You are invited to the screening round'}</div>
              <p className="mt-1 max-w-xl text-sm text-brand-100">Answer short technical questions one at a time. Each question has a timer and is submitted automatically when time runs out. Please stay on this tab and answer in your own words.</p>
            </div>
            <Link to="/candidate/screening"><Button variant="secondary" size="lg" icon={PlayCircle} className="bg-white text-brand-700 ring-0 hover:bg-brand-50">{a.screening_in_progress ? 'Resume screening' : 'Start screening'}</Button></Link>
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {a.screening_completed ? (result.loading ? <PageLoader label="Loading your result…" /> : <ResultCard result={result.data} />) : (
            <Card><EmptyState icon={Award} title="No screening result yet" description={a.status === 'FILTERED' ? 'Your profile was not shortlisted for the screening round.' : 'Your result will appear here after you complete the screening Q&A.'} /></Card>
          )}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Interview" icon={CalendarClock} />
            {a.interview ? (
              <div className="space-y-3 p-5 text-sm">
                <div className="flex items-center gap-2 text-slate-900"><CalendarClock className="h-4 w-4 text-brand-600" /><span className="font-semibold">{fmtDateTime(a.interview.scheduled_at)}</span></div>
                <div className="flex items-center gap-2 text-slate-700"><UserRound className="h-4 w-4 text-brand-600" />{a.interview.interviewer.name}</div>
                <div className="text-xs text-slate-500">{a.interview.interviewer.email}</div>
              </div>
            ) : <EmptyState title="Not scheduled yet" description="You will see the date and interviewer here once scheduled." />}
          </Card>
          {a.next_steps.length > 0 && (
            <Card>
              <CardHeader title="Next steps" icon={CheckCircle2} />
              <ul className="space-y-2 p-5">
                {a.next_steps.map((s) => <li key={s} className="flex items-center gap-2 text-sm text-slate-700"><GitCommitHorizontal className="h-4 w-4 text-brand-500" />{s}</li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
