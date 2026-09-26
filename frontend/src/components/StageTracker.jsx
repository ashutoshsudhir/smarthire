import { Check } from 'lucide-react'
import { cn } from './ui'

export const STAGES = ['Applied', 'Resume Screened', 'Screening', 'Q&A Completed', 'Interview', 'Final Decision']

export default function StageTracker({ stage, stopped }) {
  const idx = STAGES.indexOf(stage)
  return (
    <ol className="flex w-full items-start">
      {STAGES.map((s, i) => {
        const done = i < idx || (i === idx && i === STAGES.length - 1)
        const current = i === idx
        return (
          <li key={s} className="relative flex flex-1 flex-col items-center">
            {i > 0 && <div className={cn('absolute right-1/2 top-3.5 h-0.5 w-full', i <= idx ? 'bg-brand-500' : 'bg-slate-200')} />}
            <div className={cn('relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold',
              done ? 'border-brand-600 bg-brand-600 text-white'
                : current ? (stopped ? 'border-slate-400 bg-white text-slate-500' : 'border-brand-600 bg-white text-brand-700 ring-4 ring-brand-100')
                  : 'border-slate-200 bg-white text-slate-400')}>
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={cn('mt-2 px-1 text-center text-[10px] font-medium leading-tight sm:text-xs', current ? 'text-slate-900' : 'text-slate-500')}>{s}</span>
          </li>
        )
      })}
    </ol>
  )
}
