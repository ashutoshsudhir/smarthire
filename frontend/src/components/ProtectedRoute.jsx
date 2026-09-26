import { Navigate, useLocation } from 'react-router-dom'
import { HOME_BY_ROLE, useAuth } from '../context/AuthContext'
import { PageLoader } from './ui'

export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <PageLoader label="Restoring your session…" />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_BY_ROLE[user.role]} replace />
  return children
}
