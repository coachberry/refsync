import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  subscribeNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/services/firestore'

export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeNotifications(user.uid, (data) => {
      // Sort by createdAt descending client-side (avoids composite index)
      const sorted = [...data].sort((a, b) => {
        const ta = a.createdAt?.seconds ?? 0
        const tb = b.createdAt?.seconds ?? 0
        return tb - ta
      })
      setNotifications(sorted)
      setLoading(false)
    })
    return unsub
  }, [user])

  const markRead    = (id) => markNotificationRead(id)
  const markAllRead = ()   => user && markAllNotificationsRead(user.uid)

  const unreadCount = notifications.filter(n => !n.read).length

  return { notifications, unreadCount, loading, markRead, markAllRead }
}
