import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import { PageLoader } from './components/ui'
import { HOME_BY_ROLE, useAuth } from './context/AuthContext'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import AdminDashboard from './pages/admin/Dashboard'
import Jobs from './pages/admin/Jobs'
import JobDetail from './pages/admin/JobDetail'
import Candidates from './pages/admin/Candidates'
import CandidateProfile from './pages/admin/CandidateProfile'
import Interviews from './pages/admin/Interviews'
import AuditLogs from './pages/admin/AuditLogs'
import SettingsPage from './pages/admin/Settings'
import CandidateDashboard from './pages/candidate/Dashboard'
import Screening from './pages/candidate/Screening'
import InterviewerDashboard from './pages/interviewer/Dashboard'
import CandidateReview from './pages/interviewer/CandidateReview'

function Home() {
  const { user, loading } = useAuth()
  if (loading) return <PageLoader />
  return <Navigate to={user ? HOME_BY_ROLE[user.role] : '/login'} replace />
}

const guard = (roles, el) => <ProtectedRoute roles={roles}>{el}</ProtectedRoute>

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route element={guard(['admin'], <Layout />)}>
        <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/jobs" element={<Jobs />} />
        <Route path="/admin/jobs/:jdId" element={<JobDetail />} />
        <Route path="/admin/candidates" element={<Candidates />} />
        <Route path="/admin/candidates/:candidateId" element={<CandidateProfile />} />
        <Route path="/admin/interviews" element={<Interviews />} />
        <Route path="/admin/audit" element={<AuditLogs />} />
        <Route path="/admin/settings" element={<SettingsPage />} />
      </Route>
      <Route element={guard(['candidate'], <Layout />)}>
        <Route path="/candidate" element={<Navigate to="/candidate/dashboard" replace />} />
        <Route path="/candidate/dashboard" element={<CandidateDashboard />} />
        <Route path="/candidate/screening" element={<Screening />} />
      </Route>
      <Route element={guard(['interviewer'], <Layout />)}>
        <Route path="/interviewer" element={<Navigate to="/interviewer/dashboard" replace />} />
        <Route path="/interviewer/dashboard" element={<InterviewerDashboard />} />
        <Route path="/interviewer/candidates/:candidateId" element={<CandidateReview />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
