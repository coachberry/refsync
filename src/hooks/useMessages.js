import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  subscribeUserThreads,
  subscribeMessages,
  sendMessage,
  markThreadRead,
  startThread,
  getThreadId,
} from '@/services/messaging'

export function useThreads() {
  const { user } = useAuth()
  const [threads, setThreads] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeUserThreads(user.uid, (data) => {
      setThreads(data)
      setLoading(false)
    })
    return unsub
  }, [user])

  const unreadCount = threads.filter(t => t.unread).length

  return { threads, unreadCount, loading }
}

export function useChat(participantId, participantName) {
  const { user, profile } = useAuth()
  const [messages, setMessages]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [sending, setSending]     = useState(false)
  const threadId = user && participantId ? getThreadId(user.uid, participantId) : null

  useEffect(() => {
    if (!threadId) return
    // Ensure thread exists
    startThread(user.uid, profile?.displayName, participantId, participantName)
    const unsub = subscribeMessages(threadId, (msgs) => {
      setMessages(msgs)
      setLoading(false)
      markThreadRead(user.uid, threadId)
    })
    return unsub
  }, [threadId])

  const send = async (text) => {
    if (!text.trim() || !threadId) return
    setSending(true)
    try {
      await sendMessage(threadId, user.uid, profile?.displayName, text, participantId)
    } finally {
      setSending(false)
    }
  }

  return { messages, loading, sending, send, threadId }
}
