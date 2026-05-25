import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  subscribeAvailability,
  setAvailabilityBlock,
  deleteAvailabilityBlock,
} from '@/services/firestore'
import toast from 'react-hot-toast'

export function useAvailability() {
  const { user } = useAuth()
  const [blocks, setBlocks] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeAvailability(user.uid, (data) => {
      setBlocks(data)
      setLoading(false)
    })
    return unsub
  }, [user])

  const addBlock = async (block) => {
    try {
      await setAvailabilityBlock(user.uid, block)
      toast.success('Availability saved')
    } catch {
      toast.error('Failed to save availability')
    }
  }

  const removeBlock = async (id) => {
    try {
      await deleteAvailabilityBlock(id)
      toast.success('Availability removed')
    } catch {
      toast.error('Failed to remove availability')
    }
  }

  // Returns true if official has any availability on a given date string (YYYY-MM-DD)
  const isAvailableOn = (dateStr) =>
    blocks.some(b => b.date === dateStr && b.status !== 'off')

  return { blocks, loading, addBlock, removeBlock, isAvailableOn }
}
