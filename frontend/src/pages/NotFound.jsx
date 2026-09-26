import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="rounded-full bg-brand-50 p-4 text-brand-600"><Compass className="h-8 w-8" /></div>
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-500">The page you are looking for does not exist or you do not have access.</p>
      <Link to="/" className="text-sm font-semibold text-brand-600 hover:text-brand-700">Go to my dashboard →</Link>
    </div>
  )
}
