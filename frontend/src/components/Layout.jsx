import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Briefcase, CalendarClock, ClipboardList, LayoutDashboard, LogOut, Menu, ScrollText, Settings, Sparkles, Users, X,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { Avatar, cn } from './ui'

const NAV = {
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/admin/jobs', label: 'Jobs', icon: Briefcase },
    { to: '/admin/candidates', label: 'Candidates', icon: Users },
    { to: '/admin/interviews', label: 'Interviews', icon: CalendarClock },
    { to: '/admin/audit', label: 'Audit Logs', icon: ScrollText },
    { to: '/admin/settings', label: 'Settings', icon: Settings },
  ],
  candidate: [
    { to: '/candidate/dashboard', label: 'My Application', icon: ClipboardList },
  ],
  interviewer: [
    { to: '/interviewer/dashboard', label: 'Assigned Candidates', icon: Users },
  ],
}

const ROLE_LABEL = { admin: 'Hiring Manager', candidate: 'Candidate', interviewer: 'Interviewer' }

export function Logo({ light = false }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-lg shadow-brand-600/30">
        <Sparkles className="h-5 w-5 text-white" />
      </div>
      <div className="leading-tight">
        <div className={cn('text-base font-extrabold tracking-tight', light ? 'text-white' : 'text-slate-900')}>SmartHire</div>
        <div className={cn('text-[10px] font-semibold tracking-widest uppercase', light ? 'text-brand-200' : 'text-slate-400')}>AI Screening</div>
      </div>
    </div>
  )
}

function Sidebar({ onNavigate }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  return (
    <div className="flex h-full flex-col bg-slate-900">
      <div className="px-5 py-5"><Logo light /></div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV[user.role].map((item) => (
          <NavLink key={item.to} to={item.to} onClick={onNavigate}
            className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
              isActive ? 'bg-brand-600 text-white shadow-md shadow-brand-900/40' : 'text-slate-300 hover:bg-slate-800 hover:text-white')}>
            <item.icon className="h-[18px] w-[18px]" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-800 p-4">
        <div className="flex items-center gap-3">
          <Avatar name={user.display_name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user.display_name}</div>
            <div className="text-xs text-slate-400">{ROLE_LABEL[user.role]}</div>
          </div>
          <button onClick={() => { logout(); navigate('/login') }} title="Sign out"
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Layout() {
  const [open, setOpen] = useState(false)
  const { user } = useAuth()
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block"><Sidebar /></aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 animate-fade-in"><Sidebar onNavigate={() => setOpen(false)} /></div>
          <button className="absolute left-66 top-4 rounded-md bg-white/10 p-1.5 text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur lg:hidden">
          <button onClick={() => setOpen(true)} className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100" aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <Logo />
          <Avatar name={user.display_name} size="sm" />
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
