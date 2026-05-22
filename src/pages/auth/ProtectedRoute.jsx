import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

/**
 * Wraps any route that requires authentication.
 * Optionally accepts `requiredRole` to gate role-specific pages.
 *
 * Usage:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/official/*" element={<OfficialLayout />} />
 *   </Route>
 *
 *   <Route element={<ProtectedRoute requiredRole="scheduler" />}>
 *     <Route path="/scheduler/*" element={<SchedulerLayout />} />
 *   </Route>
 */
import { Outlet } from 'react-router-dom'

export default function ProtectedRoute({ requiredRole }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  // Still resolving auth state — show nothing (splash handled in App.jsx)
  if (loading) return null

  // Not logged in → send to sign-in, remember where they were going
  if (!user) {
    return <Navigate to="/signin" state={{ from: location }} replace />
  }

  // Logged in but doesn't have the required role
  if (requiredRole && !profile?.roles?.includes(requiredRole)) {
    // Redirect to their first available role
    const firstRole = profile?.roles?.[0]
    return <Navigate to={`/${firstRole ?? 'signin'}`} replace />
  }

  return <Outlet />
}
