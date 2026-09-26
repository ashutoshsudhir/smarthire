import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Brain, Database, PlayCircle, Server, SlidersHorizontal } from 'lucide-react'
import { Badge, Button, Card, CardHeader, ErrorState, PageHeader, Skeleton } from '../../components/ui'
import { API_URL, api, errorMessage } from '../../lib/api'
import { useApi } from '../../lib/useApi'

export default function SettingsPage() {
  const health = useApi('/health/ready')
  const jds = useApi('/jds')
  const [running, setRunning] = useState(false)

  async function runBatch() {
    setRunning(true)
    try {
      const r = await api.post('/screening/run-batch')
      const n = r.data.jobs.reduce((a, j) => a + j.screened, 0)
      toast.success(n ? `Batch screened ${n} resume(s) across ${r.data.jobs.length} jobs` : 'No unscreened resumes found')
      jds.reload(true)
    } catch (e) { toast.error(errorMessage(e)) } finally { setRunning(false) }
  }

  return (
    <div className="animate-fade-in">
      <PageHeader title="Settings" subtitle="System configuration, AI provider and per-job scoring rules." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="System status" icon={Server} />
          {health.error ? <div className="p-5"><ErrorState message={health.error} onRetry={health.reload} /></div> : !health.data ? <div className="p-5"><Skeleton className="h-24" /></div> : (
            <dl className="divide-y divide-slate-100 px-5 text-sm">
              <div className="flex justify-between py-2.5"><dt className="text-slate-500">API</dt><dd className="font-mono text-xs">{API_URL}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="text-slate-500">Status</dt><dd><Badge tone={health.data.status === 'ok' ? 'green' : 'red'} dot>{health.data.status}</Badge></dd></div>
              <div className="flex justify-between py-2.5"><dt className="flex items-center gap-1.5 text-slate-500"><Database className="h-4 w-4" />Database</dt><dd className="font-medium">{health.data.database_engine} · {health.data.database}</dd></div>
              <div className="flex justify-between py-2.5"><dt className="flex items-center gap-1.5 text-slate-500"><Brain className="h-4 w-4" />LLM provider</dt><dd className="font-medium">{health.data.llm_provider} · {health.data.llm_model}</dd></div>
            </dl>
          )}
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Provider is set with <code>LLM_PROVIDER</code> / <code>LLM_API_KEY</code> on the backend. Two structured prompts only: <code>resume_match</code> and <code>answer_score</code>, validated with a single retry.
          </div>
        </Card>
        <Card>
          <CardHeader title="Batch resume screening" icon={PlayCircle} subtitle="Scores every unscreened resume across all active jobs" />
          <div className="space-y-3 p-5 text-sm text-slate-600">
            <p>The same job can be triggered on a schedule by calling <code>POST /screening/run-batch</code> with the <code>X-Admin-Token</code> header.</p>
            <Button icon={PlayCircle} loading={running} onClick={runBatch}>Run batch now</Button>
          </div>
        </Card>
        <Card className="lg:col-span-2 overflow-hidden">
          <CardHeader title="Scoring rules per job" icon={SlidersHorizontal} subtitle="combined = resume × resume weight + normalized Q&A × Q&A weight" />
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/70"><tr><th className="th">Job</th><th className="th">Weights (resume / Q&A)</th><th className="th">PASS ≥</th><th className="th">HOLD</th><th className="th">REJECT &lt;</th><th className="th">Confidence cutoff</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(jds.data || []).map((j) => (
                  <tr key={j.id}>
                    <td className="td font-medium text-slate-900">{j.title}</td>
                    <td className="td">{Math.round(j.resume_weight * 100)}% / {Math.round(j.qa_weight * 100)}%</td>
                    <td className="td">{j.pass_threshold}</td>
                    <td className="td">{j.pass_threshold - j.hold_margin} – {j.pass_threshold}</td>
                    <td className="td">{j.pass_threshold - j.hold_margin}</td>
                    <td className="td">{j.confidence_cutoff}</td>
                    <td className="td text-right"><Link to={`/admin/jobs/${j.id}`} className="text-xs font-semibold text-brand-600">Edit →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">A combined score at or above the threshold with average AI confidence below the cutoff becomes HOLD for human review.</div>
        </Card>
      </div>
    </div>
  )
}
