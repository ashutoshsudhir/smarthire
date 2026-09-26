import { useState } from 'react'
import { AlertTriangle, Brain, ChevronDown, ClipboardPaste, Copy, EyeOff, FileText, Timer } from 'lucide-react'
import { Badge, Button, Card, CardHeader, ConfidenceMeter, EmptyState, ScoreRing, SkillChips, cn } from './ui'
import { fmtDateTime } from '../lib/format'

export function FlagList({ flags }) {
  if (!flags?.length) return null
  return (
    <div className="space-y-2">
      {flags.map((f) => (
        <div key={f.code} className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-sm"><span className="font-semibold text-amber-900">{f.code.replace(/_/g, ' ')}</span><span className="text-amber-800"> · {f.message}</span></div>
        </div>
      ))}
      <p className="text-xs text-slate-500">Flags request human review. They never auto-reject a candidate.</p>
    </div>
  )
}

export function ScoreSummary({ c }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-4">
      <ScoreRing value={c.resume_score} label="Resume (ATS)" />
      <ScoreRing value={c.qa_score} label="Q&A" />
      <ScoreRing value={c.combined_score} label="Combined" sub={c.band || ''} />
    </div>
  )
}

export function ResumeAnalysis({ c }) {
  const ra = c.resume_analysis
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader title="Resume match (AI resume_match)" icon={Brain}
          subtitle={ra ? `Scored ${fmtDateTime(ra.created_at)} · ${ra.scored_by}` : 'Not scored yet'} />
        {!ra ? <EmptyState title="Resume not screened yet" description="Run resume screening from the job page." /> : (
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-6">
              <ScoreRing value={ra.score} label="ATS score" />
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2"><span className="w-28 text-slate-500">Threshold</span><span className="font-semibold">{ra.threshold_used}</span>
                  <Badge tone={ra.passed ? 'green' : 'red'}>{ra.passed ? 'Above threshold' : 'Below threshold'}</Badge></div>
                <div className="flex items-center gap-2"><span className="w-28 text-slate-500">Confidence</span><ConfidenceMeter value={ra.confidence} cutoff={c.jd.confidence_cutoff} /></div>
              </div>
            </div>
            <div><div className="label">Summary</div><p className="text-sm leading-relaxed text-slate-700">{ra.summary}</p></div>
            <div><div className="label">Matched skills ({ra.matched_skills.length})</div><SkillChips items={ra.matched_skills} tone="green" /></div>
            <div><div className="label">Skill gaps ({ra.gaps.length})</div><SkillChips items={ra.gaps} tone="red" empty="No gaps found" /></div>
          </div>
        )}
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader title="Resume" icon={FileText} subtitle={`${c.experience_years} yrs · ${c.education}`} />
        <p className="whitespace-pre-line p-5 text-sm leading-relaxed text-slate-700">{c.resume_text}</p>
      </Card>
    </div>
  )
}

function AnswerCard({ a, i, onRescore, rescoring }) {
  const [open, setOpen] = useState(i === 0)
  const t = a.telemetry
  const flagged = t.tab_switches > 0 || t.paste_count > 0 || t.copy_count > 0
  return (
    <Card>
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-4 px-5 py-4 text-left">
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">{i + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-900">{a.question}</div>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Timer className="h-3.5 w-3.5" />{a.time_taken_sec}s / {a.time_limit_sec}s</span>
            {a.auto_submitted && <Badge tone="orange">Auto-submitted</Badge>}
            {flagged && <Badge tone="amber">Anti-cheat signals</Badge>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {a.score != null ? <div className="text-right"><div className="text-lg font-bold text-slate-900">{a.score}<span className="text-sm font-medium text-slate-400">/5</span></div></div>
            : <Badge tone={a.score_status === 'FAILED' ? 'red' : 'slate'}>{a.score_status}</Badge>}
          <ChevronDown className={cn('h-4 w-4 text-slate-400 transition', open && 'rotate-180')} />
        </div>
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 px-5 py-4">
          <div><div className="label">Candidate answer</div><p className="whitespace-pre-line rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{a.answer_text || <em className="text-slate-400">No answer</em>}</p></div>
          {a.score != null ? (
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2"><div className="label">AI justification</div><p className="text-sm text-slate-700">{a.justification}</p></div>
              <div><div className="label">Confidence</div><ConfidenceMeter value={a.confidence} /></div>
              <div className="md:col-span-3"><div className="label">Rubric hits</div><SkillChips items={a.rubric_hits} tone="green" empty="No rubric criteria met" /></div>
            </div>
          ) : (
            <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <span>Scoring failed: {a.score_error || 'unknown error'}</span>
              {onRescore && <Button size="sm" variant="secondary" loading={rescoring === a.id} onClick={() => onRescore(a.id)}>Retry scoring</Button>}
            </div>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" />Tab switches: <b className="text-slate-700">{t.tab_switches}</b></span>
            <span className="inline-flex items-center gap-1"><ClipboardPaste className="h-3.5 w-3.5" />Paste: <b className="text-slate-700">{t.paste_count}</b></span>
            <span className="inline-flex items-center gap-1"><Copy className="h-3.5 w-3.5" />Copy question: <b className="text-slate-700">{t.copy_count}</b></span>
            {a.scored_by && <span>Scored by {a.scored_by}</span>}
          </div>
        </div>
      )}
    </Card>
  )
}

export function QAPerformance({ c, onRescore, rescoring }) {
  if (!c.answers?.length) {
    return <Card><EmptyState title="No Q&A answers yet" description={c.status === 'SCREENING' ? 'The candidate has been invited and has not completed the screening yet.' : 'Only candidates above the resume threshold take the Q&A.'} /></Card>
  }
  const at = c.attempt
  return (
    <div className="space-y-4">
      <Card className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
        <div><div className="text-xs text-slate-500">Q&A total</div><div className="text-xl font-bold text-slate-900">{at.qa_total ?? '—'}<span className="text-sm text-slate-400">/{at.qa_max ?? at.questions_total * 5}</span></div></div>
        <div><div className="text-xs text-slate-500">Normalized</div><div className="text-xl font-bold text-slate-900">{at.qa_normalized ?? '—'}</div></div>
        <div><div className="text-xs text-slate-500">Avg confidence</div><div className="mt-1"><ConfidenceMeter value={at.avg_confidence} cutoff={c.jd.confidence_cutoff} /></div></div>
        <div><div className="text-xs text-slate-500">Status</div><div className="text-sm font-semibold text-slate-900">{at.status === 'COMPLETED' ? `Completed ${fmtDateTime(at.completed_at)}` : `In progress (${at.answered}/${at.questions_total})`}</div></div>
      </Card>
      {c.answers.map((a, i) => <AnswerCard key={a.id} a={a} i={i} onRescore={onRescore} rescoring={rescoring} />)}
    </div>
  )
}

export function AntiCheat({ telemetry }) {
  const items = [
    { label: 'Tab switches', value: telemetry.tab_switches, icon: EyeOff },
    { label: 'Paste events', value: telemetry.paste_count, icon: ClipboardPaste },
    { label: 'Copy-question events', value: telemetry.copy_count, icon: Copy },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map((it) => (
        <div key={it.label} className={cn('rounded-lg border p-3', it.value > 0 ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50')}>
          <it.icon className={cn('h-4 w-4', it.value > 0 ? 'text-amber-600' : 'text-slate-400')} />
          <div className="mt-2 text-xl font-bold text-slate-900">{it.value}</div>
          <div className="text-xs text-slate-500">{it.label}</div>
        </div>
      ))}
    </div>
  )
}
