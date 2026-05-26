import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot, getDocs } from 'firebase/firestore'
import { useConnections } from '@/hooks/useConnections'

/**
 * useOpenGames — subscribes to open games from schedulers the official
 * is connected to. These are games they can REQUEST.
 */
export function useOpenGames() {
  const { user } = useAuth()
  const { accepted } = useConnections()
  const [openGames, setOpenGames]   = useState([])
  const [loading, setLoading]       = useState(true)

  useEffect(() => {
    if (!user) return

    // Get connected scheduler UIDs
    const schedulerUids = accepted
      .filter(c => c.type === 'scheduler-official')
      .map(c => c.fromUid === user.uid ? c.toUid : c.fromUid)
      .filter(Boolean)

    if (schedulerUids.length === 0) {
      setOpenGames([])
      setLoading(false)
      return
    }

    // Subscribe to open games from connected schedulers
    const q = query(
      collection(db, 'games'),
      where('status', '==', 'open'),
      where('schedulerId', 'in', schedulerUids.slice(0, 10))
    )
    const unsub = onSnapshot(q, snap => {
      const games = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const da = a.gameDate?.toDate?.() ?? new Date(a.gameDate)
          const db_ = b.gameDate?.toDate?.() ?? new Date(b.gameDate)
          return da - db_
        })
      setOpenGames(games)
      setLoading(false)
    })
    return unsub
  }, [user, accepted.length])

  const available = openGames.filter(g => {
    const alreadyRequested = (g.requests ?? []).some(r => r.uid === user?.uid)
    const alreadyAssigned  = (g.assignedUids ?? []).includes(user?.uid)
    return !alreadyRequested && !alreadyAssigned
  })

  const myRequests = openGames.filter(g =>
    (g.requests ?? []).some(r => r.uid === user?.uid)
  )

  return { openGames, available, myRequests, loading }
}
