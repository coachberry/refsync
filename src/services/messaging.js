/**
 * services/messaging.js
 * Uses Firebase Realtime Database for live chat (low latency).
 * Thread IDs are deterministic: sorted UIDs joined with '_'
 */
import {
  ref, push, onValue, off, serverTimestamp,
  update, get,
} from 'firebase/database'
import { rtdb } from '@/lib/firebase'

// ── Thread ID ─────────────────────────────────────────────────────────────────
export const getThreadId = (uid1, uid2) =>
  [uid1, uid2].sort().join('_')

// ── Send message ──────────────────────────────────────────────────────────────
export const sendMessage = async (threadId, senderId, senderName, text, recipientId) => {
  const msgRef = ref(rtdb, `threads/${threadId}/messages`)
  await push(msgRef, {
    senderId, senderName, text,
    timestamp: serverTimestamp(),
    read: false,
  })
  // Update thread metadata
  await update(ref(rtdb, `threads/${threadId}`), {
    lastMessage: text,
    lastSender: senderName,
    updatedAt: serverTimestamp(),
  })
  // Update unread for recipient — recipientId passed explicitly to avoid UID parsing
  if (recipientId) {
    await update(ref(rtdb, `userThreads/${recipientId}/${threadId}`), {
      unread: true, lastMessage: text, updatedAt: serverTimestamp(),
      participantName: senderName,
    })
  }
  await update(ref(rtdb, `userThreads/${senderId}/${threadId}`), {
    unread: false, lastMessage: text, updatedAt: serverTimestamp(),
  })
}

// ── Subscribe to messages in a thread ────────────────────────────────────────
export const subscribeMessages = (threadId, callback) => {
  const msgsRef = ref(rtdb, `threads/${threadId}/messages`)
  onValue(msgsRef, (snap) => {
    const msgs = []
    snap.forEach(child => msgs.push({ id: child.key, ...child.val() }))
    // Sort client-side — server timestamps may not be numbers until after write settles
    msgs.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
    callback(msgs)
  })
  return () => off(msgsRef)
}

// ── Subscribe to user's thread list ──────────────────────────────────────────
export const subscribeUserThreads = (uid, callback) => {
  const threadRef = ref(rtdb, `userThreads/${uid}`)
  onValue(threadRef, (snap) => {
    const threads = []
    snap.forEach(child => threads.push({ id: child.key, ...child.val() }))
    // Sort by updatedAt descending
    threads.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
    callback(threads)
  })
  return () => off(threadRef)
}

// ── Mark thread as read ───────────────────────────────────────────────────────
export const markThreadRead = (uid, threadId) =>
  update(ref(rtdb, `userThreads/${uid}/${threadId}`), { unread: false })

// ── Start a new thread (or get existing) ─────────────────────────────────────
export const startThread = async (fromUid, fromName, toUid, toName) => {
  const threadId = getThreadId(fromUid, toUid)
  await update(ref(rtdb, `userThreads/${fromUid}/${threadId}`), {
    participantId: toUid,
    participantName: toName,
    unread: false,
    updatedAt: serverTimestamp(),
  })
  await update(ref(rtdb, `userThreads/${toUid}/${threadId}`), {
    participantId: fromUid,
    participantName: fromName,
    unread: false,
    updatedAt: serverTimestamp(),
  })
  return threadId
}
