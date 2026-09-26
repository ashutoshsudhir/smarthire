import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Eye, Search, Users } from 'lucide-react'
import SortableTh from '../../components/SortableTh'
import {
  Avatar, Badge, BandBadge, Card, ConfidenceMeter, EmptyState, ErrorState, PageHeader, ScoreCell, Skeleton, StatusBadge,
} from '../../components/ui'
import { useApi } from '../../lib/useApi'
import { STATUS_META, fmtDate } from '../../lib/format'

const PAGE = 10

export default function Candidates() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState(params.get('q') || '')
  const status = params.get('status') || ''
  const jdId = params.get('jd_id') || ''
  const flagged = params.get('flagged') || ''
  const sort = { field: params.get('sort') || 'combined_score', dir: params.get('order') || 'desc' }
  const page = Number(params.get('page') || 0)
  const jds = useApi('/jds')

  const query = {
    status: status || undefined, jd_id: jdId || undefined, q: params.get('q') || undefined,
    flagged: flagged || undefined, sort: sort.field, order: sort.dir, limit: PAGE, offset: page * PAGE,
  }
  const { data, error, loading, reload } = useApi('/candidates', { params: query })

  const update = (patch) => {
    const next = new URLSearchParams(params)
    Object.entries(patch).forEach(([k, v]) => (v === '' || v == null ? next.delete(k) : next.set(k, v)))
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const t = setTimeout(() => { if ((params.get('q') || '') !== search) update({ q: search }) }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const onSort = (field) => update({ sort: field, order: sort.field === field && sort.dir === 'desc' ? 'asc' : 'desc' })
  const total = data?.total || 0

  return (
    <div className="animate-fade-in">
      <PageHeader title="Candidates" subtitle="Sortable, filterable shortlist across all jobs. Click a candidate for the full AI evidence." />
      <Card className="mb-4 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="relative md:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input className="input pl-9" placeholder="Search name, email, id" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input" value={jdId} onChange={(e) => update({ jd_id: e.target.value })} aria-label="Job">
            <option value="">All jobs</option>
            {(jds.data || []).map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select className="input" value={status} onChange={(e) => update({ status: e.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
            {status && !STATUS_META[status] && <option value={status}>{status.replaceAll(',', ' / ')}</option>}
          </select>
          <select className="input" value={flagged} onChange={(e) => update({ flagged: e.target.value })} aria-label="Flags">
            <option value="">All candidates</option>
            <option value="true">Flagged for review</option>
            <option value="false">Not flagged</option>
          </select>
        </div>
      </Card>

      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50/70"><tr>
                <SortableTh label="Name" field="name" sort={sort} onSort={onSort} />
                <th className="th">Job</th>
                <SortableTh label="Resume" field="resume_score" sort={sort} onSort={onSort} />
                <SortableTh label="Q&A" field="qa_score" sort={sort} onSort={onSort} />
                <SortableTh label="Combined" field="combined_score" sort={sort} onSort={onSort} />
                <SortableTh label="Confidence" field="avg_confidence" sort={sort} onSort={onSort} />
                <SortableTh label="Status" field="status" sort={sort} onSort={onSort} />
                <th className="th">Interviewer</th>
                <SortableTh label="Interview" field="interview_date" sort={sort} onSort={onSort} />
                <th className="th text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {loading && !data ? [...Array(5)].map((_, i) => <tr key={i}><td colSpan={10} className="px-4 py-3"><Skeleton className="h-8" /></td></tr>)
                  : data.items.length === 0 ? <tr><td colSpan={10}><EmptyState icon={Users} title="No candidates match these filters" /></td></tr>
                  : data.items.map((c) => (
                    <tr key={c.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`/admin/candidates/${c.id}`)}>
                      <td className="td"><div className="flex items-center gap-2.5"><Avatar name={c.name} size="sm" /><div><div className="font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.email}</div></div></div></td>
                      <td className="td">{c.jd_title}</td>
                      <td className="td"><ScoreCell value={c.resume_score} /></td>
                      <td className="td"><ScoreCell value={c.qa_score} /></td>
                      <td className="td"><div className="flex items-center gap-2"><ScoreCell value={c.combined_score} /><BandBadge band={c.band} /></div></td>
                      <td className="td"><ConfidenceMeter value={c.avg_confidence ?? c.resume_confidence} /></td>
                      <td className="td"><div className="flex items-center gap-1.5"><StatusBadge status={c.status} />{c.flags?.length > 0 && <Badge tone="amber" className="px-1.5">⚑ {c.flags.length}</Badge>}</div></td>
                      <td className="td">{c.interviewer?.display_name || <span className="text-slate-400">—</span>}</td>
                      <td className="td">{fmtDate(c.interview_date)}</td>
                      <td className="td text-right"><Link to={`/admin/candidates/${c.id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50"><Eye className="h-3.5 w-3.5" />View</Link></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm text-slate-500">
            <span>{total ? `${page * PAGE + 1}–${Math.min(total, (page + 1) * PAGE)} of ${total}` : '0 results'}</span>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => update({ page: page - 1 })} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
              <button disabled={(page + 1) * PAGE >= total} onClick={() => update({ page: page + 1 })} className="rounded-md p-1.5 hover:bg-slate-100 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
