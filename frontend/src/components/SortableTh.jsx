import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'

export default function SortableTh({ label, field, sort, onSort, className = '' }) {
  const active = sort.field === field
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={`th ${className}`}>
      <button type="button" onClick={() => onSort(field)} className={`inline-flex items-center gap-1 uppercase hover:text-slate-800 ${active ? 'text-slate-800' : ''}`}>
        {label}<Icon className="h-3 w-3" />
      </button>
    </th>
  )
}

export function sortRows(rows, { field, dir }) {
  const withVal = rows.filter((r) => r[field] != null)
  const without = rows.filter((r) => r[field] == null)
  withVal.sort((a, b) => {
    const x = a[field], y = b[field]
    const cmp = typeof x === 'number' ? x - y : String(x).localeCompare(String(y))
    return dir === 'asc' ? cmp : -cmp
  })
  return [...withVal, ...without]
}
