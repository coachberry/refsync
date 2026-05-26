import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { subscribeGameGroups } from '@/services/firestore'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'

export function useGameGroups() {
  const { user, activeRole } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const unsubRef = useRef(null)

  useEffect(() => {
    if (!user || !activeRole) return
    setLoading(true)

    // Clean up any previous subscription
    const cleanup = () => { if (unsubRef.current) { unsubRef.current(); unsubRef.current = null } }

    if (activeRole === 'scheduler') {
      // Fetch groupIds from accepted/open RFQs, then subscribe to those groups
      getDocs(query(
        collection(db, 'rfqs'),
        where('schedulerUid', '==', user.uid),
        where('status', 'in', ['open', 'quoted', 'accepted'])
      )).then(snap => {
        const groupIds = [...new Set(snap.docs.map(d => d.data().groupId).filter(Boolean))]
        cleanup()
        unsubRef.current = subscribeGameGroups(user.uid, 'scheduler', data => {
          setGroups(data)
          setLoading(false)
        }, groupIds)
        if (groupIds.length === 0) setLoading(false)
      }).catch(() => setLoading(false))

      return cleanup
    }

    // Director — subscribe directly by directorId
    cleanup()
    unsubRef.current = subscribeGameGroups(user.uid, activeRole, data => {
      setGroups(data)
      setLoading(false)
    })
    return cleanup
  }, [user?.uid, activeRole])

  return { groups, loading }
}
