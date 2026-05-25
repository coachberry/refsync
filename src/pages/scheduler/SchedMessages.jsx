import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useThreads, useChat } from '@/hooks/useMessages'
import { useRoster } from '@/hooks/useRoster'
import { useGameGroups } from '@/hooks/useGameGroups'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { startThread } from '@/services/messaging'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Textarea, Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './SchedMessages.module.css'

export default function SchedMessages() {
  const { user, profile } = useAuth()
  const { threads, loading } = useThreads()
  const { roster } = useRoster()
  const { groups } = useGameGroups()
  const [activeThread, setActiveThread] = useState(null)
  const [showCompose, setShowCompose]   = useState(false)
  const [showBroadcast, setShowBroadcast] = useState(false)

  const startChat = async (participantId, participantName) => {
    await startThread(user.uid, profile?.displayName, participantId, participantName)
    setActiveThread({ id: null, participantId, participantName })
    setShowCompose(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        {/* Thread list */}
        <div className={[styles.sidebar, activeThread ? styles.sidebarHidden : ''].join(' ')}>
          <div className={styles.sidebarHeader}>
            <h1 className={styles.title}>Messages</h1>
            <div className={styles.composeActions}>
              <Button size="sm" variant="secondary" onClick={() => setShowBroadcast(true)}>📢 Broadcast</Button>
              <Button size="sm" variant="primary"   onClick={() => setShowCompose(true)}>+ New</Button>
            </div>
          </div>

          {loading ? (
            <div className={styles.center}><Spinner /></div>
          ) : threads.length === 0 ? (
            <div className={styles.emptyThreads}>
              <div className={styles.emptyIcon}>💬</div>
              <div className={styles.emptyTitle}>No messages yet</div>
              <div className={styles.emptySub}>Start a conversation with an official on your roster.</div>
            </div>
          ) : (
            threads.map(thread => (
              <div
                key={thread.id}
                className={[
                  styles.threadItem,
                  thread.unread ? styles.unread : '',
                  activeThread?.participantId === thread.participantId ? styles.active : '',
                ].join(' ')}
                onClick={() => setActiveThread(thread)}
              >
                <Avatar name={thread.participantName} size="md" />
                <div className={styles.threadInfo}>
                  <div className={styles.threadName}>{thread.participantName}</div>
                  <div className={styles.threadPreview}>{thread.lastMessage ?? 'No messages yet'}</div>
                </div>
                <div className={styles.threadMeta}>
                  {thread.updatedAt && (
                    <span className={styles.threadTime}>
                      {formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: false })}
                    </span>
                  )}
                  {thread.unread && <div className={styles.unreadDot} />}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Chat window */}
        <div className={[styles.chat, !activeThread ? styles.chatHidden : ''].join(' ')}>
          {activeThread ? (
            <ChatWindow
              thread={activeThread}
              currentUid={user?.uid}
              currentName={profile?.displayName}
              onBack={() => setActiveThread(null)}
            />
          ) : (
            <div className={styles.chatEmpty}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
              <div className={styles.emptyTitle}>Select a conversation</div>
              <div className={styles.emptySub}>Or start a new one with an official on your roster.</div>
            </div>
          )}
        </div>
      </div>

      {/* Compose modal — pick an official to message */}
      <Modal open={showCompose} onClose={() => setShowCompose(false)} title="New Message" size="sm">
        <p className={styles.composeHint}>Select an official from your roster to start a conversation.</p>
        {roster.length === 0 ? (
          <EmptyState icon="👥" title="No officials on your roster yet" />
        ) : (
          <div className={styles.rosterList}>
            {roster.map(o => (
              <div key={o.uid ?? o.id} className={styles.rosterItem} onClick={() => startChat(o.uid ?? o.id, o.displayName)}>
                <Avatar name={o.displayName} size="sm" />
                <div>
                  <div className={styles.rosterName}>{o.displayName}</div>
                  <div className={styles.rosterSub}>{(o.subRoles ?? []).filter(s => ['referee','scorekeeper'].includes(s)).join(', ') || 'Official'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Broadcast modal */}
      <BroadcastModal
        open={showBroadcast}
        onClose={() => setShowBroadcast(false)}
        roster={roster}
        groups={groups}
        schedulerId={user?.uid}
        schedulerName={profile?.displayName}
      />
    </div>
  )
}

// ── Chat window ───────────────────────────────────────────────────────────────
function ChatWindow({ thread, currentUid, currentName, onBack }) {
  const { messages, loading, sending, send } = useChat(thread.participantId, thread.participantName)
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!text.trim()) return
    await send(text)
    setText('')
  }

  const timeStr = (msg) => {
    try {
      const ts = msg.timestamp
      if (!ts) return ''
      const date = typeof ts === 'number' ? new Date(ts) : ts?.toDate?.() ?? new Date(ts)
      return formatDistanceToNow(date, { addSuffix: true })
    } catch { return '' }
  }

  return (
    <div className={styles.chatWrap}>
      <div className={styles.chatHeader}>
        <button className={styles.backBtn} onClick={onBack}>‹</button>
        <Avatar name={thread.participantName} size="sm" />
        <div className={styles.chatHeaderName}>{thread.participantName}</div>
      </div>

      <div className={styles.messages}>
        {loading ? (
          <div className={styles.center}><Spinner color="muted" /></div>
        ) : messages.length === 0 ? (
          <div className={styles.noMessages}>No messages yet — say hello!</div>
        ) : (
          messages.map(msg => {
            const isMe = msg.senderId === currentUid
            return (
              <div key={msg.id} className={[styles.msgRow, isMe ? styles.msgMe : ''].join(' ')}>
                {!isMe && <Avatar name={msg.senderName} size="xs" />}
                <div className={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem].join(' ')}>
                  <div className={styles.bubbleText}>{msg.text}</div>
                  <div className={styles.bubbleTime}>{timeStr(msg)}</div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className={styles.inputRow}>
        <input
          className={styles.inputField}
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
        />
        <Button variant="primary" size="sm" loading={sending} onClick={handleSend}>Send</Button>
      </div>
    </div>
  )
}

// ── Broadcast Modal ───────────────────────────────────────────────────────────
function BroadcastModal({ open, onClose, roster, groups, schedulerId, schedulerName }) {
  const [sending, setSending] = useState(false)
  const [target, setTarget]   = useState('all')   // 'all' | 'group'
  const [groupId, setGroupId] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  // Get officials for a specific group (those assigned to at least one game in it)
  const getTargetOfficials = async () => {
    if (target === 'all') return roster
    if (!groupId) return []
    try {
      const snap = await getDocs(query(collection(db, 'games'), where('groupId', '==', groupId)))
      const uids = new Set()
      snap.docs.forEach(d => (d.data().assignedUids ?? []).forEach(uid => uids.add(uid)))
      return roster.filter(o => uids.has(o.uid ?? o.id))
    } catch { return [] }
  }

  const handleSend = async () => {
    if (!message.trim()) { toast.error('Message is required'); return }
    setSending(true)
    try {
      const officials = await getTargetOfficials()
      if (!officials.length) { toast.error('No officials found for this target'); setSending(false); return }

      // Send individual thread messages to each official
      const { sendMessage, startThread, getThreadId } = await import('@/services/messaging')
      await Promise.all(officials.map(async o => {
        const toUid = o.uid ?? o.id
        const threadId = getThreadId(schedulerId, toUid)
        await startThread(schedulerId, schedulerName, toUid, o.displayName)
        const fullMsg = subject ? `[${subject}]\n\n${message}` : message
        await sendMessage(threadId, schedulerId, schedulerName, fullMsg, toUid)
      }))

      toast.success(`Message sent to ${officials.length} official${officials.length > 1 ? 's' : ''}`)
      setMessage('')
      setSubject('')
      onClose()
    } catch { toast.error('Failed to send broadcast') }
    finally { setSending(false) }
  }

  const selectedGroup = groups.find(g => g.id === groupId)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Broadcast Message"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={sending} onClick={handleSend}>
            Send to {target === 'all' ? `All (${roster.length})` : selectedGroup?.name ?? 'Group'}
          </Button>
        </>
      }
    >
      <div className={styles.broadcastTarget}>
        <label className={styles.broadcastLabel}>Send to</label>
        <div className={styles.targetToggle}>
          <button
            className={[styles.targetBtn, target === 'all' ? styles.targetActive : ''].join(' ')}
            onClick={() => setTarget('all')}
          >
            All Roster ({roster.length})
          </button>
          <button
            className={[styles.targetBtn, target === 'group' ? styles.targetActive : ''].join(' ')}
            onClick={() => setTarget('group')}
          >
            Specific Group
          </button>
        </div>
      </div>

      {target === 'group' && (
        <Select label="Game Group" value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">Select a group…</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      )}

      {target === 'group' && groupId && (
        <div className={styles.groupNote}>
          Message will be sent to all officials assigned to at least one game in <strong>{selectedGroup?.name}</strong>.
        </div>
      )}

      <Input label="Subject (optional)" placeholder="Weekend schedule update" value={subject} onChange={e => setSubject(e.target.value)} />
      <Textarea label="Message *" rows={5} placeholder="Type your message here…" value={message} onChange={e => setMessage(e.target.value)} />
    </Modal>
  )
}
