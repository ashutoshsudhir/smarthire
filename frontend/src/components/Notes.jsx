import { useState } from 'react'
import { toast } from 'sonner'
import { MessageSquarePlus, StickyNote } from 'lucide-react'
import { api, errorMessage } from '../lib/api'
import { fmtDateTime } from '../lib/format'
import { Avatar, Badge, Button, Card, CardHeader, EmptyState } from './ui'

export default function Notes({ candidateId, notes, onAdded, title = 'Notes' }) {
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  async function add(e) {
    e.preventDefault()
    if (!body.trim()) return
    setSaving(true)
    try {
      await api.post(`/candidates/${candidateId}/notes`, { body })
      setBody('')
      toast.success('Note added')
      onAdded?.()
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }
  return (
    <Card>
      <CardHeader title={title} subtitle="Timestamped and preserved in the audit trail" icon={StickyNote} />
      <form onSubmit={add} className="border-b border-slate-100 p-5">
        <textarea className="input" rows={3} placeholder="Add an interview note…" value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
        <div className="mt-2 flex justify-end"><Button type="submit" size="sm" icon={MessageSquarePlus} loading={saving} disabled={!body.trim()}>Add note</Button></div>
      </form>
      {notes.length === 0 ? <EmptyState title="No notes yet" /> : (
        <ul className="divide-y divide-slate-100">
          {notes.map((n) => (
            <li key={n.id} className="flex gap-3 px-5 py-4">
              <Avatar name={n.author?.display_name || '?'} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-semibold text-slate-800">{n.author?.display_name}</span>
                  <Badge tone={n.author_role === 'admin' ? 'brand' : 'violet'}>{n.author_role === 'admin' ? 'Hiring Manager' : 'Interviewer'}</Badge>
                  <span>{fmtDateTime(n.created_at)}</span>
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{n.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
