/**
 * services/messaging.js
 * Firebase Realtime Database chat service.
 * Thread ID = sorted UIDs joined with '__' (double underscore avoids UID conflicts)
 */
import {
  ref, push, onValue, off, serverTimestamp, update, get, set,
} from 'firebase/database'
import { rtdb } from '@/lib/firebase'

// ── Thread ID ─────────────────────────────────────────────────────────────────
// Use double underscore so we can safely split on it later if needed
export const getThreadId = (uid1, uid2) =>
  [uid1, uid2].sort().join('__')

// ── Send message ──────────────────────────────────────────────────────────────
export const sendMessage = async (threadId, senderId, senderName, text, recipientId) => {
  if (!threadId || !senderId || !text?.trim()) return

  // Push message to thread
  const msgRef = ref(rtdb, `threads/${threadId}/messages`)
  const now = Date.now()
  await push(msgRef, {
    senderId,
    senderName,
    text: text.trim(),
    timestamp: now,   // Use client timestamp — avoids serverTimestamp sort issues
    read: false,
  })

  // Update thread metadata for both sides
  const updates = {}
  updates[`threads/${threadId}/lastMessage`]   = text.trim()
  updates[`threads/${threadId}/lastSender`]    = senderName
  updates[`threads/${threadId}/updatedAt`]     = now

  // Sender's thread entry
  updates[`userThreads/${senderId}/${threadId}/lastMessage`]    = text.trim()
  updates[`userThreads/${senderId}/${threadId}/updatedAt`]      = now
  updates[`userThreads/${senderId}/${threadId}/unread`]         = false

  // Recipient's thread entry — mark unread, preserve participantId/Name
  if (recipientId) {
    updates[`userThreads/${recipientId}/${threadId}/lastMessage`]    = text.trim()
    updates[`userThreads/${recipientId}/${threadId}/updatedAt`]      = now
    updates[`userThreads/${recipientId}/${threadId}/unread`]         = true
    updates[`userThreads/${recipientId}/${threadId}/participantId`]  = senderId
    updates[`userThreads/${recipientId}/${threadId}/participantName`]= senderName
  }

  await update(ref(rtdb), updates)
}

// ── Subscribe to messages in a thread ────────────────────────────────────────
export const subscribeMessages = (threadId, callback) => {
  if (!threadId) return () => {}
  const msgsRef = ref(rtdb, `threads/${threadId}/messages`)
  onValue(msgsRef, (snap) => {
    const msgs = []
    snap.forEach(child => {
      const val = child.val()
      msgs.push({ id: child.key, ...val })
    })
    // Sort by timestamp ascending — using client timestamps (numbers) so this works reliably
    msgs.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0))
    callback(msgs)
  })
  return () => off(msgsRef)
}

// ── Subscribe to user's thread list ──────────────────────────────────────────
export const subscribeUserThreads = (uid, callback) => {
  if (!uid) return () => {}
  const threadRef = ref(rtdb, `userThreads/${uid}`)
  onValue(threadRef, (snap) => {
    const threads = []
    snap.forEach(child => {
      const val = child.val()
      // Only include threads that have a participantId (real conversations)
      if (val?.participantId) {
        threads.push({ id: child.key, ...val })
      }
    })
    // Sort by updatedAt descending
    threads.sort((a, b) => (Number(b.updatedAt) || 0) - (Number(a.updatedAt) || 0))
    callback(threads)
  })
  return () => off(threadRef)
}

// ── Mark thread as read ───────────────────────────────────────────────────────
export const markThreadRead = (uid, threadId) => {
  if (!uid || !threadId) return
  return update(ref(rtdb, `userThreads/${uid}/${threadId}`), { unread: false })
}

// ── Start a thread (idempotent — safe to call multiple times) ─────────────────
export const startThread = async (fromUid, fromName, toUid, toName) => {
  if (!fromUid || !toUid) return null
  const threadId = getThreadId(fromUid, toUid)
  const now = Date.now()

  // Check if thread entries already exist — don't overwrite participantId/Name
  const [fromSnap, toSnap] = await Promise.all([
    get(ref(rtdb, `userThreads/${fromUid}/${threadId}`)),
    get(ref(rtdb, `userThreads/${toUid}/${threadId}`)),
  ])

  const updates = {}

  // Only set participantId/Name if not already set (preserve existing data)
  if (!fromSnap.exists() || !fromSnap.val()?.participantId) {
    updates[`userThreads/${fromUid}/${threadId}/participantId`]   = toUid
    updates[`userThreads/${fromUid}/${threadId}/participantName`] = toName
    updates[`userThreads/${fromUid}/${threadId}/unread`]          = false
    updates[`userThreads/${fromUid}/${threadId}/updatedAt`]       = now
  }

  if (!toSnap.exists() || !toSnap.val()?.participantId) {
    updates[`userThreads/${toUid}/${threadId}/participantId`]   = fromUid
    updates[`userThreads/${toUid}/${threadId}/participantName`] = fromName
    updates[`userThreads/${toUid}/${threadId}/unread`]          = false
    updates[`userThreads/${toUid}/${threadId}/updatedAt`]       = now
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(rtdb), updates)
  }

  return threadId
}
