import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  subscribeConnections,
  respondToConnection,
  sendConnectionRequest,
} from '@/services/firestore'
import toast from 'react-hot-toast'

export function useConnections() {
  const { user } = useAuth()
  const [incoming, setIncoming] = useState([])  // requests sent TO me
  const [outgoing, setOutgoing] = useState([])  // requests sent BY me
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    setLoading(true)

    const unsubTo = subscribeConnections(user.uid, 'to', (data) => {
      setIncoming(data)
      setLoading(false)
    })
    const unsubFrom = subscribeConnections(user.uid, 'from', (data) => {
      setOutgoing(data)
    })

    return () => { unsubTo(); unsubFrom() }
  }, [user])

  const accept = async (connectionId) => {
    try {
      await respondToConnection(connectionId, 'accepted')
      toast.success('Connection accepted')
    } catch {
      toast.error('Failed to accept connection')
    }
  }

  const decline = async (connectionId) => {
    try {
      await respondToConnection(connectionId, 'declined')
      toast.success('Connection declined')
    } catch {
      toast.error('Failed to decline connection')
    }
  }

  const sendRequest = async (toUid, type, meta = {}) => {
    try {
      await sendConnectionRequest(user.uid, toUid, type, meta)
      toast.success('Connection request sent')
    } catch {
      toast.error('Failed to send request')
    }
  }

  const pendingIncoming = incoming.filter(c => c.status === 'pending')
  const pendingOutgoing = outgoing.filter(c => c.status === 'pending')
  const accepted = [...incoming, ...outgoing].filter(c => c.status === 'accepted')

  return { incoming, outgoing, pendingIncoming, pendingOutgoing, accepted, loading, accept, decline, sendRequest }
}
