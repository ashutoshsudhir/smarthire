import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { BadgeCheck, Brain, Briefcase, ClipboardCheck, Lock, ShieldCheck, User, UserCheck, Users } from 'lucide-react'
import { Logo } from '../components/Layout'
import { Button, cn } from '../components/ui'
import { HOME_BY_ROLE, useAuth } from '../context/AuthContext'
import { errorMessage } from '../lib/api'

const ROLES = [
  { id: 'admin', label: 'Hiring Manager', desc: 'Admin portal', icon: Briefcase, demo: ['admin1', 'admin2'] },
  { id: 'candidate', label: 'Candidate', desc: 'Application & Q&A', icon: User,
    demo: Array.from({ length: 10 }, (_, i) => `candidate${i + 1}`) },
  { id: 'interviewer', label: 'Interviewer', desc: 'Assigned interviews', icon: UserCheck, demo: ['interviewer1', 'interviewer2'] },
]

const FEATURES = [
  { icon: Brain, title: 'Explainable AI screening', text: 'Every resume scored against the JD with matched skills, gaps and confidence.' },
  { icon: ClipboardCheck, title: 'Rubric-graded Q&A', text: 'Timed, one-question-at-a-time screening with anti-cheat telemetry.' },
  { icon: Users, title: 'Role-based interview tracking', text: 'Interviewers see only their candidates. Humans make the final call.' },
  { icon: ShieldCheck, title: 'Fully auditable', text: 'Every score, status change and note is timestamped and preserved.' },
]

export default function Login() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const [role, setRole] = useState('admin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (params.get('expired')) toast.info('Your session expired. Please sign in again.')
  }, [params])

  if (user) return <Navigate to={HOME_BY_ROLE[user.role]} replace />

  const selected = ROLES.find((r) => r.id === role)

  async function submit(e) {
    e.preventDefault()
    setError('')
    if (!username.trim() || !password) {
      setError('Enter your username and password.')
      return
    }
    setLoading(true)
    try {
      const u = await login(username.trim(), password, role)
      toast.success(`Welcome, ${u.display_name}`)
      const from = location.state?.from
      navigate(from && from.startsWith(`/${u.role}`) ? from : HOME_BY_ROLE[u.role], { replace: true })
    } catch (err) {
      setError(errorMessage(err, 'Login failed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-[46%] overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
        <Logo light />
        <div className="relative">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-white">
            Hire faster with <span className="bg-gradient-to-r from-brand-300 to-violet-300 bg-clip-text text-transparent">evidence</span>, not inbox chaos.
          </h1>
          <p className="mt-4 max-w-md text-base text-slate-300">
            One portal from job description to final decision: AI resume screening, rubric-graded Q&A, combined scoring and interview tracking.
          </p>
          <div className="mt-10 grid grid-cols-1 gap-5 xl:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex gap-3">
                <div className="mt-0.5 h-fit rounded-lg bg-white/10 p-2 text-brand-200"><f.icon className="h-4 w-4" /></div>
                <div>
                  <div className="text-sm font-semibold text-white">{f.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-slate-400">{f.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="relative flex items-center gap-2 text-xs text-slate-500">
          <BadgeCheck className="h-4 w-4" /> AI provides evidence. People make the decisions.
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Sign in to SmartHire</h2>
          <p className="mt-1 text-sm text-slate-500">Choose your role and sign in with your account.</p>

          <div className="mt-6 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <button key={r.id} type="button" role="radio" aria-checked={role === r.id}
                onClick={() => { setRole(r.id); setUsername(''); setError('') }}
                className={cn('flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-center transition',
                  role === r.id ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500/20' : 'border-slate-200 bg-white hover:border-slate-300')}>
                <r.icon className={cn('h-5 w-5', role === r.id ? 'text-brand-600' : 'text-slate-400')} />
                <span className={cn('text-xs font-semibold', role === r.id ? 'text-brand-700' : 'text-slate-700')}>{r.label}</span>
                <span className="hidden text-[10px] text-slate-400 sm:block">{r.desc}</span>
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <div>
              <label className="label" htmlFor="username">Username</label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input id="username" className="input pl-9" autoComplete="username" value={username}
                  onChange={(e) => setUsername(e.target.value)} placeholder={selected.demo[0]} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input id="password" type="password" className="input pl-9" autoComplete="current-password"
                  value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            </div>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
            <Button type="submit" size="lg" className="w-full" loading={loading}>Sign in as {selected.label}</Button>
          </form>

          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-4">
            <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Demo accounts ({selected.label})</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {selected.demo.map((u) => (
                <button key={u} type="button" onClick={() => setUsername(u)}
                  className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 hover:bg-brand-50 hover:text-brand-700">{u}</button>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-400">Passwords are listed in the project README (seeded from Input_Data.json).</p>
          </div>
        </div>
      </div>
    </div>
  )
}
