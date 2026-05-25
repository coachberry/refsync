import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { subscribeGameGroups } from '@/services/firestore'

export function useGameGroups() {
  const { user, activeRole } = useAuth()
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user || !activeRole) return
    setLoading(true)
    const unsub = subscribeGameGroups(user.uid, activeRole, (data) => {
      setGroups(data)
      setLoading(false)
    })
    return unsub
  }, [user, activeRole])

  return { groups, loading }
}
