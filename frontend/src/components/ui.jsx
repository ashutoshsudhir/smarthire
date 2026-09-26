import { useEffect } from 'react'
import clsx from 'clsx'
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react'
import { BAND_META, STATUS_META } from '../lib/format'

export const cn = clsx

const TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  zinc: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  green: 'bg-green-50 text-green-700 ring-green-200',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  orange: 'bg-orange-50 text-orange-700 ring-orange-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
}
const DOTS = {
  slate: 'bg-slate-400', zinc: 'bg-zinc-400', blue: 'bg-blue-500', green: 'bg-green-500', emerald: 'bg-emerald-500',
  amber: 'bg-amber-500', red: 'bg-red-500', violet: 'bg-violet-500', orange: 'bg-orange-500', brand: 'bg-brand-500',
}

export function Badge({ tone = 'slate', dot = false, className, children }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} />}
      {children}
    </span>
  )
}

export function StatusBadge({ status, label }) {
  const m = STATUS_META[status] || { label: status, tone: 'slate' }
  return <Badge tone={m.tone} dot>{label || m.label}</Badge>
}

export function BandBadge({ band }) {
  if (!band) return <span className="text-slate-400">—</span>
  const m = BAND_META[band]
  return <Badge tone={m.tone}>{m.label}</Badge>
}

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, ...props }) {
  const variants = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/20',
    secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50',
    ghost: 'text-slate-600 hover:bg-slate-100',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700',
  }
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' }
  return (
    <button
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60', variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  )
}

export function Card({ className, children, ...props }) {
  return <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)} {...props}>{children}</div>
}

export function CardHeader({ title, subtitle, action, icon: Icon }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
      <div className="flex items-center gap-3 min-w-0">
        {Icon && <div className="rounded-lg bg-brand-50 p-2 text-brand-600"><Icon className="h-4 w-4" /></div>}
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

export function Spinner({ className }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand-600', className)} />
}

export function PageLoader({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-slate-500">
      <Spinner className="h-7 w-7" />
      {label}
    </div>
  )
}

export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70', className)} />
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="rounded-full bg-slate-100 p-3 text-slate-400"><Icon className="h-6 w-6" /></div>
      <h4 className="mt-4 text-sm font-semibold text-slate-900">{title}</h4>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-6 py-10 text-center">
      <AlertTriangle className="h-6 w-6 text-red-500" />
      <p className="text-sm font-medium text-red-800">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={() => onRetry()}>Try again</Button>}
    </div>
  )
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn('animate-fade-in relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl', widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3 rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'primary', loading, onConfirm, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={tone} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </>}>
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  )
}

export function ProgressBar({ value, max = 100, tone = 'brand', className, height = 'h-2' }) {
  const pct = Math.max(0, Math.min(100, (value / (max || 1)) * 100))
  const colors = { brand: 'bg-brand-600', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', slate: 'bg-slate-400' }
  return (
    <div className={cn('w-full overflow-hidden rounded-full bg-slate-100', height, className)}>
      <div className={cn('h-full rounded-full transition-all duration-500', colors[tone])} style={{ width: `${pct}%` }} />
    </div>
  )
}

export function ScoreRing({ value, max = 100, size = 88, label, sub }) {
  const pct = value == null ? 0 : Math.max(0, Math.min(1, value / max))
  const r = (size - 10) / 2
  const c = 2 * Math.PI * r
  const color = value == null ? '#cbd5e1' : pct >= 0.75 ? '#10b981' : pct >= 0.6 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} stroke="#f1f5f9" strokeWidth="8" fill="none" />
          <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="8" fill="none" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)} style={{ transition: 'stroke-dashoffset .6s ease' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-slate-900">{value == null ? '—' : Math.round(value)}</span>
          {sub && <span className="text-[10px] font-medium text-slate-400">{sub}</span>}
        </div>
      </div>
      {label && <span className="text-xs font-medium text-slate-500">{label}</span>}
    </div>
  )
}

export function ConfidenceMeter({ value, cutoff = 0.6 }) {
  if (value == null) return <span className="text-slate-400">—</span>
  const tone = value >= cutoff + 0.15 ? 'green' : value >= cutoff ? 'amber' : 'red'
  return (
    <div className="flex items-center gap-2">
      <ProgressBar value={value * 100} tone={tone} className="w-14" height="h-1.5" />
      <span className={cn('text-xs font-semibold', value < cutoff ? 'text-red-600' : 'text-slate-600')}>{Math.round(value * 100)}%</span>
    </div>
  )
}

export function ScoreCell({ value, max = 100 }) {
  if (value == null) return <span className="text-slate-400">—</span>
  const tone = value / max >= 0.75 ? 'text-emerald-700' : value / max >= 0.6 ? 'text-amber-700' : 'text-red-600'
  return <span className={cn('font-semibold tabular-nums', tone)}>{Number(value).toFixed(max === 100 ? 1 : 0)}</span>
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="border-b border-slate-200">
      <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => onChange(t.id)}
            className={cn('flex items-center gap-2 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition',
              active === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700')}>
            {t.icon && <t.icon className="h-4 w-4" />}
            {t.label}
            {t.count != null && <span className={cn('rounded-full px-2 py-0.5 text-xs', active === t.id ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600')}>{t.count}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint, onClick }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-600', blue: 'bg-blue-50 text-blue-600', green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', violet: 'bg-violet-50 text-violet-600',
    slate: 'bg-slate-100 text-slate-600', orange: 'bg-orange-50 text-orange-600',
  }
  return (
    <Card className={cn('p-5', onClick && 'cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md')} onClick={onClick}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900 tabular-nums">{value ?? '—'}</p>
        </div>
        {Icon && <div className={cn('rounded-xl p-2.5', tones[tone])}><Icon className="h-5 w-5" /></div>}
      </div>
      {hint && <p className="mt-3 text-xs text-slate-500">{hint}</p>}
    </Card>
  )
}

export function PageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && <div className="mb-2 text-xs font-medium text-slate-500">{breadcrumb}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Field({ label, hint, error, children }) {
  return (
    <label className="block">
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  )
}

export function SkillChips({ items, tone = 'slate', empty = 'None' }) {
  if (!items?.length) return <span className="text-sm text-slate-400">{empty}</span>
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((s) => <Badge key={s} tone={tone}>{s}</Badge>)}
    </div>
  )
}

export function Avatar({ name = '?', size = 'md' }) {
  const initials = name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
  const palette = ['bg-brand-100 text-brand-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700', 'bg-rose-100 text-rose-700', 'bg-sky-100 text-sky-700', 'bg-violet-100 text-violet-700']
  const color = palette[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % palette.length]
  const sizes = { sm: 'h-7 w-7 text-[11px]', md: 'h-9 w-9 text-xs', lg: 'h-14 w-14 text-lg' }
  return <div className={cn('flex shrink-0 items-center justify-center rounded-full font-bold', color, sizes[size])}>{initials}</div>
}
