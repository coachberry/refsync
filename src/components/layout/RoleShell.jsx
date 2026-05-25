import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import AppShell from './AppShell'

/**
 * RoleShell wraps AppShell and ensures activeRole is set
 * correctly based on the current URL path before rendering.
 * This means navigating to /scheduler always shows the
 * Scheduler sidebar, regardless of previous role state.
 */
export default function RoleShell({ role }) {
  const { activeRole, switchRole, profile } = useAuth()

  useEffect(() => {
    if (role && profile?.roles?.includes(role) && activeRole !== role) {
      switchRole(role)
    }
  }, [role, profile])

  return <AppShell />
}
