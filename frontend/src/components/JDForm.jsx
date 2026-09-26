import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { Button, Field, Modal } from './ui'

const EMPTY = {
  title: '', summary: '', must_have: [], nice_to_have: [], experience_years: 2, education: '', location: '',
  resume_weight: 0.6, qa_weight: 0.4, pass_threshold: 70, hold_margin: 10, confidence_cutoff: 0.6,
  question_time_limit_sec: 180, is_active: true,
}

const toText = (arr) => (arr || []).join(', ')
const toList = (txt) => txt.split(/[,\n]/).map((s) => s.trim()).filter(Boolean)

export default function JDForm({ open, onClose, jd, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [must, setMust] = useState('')
  const [nice, setNice] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const base = jd ? { ...EMPTY, ...jd } : EMPTY
    setForm(base)
    setMust(toText(base.must_have))
    setNice(toText(base.nice_to_have))
    setError('')
  }, [open, jd])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'number' ? e.target.value : e.target.value }))
  const resumePct = Math.round(Number(form.resume_weight) * 100)

  async function save() {
    setError('')
    const body = {
      ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, form[k]])),
      must_have: toList(must),
      nice_to_have: toList(nice),
      experience_years: Number(form.experience_years),
      resume_weight: Number(form.resume_weight),
      qa_weight: Math.round((1 - Number(form.resume_weight)) * 100) / 100,
      pass_threshold: Number(form.pass_threshold),
      hold_margin: Number(form.hold_margin),
      confidence_cutoff: Number(form.confidence_cutoff),
      question_time_limit_sec: Number(form.question_time_limit_sec),
    }
    if (!body.title.trim()) return setError('Title is required.')
    if (!body.must_have.length) return setError('Add at least one must-have skill.')
    setSaving(true)
    try {
      const r = jd ? await api.put(`/jds/${jd.id}`, body) : await api.post('/jds', body)
      toast.success(jd ? 'Job description updated' : 'Job description created')
      onSaved?.(r.data)
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={jd ? `Edit ${jd.title}` : 'Create job description'}
      subtitle="Skills drive resume matching; weights and thresholds drive the PASS / HOLD / REJECT band."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>{jd ? 'Save changes' : 'Create job'}</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field label="Title"><input className="input" value={form.title} onChange={set('title')} placeholder="e.g. Frontend Developer" /></Field></div>
        <div className="sm:col-span-2"><Field label="Summary"><textarea className="input" rows={2} value={form.summary} onChange={set('summary')} /></Field></div>
        <div className="sm:col-span-2"><Field label="Must-have skills" hint="Comma separated"><textarea className="input" rows={2} value={must} onChange={(e) => setMust(e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field label="Nice-to-have skills" hint="Comma separated"><textarea className="input" rows={2} value={nice} onChange={(e) => setNice(e.target.value)} /></Field></div>
        <Field label="Experience (years)"><input type="number" min={0} className="input" value={form.experience_years} onChange={set('experience_years')} /></Field>
        <Field label="Location"><input className="input" value={form.location} onChange={set('location')} /></Field>
        <div className="sm:col-span-2"><Field label="Education"><input className="input" value={form.education} onChange={set('education')} /></Field></div>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="text-sm font-semibold text-slate-900">Scoring configuration</div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span>Resume weight <span className="text-brand-700">{resumePct}%</span></span>
            <span>Q&A weight <span className="text-brand-700">{100 - resumePct}%</span></span>
          </div>
          <input type="range" min={0} max={1} step={0.05} value={form.resume_weight} onChange={set('resume_weight')}
            className="mt-2 w-full accent-brand-600" aria-label="Resume weight" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Pass threshold" hint="0-100"><input type="number" min={0} max={100} className="input" value={form.pass_threshold} onChange={set('pass_threshold')} /></Field>
          <Field label="Hold band" hint="points below pass"><input type="number" min={0} max={100} className="input" value={form.hold_margin} onChange={set('hold_margin')} /></Field>
          <Field label="Confidence cutoff" hint="0-1"><input type="number" min={0} max={1} step={0.05} className="input" value={form.confidence_cutoff} onChange={set('confidence_cutoff')} /></Field>
          <Field label="Timer / question" hint="seconds"><input type="number" min={15} max={1800} className="input" value={form.question_time_limit_sec} onChange={set('question_time_limit_sec')} /></Field>
        </div>
      </div>
      {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    </Modal>
  )
}
