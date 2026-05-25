import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  subscribeOfficialGames,
  subscribeGames,
} from '@/services/firestore'

/**
 * useOfficialGames — games assigned to the logged-in official
 */
export function useOfficialGames() {
  const { user } = useAuth()
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)
    const unsub = subscribeOfficialGames(user.uid, (data) => {
      setGames(data)
      setLoading(false)
    })
    return unsub
  }, [user])

  const pending   = games.filter(g => g.assignedOfficials?.find(o => o.uid === user?.uid && o.status === 'pending'))
  const upcoming  = games.filter(g => g.assignedOfficials?.find(o => o.uid === user?.uid && o.status === 'accepted'))
  const all       = games

  return { games: all, pending, upcoming, loading }
}

/**
 * useGroupGames — games belonging to a specific group (for schedulers)
 */
export function useGroupGames(groupId) {
  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!groupId) { setLoading(false); return }
    setLoading(true)
    const unsub = subscribeGames(groupId, (data) => {
      setGames(data)
      setLoading(false)
    })
    return unsub
  }, [groupId])

  const open      = games.filter(g => g.status === 'open')
  const assigned  = games.filter(g => g.status === 'assigned' || g.status === 'confirmed')
  const completed = games.filter(g => g.status === 'completed')

  return { games, open, assigned, completed, loading }
}
