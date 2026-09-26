import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, ArrowRight, Loader2, Send, ShieldCheck, Timer } from 'lucide-react'
import { ResultCard } from './Dashboard'
import { Button, Card, ConfirmDialog, ErrorState, PageLoader, ProgressBar, cn } from '../../components/ui'
import { useAuth } from '../../context/AuthContext'
import { api, errorMessage } from '../../lib/api'

const emptyTelemetry = () => ({ tab_switches: 0, paste_count: 0, copy_count: 0 })

export default function Screening() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const candId = user.candidate_id
  const [q, setQ] = useState(null)
  const [error, setError] = useState('')
  const [answer, setAnswer] = useState('')
  const [remaining, setRemaining] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [confirm, setConfirm] = useState(false)
  const telemetry = useRef(emptyTelemetry())
  const submittingRef = useRef(false)
  const answerRef = useRef('')
  answerRef.current = answer

  // Start (or resume) the attempt; server returns only the current question.
  useEffect(() => {
    let cancelled = false
    api.post(`/candidates/${candId}/screening/start`)
      .then((r) => {
        if (cancelled) return
        if (r.data.completed) navigate('/candidate/dashboard', { replace: true })
        else { setQ(r.data); setRemaining(r.data.remaining_sec) }
      })
      .catch((e) => !cancelled && setError(errorMessage(e)))
    return () => { cancelled = true }
  }, [candId, navigate])

  // Anti-cheat telemetry (admin-only signal, never auto-rejects)
  useEffect(() => {
    const onVis = () => { if (document.visibilityState === 'hidden') telemetry.current.tab_switches += 1 }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  // Warn on accidental navigation away mid-screening
  useEffect(() => {
    if (!q || result) return
    const h = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [q, result])

  const submit = useCallback(async (auto = false) => {
    if (!q || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setConfirm(false)
    try {
      const r = await api.post(`/candidates/${candId}/answers`, {
        question_id: q.question.id,
        answer_text: answerRef.current,
        auto_submitted: auto,
        telemetry: telemetry.current,
      })
      telemetry.current = emptyTelemetry()
      setAnswer('')
      if (auto) toast.warning('Time is up. Your answer was submitted automatically.')
      if (r.data.completed) {
        setResult(r.data.result)
        setQ(null)
        toast.success('Screening submitted. Thank you!')
      } else {
        setQ(r.data.next)
        setRemaining(r.data.next.remaining_sec)
      }
    } catch (e) {
      toast.error(errorMessage(e))
      if (e.response?.status === 409) {
        // Out of sync (e.g. answered in another tab) - resync with server state.
        const r = await api.get(`/candidates/${candId}/questions`).catch(() => null)
        if (r?.data?.completed) navigate('/candidate/dashboard')
        else if (r?.data) { setQ(r.data); setRemaining(r.data.remaining_sec) }
      }
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }, [q, candId, navigate])

  // Countdown; auto-submit at zero.
  useEffect(() => {
    if (remaining == null || !q || result) return
    if (remaining <= 0) { submit(true); return }
    const t = setTimeout(() => setRemaining((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, q, result, submit])

  if (error) return <div className="mx-auto max-w-2xl"><ErrorState message={error} /><div className="mt-4 text-center"><Link to="/candidate/dashboard" className="text-sm font-semibold text-brand-600">← Back to my application</Link></div></div>

  if (result) {
    return (
      <div className="mx-auto max-w-3xl animate-fade-in">
        <h1 className="mb-1 text-2xl font-bold text-slate-900">Screening complete</h1>
        <p className="mb-6 text-sm text-slate-500">Here is your aggregate result. The hiring team will review it and contact you about next steps.</p>
        <ResultCard result={result} />
        <div className="mt-6 text-center"><Link to="/candidate/dashboard"><Button variant="secondary" icon={ArrowLeft}>Back to my application</Button></Link></div>
      </div>
    )
  }
  if (!q) return <PageLoader label="Preparing your screening…" />

  const pct = (remaining / q.time_limit_sec) * 100
  const mm = String(Math.floor(Math.max(remaining, 0) / 60)).padStart(2, '0')
  const ss = String(Math.max(remaining, 0) % 60).padStart(2, '0')
  const isLast = q.index === q.total
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0

  return (
    <div className="mx-auto max-w-3xl animate-fade-in">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/candidate/dashboard" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700"><ArrowLeft className="h-3 w-3" />My application</Link>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck className="h-4 w-4 text-emerald-600" />Answers are saved as you submit each question</span>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 p-5">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold text-slate-900">Question {q.index} / {q.total}</div>
            <div className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-sm font-bold tabular-nums',
              remaining <= 15 ? 'animate-pulse bg-red-50 text-red-700' : remaining <= 45 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-700')}
              role="timer" aria-live="off">
              <Timer className="h-4 w-4" />{mm}:{ss}
            </div>
          </div>
          <ProgressBar value={q.index - 1} max={q.total} className="mt-3" />
          <div className="mt-1.5 flex justify-between text-[11px] text-slate-400"><span>{q.index - 1} answered</span><span>{q.total - q.index + 1} remaining</span></div>
        </div>

        <div className="p-5 sm:p-6">
          <p className="select-text text-lg font-medium leading-relaxed text-slate-900"
            onCopy={() => { telemetry.current.copy_count += 1 }}>{q.question.text}</p>
          <textarea
            className="input mt-5 min-h-56 resize-y text-[15px] leading-relaxed"
            placeholder="Type your answer here…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onPaste={() => { telemetry.current.paste_count += 1 }}
            disabled={submitting}
            autoFocus
            maxLength={10000}
            aria-label="Your answer"
          />
          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
            <span>{words} words</span>
            <div className="h-1 w-32 overflow-hidden rounded-full bg-slate-100"><div className={cn('h-full transition-all', pct > 30 ? 'bg-brand-500' : 'bg-red-500')} style={{ width: `${pct}%` }} /></div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <p className="hidden text-xs text-slate-500 sm:block">You cannot go back to previous questions.</p>
          {submitting ? (
            <div className="ml-auto inline-flex items-center gap-2 text-sm font-medium text-brand-700"><Loader2 className="h-4 w-4 animate-spin" />Submitting & scoring…</div>
          ) : (
            <Button className="ml-auto" size="lg" icon={isLast ? Send : ArrowRight}
              onClick={() => (isLast ? setConfirm(true) : submit(false))}>{isLast ? 'Submit screening' : 'Next question'}</Button>
          )}
        </div>
      </Card>

      <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => submit(false)} loading={submitting}
        title="Submit your screening?" confirmLabel="Submit"
        message="This submits your final answer and completes the screening. You will see your aggregate result right away." />
    </div>
  )
}
