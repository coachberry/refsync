/**
 * services/messaging.js
 * Simple, reliable RTDB messaging.
 * Thread ID = sorted UIDs joined with '_'
 * Messages stored at: threads/{threadId}/messages/{msgId}
 * Thread metadata at: userThreads/{uid}/{threadId}
 */
import { ref, push, onValue, off, update, get } from 'firebase/database'
import { rtdb } from '@/lib/firebase'

// ── Thread ID — deterministic, same for both users ────────────────────────────
export const getThreadId = (uid1, uid2) =>
  [uid1, uid2].sort().join('_')

// ── Send a message ────────────────────────────────────────────────────────────
export const sendMessage = async (threadId, senderId, senderName, text, recipientId) => {
  if (!threadId || !senderId || !text?.trim()) return

  const now = Date.now()
  const msgData = {
    senderId,
    senderName,
    text: text.trim(),
    timestamp: now,
    read: false,
  }

  // Write message + update metadata in one atomic update
  const updates = {}

  // The message itself
  const newMsgKey = `threads/${threadId}/messages/${now}_${Math.random().toString(36).slice(2, 7)}`
  updates[newMsgKey] = msgData

  // Thread metadata
  updates[`threads/${threadId}/lastMessage`]  = text.trim()
  updates[`threads/${threadId}/lastSender`]   = senderName
  updates[`threads/${threadId}/updatedAt`]    = now

  // Sender side — mark as read (they just sent it)
  updates[`userThreads/${senderId}/${threadId}/lastMessage`]    = text.trim()
  updates[`userThreads/${senderId}/${threadId}/updatedAt`]      = now
  updates[`userThreads/${senderId}/${threadId}/unread`]         = false
  updates[`userThreads/${senderId}/${threadId}/participantId`]  = recipientId

  // Recipient side — mark as unread
  if (recipientId) {
    updates[`userThreads/${recipientId}/${threadId}/lastMessage`]    = text.trim()
    updates[`userThreads/${recipientId}/${threadId}/updatedAt`]      = now
    updates[`userThreads/${recipientId}/${threadId}/unread`]         = true
    updates[`userThreads/${recipientId}/${threadId}/participantId`]  = senderId
    updates[`userThreads/${recipientId}/${threadId}/participantName`]= senderName
  }

  await update(ref(rtdb), updates)
}

// ── Subscribe to all messages in a thread ─────────────────────────────────────
export const subscribeMessages = (threadId, callback) => {
  if (!threadId) { callback([]); return () => {} }

  const msgsRef = ref(rtdb, `threads/${threadId}/messages`)
  onValue(msgsRef, (snap) => {
    const msgs = []
    snap.forEach(child => {
      msgs.push({ id: child.key, ...child.val() })
    })
    // Sort by timestamp
    msgs.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0))
    callback(msgs)
  })
  return () => off(msgsRef)
}

// ── Subscribe to a user's thread list ────────────────────────────────────────
export const subscribeUserThreads = (uid, callback) => {
  if (!uid) { callback([]); return () => {} }

  const userThreadsRef = ref(rtdb, `userThreads/${uid}`)
  onValue(userThreadsRef, (snap) => {
    const threads = []
    snap.forEach(child => {
      const val = child.val()
      if (val && val.participantId) {
        threads.push({ id: child.key, ...val })
      }
    })
    // Sort newest first
    threads.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
    callback(threads)
  })
  return () => off(userThreadsRef)
}

// ── Mark a thread as read ─────────────────────────────────────────────────────
export const markThreadRead = (uid, threadId) => {
  if (!uid || !threadId) return Promise.resolve()
  return update(ref(rtdb, `userThreads/${uid}/${threadId}`), { unread: false })
}

// ── Initialize a thread between two users ────────────────────────────────────
// Safe to call multiple times — uses update() not set() so never overwrites messages
export const startThread = async (fromUid, fromName, toUid, toName) => {
  if (!fromUid || !toUid) return null

  const threadId = getThreadId(fromUid, toUid)
  const now = Date.now()

  const updates = {}

  // Always write participantId/Name for both sides so thread list shows correctly
  updates[`userThreads/${fromUid}/${threadId}/participantId`]   = toUid
  updates[`userThreads/${fromUid}/${threadId}/participantName`] = toName
  if (!updates[`userThreads/${fromUid}/${threadId}/updatedAt`]) {
    updates[`userThreads/${fromUid}/${threadId}/updatedAt`] = now
  }
  if (!updates[`userThreads/${fromUid}/${threadId}/unread`]) {
    updates[`userThreads/${fromUid}/${threadId}/unread`] = false
  }

  updates[`userThreads/${toUid}/${threadId}/participantId`]   = fromUid
  updates[`userThreads/${toUid}/${threadId}/participantName`] = fromName
  if (!updates[`userThreads/${toUid}/${threadId}/updatedAt`]) {
    updates[`userThreads/${toUid}/${threadId}/updatedAt`] = now
  }
  if (!updates[`userThreads/${toUid}/${threadId}/unread`]) {
    updates[`userThreads/${toUid}/${threadId}/unread`] = false
  }

  await update(ref(rtdb), updates)
  return threadId
}
