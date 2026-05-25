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
      const officialIds = snap.docs.map(d => d.data().toUid)
      if (!officialIds.length) { setRoster([]); setLoading(false); return }

      // Fetch each official's profile
      const profiles = await Promise.all(
        officialIds.map(uid =>
          import('@/services/firestore').then(m => m.getUser(uid))
        )
      )
      setRoster(profiles.filter(Boolean))
      setLoading(false)
    })
    return unsub
  }, [user])

  return { roster, loading }
}
