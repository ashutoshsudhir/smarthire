import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, errorMessage } from '../lib/api'
import { fromLocalInput, toLocalInput } from '../lib/format'
import { useApi } from '../lib/useApi'
import { Button, Field, Modal } from './ui'

export default function AssignInterviewModal({ open, onClose, candidate, onSaved }) {
  const interviewers = useApi('/users', { params: { role: 'interviewer' }, enabled: open })
  const existing = candidate.interview
  const [interviewerId, setInterviewerId] = useState('')
  const [when, setWhen] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setInterviewerId(existing?.interviewer?.id ? String(existing.interviewer.id) : '')
    const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(11, 0, 0, 0)
    setWhen(existing?.scheduled_at ? toLocalInput(existing.scheduled_at) : toLocalInput(d.toISOString()))
    setError('')
  }, [open, existing])

  async function save() {
    if (!interviewerId) return setError('Select an interviewer.')
    if (!when) return setError('Pick an interview date and time.')
    setSaving(true)
    setError('')
    try {
      if (existing) {
        await api.put(`/interviews/${existing.id}`, { interviewer_id: Number(interviewerId), scheduled_at: fromLocalInput(when) })
        toast.success('Interview updated')
      } else {
        await api.post('/interviews', { candidate_id: candidate.id, interviewer_id: Number(interviewerId), scheduled_at: fromLocalInput(when) })
        toast.success('Interviewer assigned and interview scheduled')
        toast.message(`Interview invitation sent to ${candidate.name} (in-app)`)
      }
      onSaved?.()
      onClose()
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Update interview' : 'Assign interviewer'} subtitle={`${candidate.name} · ${candidate.jd_title}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={save}>{existing ? 'Save changes' : 'Assign & schedule'}</Button></>}>
      <div className="space-y-4">
        <Field label="Interviewer">
          <select className="input" value={interviewerId} onChange={(e) => setInterviewerId(e.target.value)}>
            <option value="">Select interviewer…</option>
            {(interviewers.data || []).map((u) => <option key={u.id} value={u.id}>{u.display_name} ({u.username})</option>)}
          </select>
        </Field>
        <Field label="Interview date & time"><input type="datetime-local" className="input" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      </div>
    </Modal>
  )
}
