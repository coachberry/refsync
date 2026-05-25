import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import ProtectedRoute from '@/pages/auth/ProtectedRoute'

// Layouts
import ProfileShell from '@/components/layout/ProfileShell'
import RoleShell    from '@/components/layout/RoleShell'

// Auth
import SignUp from '@/pages/auth/SignUp'
import SignIn from '@/pages/auth/SignIn'

// Profile pages (landing after login)
import ProfileDashboard from '@/pages/profile/ProfileDashboard'
import ProfileMessages  from '@/pages/profile/ProfileMessages'
import ProfileEdit      from '@/pages/profile/ProfileEdit'
import ProfileFinances  from '@/pages/profile/ProfileFinances'

// Official pages
import OfficialHome         from '@/pages/official/OfficialHome'
import OfficialSchedule     from '@/pages/official/OfficialSchedule'
import OfficialAvailability from '@/pages/official/OfficialAvailability'
import OfficialProfile      from '@/pages/official/OfficialProfile'
import OfficialStats        from '@/pages/official/OfficialStats'
import OfficialNews         from '@/pages/official/OfficialNews'
import OfficialExpenses     from '@/pages/official/OfficialExpenses'

// Scheduler pages
import SchedDashboard  from '@/pages/scheduler/SchedDashboard'
import SchedAssign     from '@/pages/scheduler/SchedAssign'
import SchedRoster     from '@/pages/scheduler/SchedRoster'
import SchedGameGroups from '@/pages/scheduler/SchedGameGroups'
import SchedFinance    from '@/pages/scheduler/SchedFinance'
import SchedNews       from '@/pages/scheduler/SchedNews'
import SchedQuotes     from '@/pages/scheduler/SchedQuotes'

// Director pages
import DirDashboard  from '@/pages/director/DirDashboard'
import DirEvents     from '@/pages/director/DirEvents'
import DirSchedulers from '@/pages/director/DirSchedulers'
import DirInvoices   from '@/pages/director/DirInvoices'

// Settings
import AddRole from '@/pages/settings/AddRole'

import { ComingSoon, PageLoader } from '@/components/ui'

export default function App() {
  const { user, loading } = useAuth()

  if (loading) return <PageLoader message="Loading RefSync…" />

  return (
    <Routes>
      {/* Public */}
      <Route path="/signup" element={<SignUp />} />
      <Route path="/signin" element={<SignIn />} />

      {/* ── Profile (landing page after login) ── */}
      <Route element={<ProtectedRoute />}>
        <Route element={<ProfileShell />}>
          <Route path="/profile"          element={<ProfileDashboard />} />
          <Route path="/profile/messages" element={<ProfileMessages />} />
          <Route path="/profile/finances" element={<ProfileFinances />} />
          <Route path="/profile/edit"     element={<ProfileEdit />} />
          <Route path="/settings/add-role" element={<AddRole />} />
        </Route>
      </Route>

      {/* ── Official dashboard ── */}
      <Route element={<ProtectedRoute requiredRole="official" />}>
        <Route element={<RoleShell role="official" />}>
          <Route path="/official"              element={<OfficialHome />} />
          <Route path="/official/schedule"     element={<OfficialSchedule />} />
          <Route path="/official/availability" element={<OfficialAvailability />} />
          <Route path="/official/inbox"        element={<Navigate to="/profile/messages" replace />} />
          <Route path="/official/news"         element={<OfficialNews />} />
          <Route path="/official/profile"      element={<OfficialProfile />} />
          <Route path="/official/stats"        element={<OfficialStats />} />
          <Route path="/official/expenses"     element={<OfficialExpenses />} />
        </Route>
      </Route>

      {/* ── Scheduler dashboard ── */}
      <Route element={<ProtectedRoute requiredRole="scheduler" />}>
        <Route element={<RoleShell role="scheduler" />}>
          <Route path="/scheduler"           element={<SchedDashboard />} />
          <Route path="/scheduler/quotes"    element={<SchedQuotes />} />
          <Route path="/scheduler/groups"    element={<SchedGameGroups />} />
          <Route path="/scheduler/assign"    element={<SchedAssign />} />
          <Route path="/scheduler/roster"    element={<SchedRoster />} />
          <Route path="/scheduler/finance"   element={<SchedFinance />} />
          <Route path="/scheduler/messages"  element={<Navigate to="/profile/messages" replace />} />
          <Route path="/scheduler/news"      element={<SchedNews />} />
          <Route path="/scheduler/settings"  element={<ComingSoon role="scheduler" />} />
        </Route>
      </Route>

      {/* ── Director dashboard ── */}
      <Route element={<ProtectedRoute requiredRole="director" />}>
        <Route element={<RoleShell role="director" />}>
          <Route path="/director"              element={<DirDashboard />} />
          <Route path="/director/events"       element={<DirEvents />} />
          <Route path="/director/schedulers"   element={<DirSchedulers />} />
          <Route path="/director/invoices"     element={<DirInvoices />} />
          <Route path="/director/messages"     element={<Navigate to="/profile/messages" replace />} />
          <Route path="/director/settings"     element={<ComingSoon role="director" />} />
        </Route>
      </Route>

      {/* Root → profile (logged in) or sign in */}
      <Route
        path="/"
        element={user ? <Navigate to="/profile" replace /> : <Navigate to="/signin" replace />}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
