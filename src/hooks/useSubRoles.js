import { useAuth } from '@/context/AuthContext'

/**
 * useSubRoles
 * Returns boolean flags for each sub-role the current user holds.
 * Used to conditionally show/hide sections in adaptive dashboards.
 */
export function useSubRoles() {
  const { profile } = useAuth()
  const subs = profile?.subRoles ?? []

  return {
    isReferee:         subs.includes('referee'),
    isScorekeeper:     subs.includes('scorekeeper'),
    isRefScheduler:    subs.includes('ref_scheduler'),
    isSKScheduler:     subs.includes('sk_scheduler'),
    // Convenience combos
    isAnyOfficial:     subs.includes('referee')      || subs.includes('scorekeeper'),
    isAnyScheduler:    subs.includes('ref_scheduler') || subs.includes('sk_scheduler'),
    isBothOfficial:    subs.includes('referee')      && subs.includes('scorekeeper'),
    isBothScheduler:   subs.includes('ref_scheduler') && subs.includes('sk_scheduler'),
  }
}
