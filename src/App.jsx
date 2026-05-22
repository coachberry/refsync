import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import ProtectedRoute from '@/pages/auth/ProtectedRoute'
import AppShell from '@/components/layout/AppShell'
import SignUp from '@/pages/auth/SignUp'
import SignIn from '@/pages/auth/SignIn'
import { ComingSoon, PageLoader } from '@/components/ui'

export default function App() {
  const { user, activeRole, loading } = useAuth()

  if (loading) return <PageLoader message="Loading RefSync…" />

  return (
    <Routes>
      <Route path="/signup" element={<SignUp />} />
      <Route path="/signin" element={<SignIn />} />

      {/* Official */}
      <Route element={<ProtectedRoute requiredRole="official" />}>
        <Route element={<AppShell />}>
          <Route path="/official"              element={<ComingSoon role="official" />} />
          <Route path="/official/schedule"     element={<ComingSoon role="official" />} />
          <Route path="/official/availability" element={<ComingSoon role="official" />} />
          <Route path="/official/inbox"        element={<ComingSoon role="official" />} />
          <Route path="/official/news"         element={<ComingSoon role="official" />} />
          <Route path="/official/profile"      element={<ComingSoon role="official" />} />
          <Route path="/official/expenses"     element={<ComingSoon role="official" />} />
        </Route>
      </Route>

      {/* Scheduler */}
      <Route element={<ProtectedRoute requiredRole="scheduler" />}>
        <Route element={<AppShell />}>
          <Route path="/scheduler"           element={<ComingSoon role="scheduler" />} />
          <Route path="/scheduler/groups"    element={<ComingSoon role="scheduler" />} />
          <Route path="/scheduler/assign"    element={<ComingSoon role="scheduler" />} />
          <Route path="/scheduler/roster"    element={<ComingSoon role="scheduler" />} />
          <Route path="/scheduler/finance"   element={<ComingSoon role="scheduler" />} />
          <Route path="/scheduler/messages"  element={<ComingSoon role="scheduler" />} />
          <Route path="/scheduler/news"      element={<ComingSoon role="scheduler" />} />
          <Route path="/scheduler/settings"  element={<ComingSoon role="scheduler" />} />
        </Route>
      </Route>

      {/* Director */}
      <Route element={<ProtectedRoute requiredRole="director" />}>
        <Route element={<AppShell />}>
          <Route path="/director"              element={<ComingSoon role="director" />} />
          <Route path="/director/events"       element={<ComingSoon role="director" />} />
          <Route path="/director/schedulers"   element={<ComingSoon role="director" />} />
          <Route path="/director/invoices"     element={<ComingSoon role="director" />} />
          <Route path="/director/messages"     element={<ComingSoon role="director" />} />
          <Route path="/director/settings"     element={<ComingSoon role="director" />} />
        </Route>
      </Route>

      <Route
        path="/"
        element={
          user && activeRole
            ? <Navigate to={`/${activeRole}`} replace />
            : <Navigate to="/signin" replace />
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
