import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'

/**
 * useOpenGames — subscribes to all open games from schedulers
 * the official is connected to. These are games they can REQUEST.
 */
export function useOpenGames() {
  const { user, profile } = useAuth()
  const [openGames, setOpenGames] = useState([])
  const [loading, setLoading]     = useState(true)

  useEffect(() => {
    if (!user) return
    // Get all open games — officials can browse and request any open game
    const q = query(
      collection(db, 'games'),
      where('status', '==', 'open')
    )
    const unsub = onSnapshot(q, snap => {
      setOpenGames(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    return unsub
  }, [user])

  // Filter to games the official hasn't already requested or been assigned
  const available = openGames.filter(g => {
    const alreadyRequested = (g.requests ?? []).some(r => r.uid === user?.uid)
    const alreadyAssigned  = (g.assignedUids ?? []).includes(user?.uid)
    return !alreadyRequested && !alreadyAssigned
  })

  const myRequests = openGames.filter(g =>
    (g.requests ?? []).some(r => r.uid === user?.uid && r.status === 'pending')
  )

  return { openGames, available, myRequests, loading }
}
