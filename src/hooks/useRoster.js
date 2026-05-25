import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { searchUsers } from '@/services/firestore'
import {
  collection, query, where, onSnapshot
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

/**
 * useRoster — gets all officials connected to this scheduler
 */
export function useRoster() {
  const { user } = useAuth()
  const [roster, setRoster] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    // Officials who have an accepted connection with this scheduler
    const q = query(
      collection(db, 'connections'),
      where('fromUid', '==', user.uid),
      where('type', '==', 'scheduler-official'),
      where('status', '==', 'accepted')
    )
    const unsub = onSnapshot(q, async (snap) => {
      const connections = snap.docs.map(d => ({ connectionId: d.id, ...d.data() }))
      if (!connections.length) { setRoster([]); setLoading(false); return }

      // Fetch each official's profile and attach connectionId
      const profiles = await Promise.all(
        connections.map(async conn => {
          const profile = await import('@/services/firestore').then(m => m.getUser(conn.toUid))
          return profile ? { ...profile, connectionId: conn.connectionId } : null
        })
      )
      setRoster(profiles.filter(Boolean))
      setLoading(false)
    })
    return unsub
  }, [user])

  return { roster, loading }
}
