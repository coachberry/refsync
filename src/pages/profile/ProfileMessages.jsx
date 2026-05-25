import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useThreads } from '@/hooks/useMessages'
import { useRoster } from '@/hooks/useRoster'
import { useGameGroups } from '@/hooks/useGameGroups'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import {
  subscribeMessages, sendMessage, markThreadRead,
  startThread, getThreadId,
} from '@/services/messaging'
import { ref, remove } from 'firebase/database'
import { rtdb } from '@/lib/firebase'
import { Input, Textarea, Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './ProfileMessages.module.css'

export default function ProfileMessages() {
  const { user, profile } = useAuth()
  const { isReferee, isScorekeeper, isRefScheduler, isSKScheduler, isAnyScheduler } = useSubRoles()
  const { threads, loading: threadsLoading } = useThreads()
  const { roster } = useRoster()
  const { groups } = useGameGroups()
  const [activeThread, setActiveThread] = useState(null)
  const [showCompose, setShowCompose]   = useState(false)
  const [showBroadcast, setShowBroadcast] = useState(false)

  const roles = profile?.roles ?? []
  const isOfficial  = roles.includes('official')
  const isScheduler = roles.includes('scheduler')
  const isDirector  = roles.includes('director')
  const canBroadcast = isScheduler

  const handleStartThread = async (participantId, participantName) => {
    if (!user || !participantId) return
    const threadId = await startThread(user.uid, profile?.displayName, participantId, participantName)
    setActiveThread({ id: threadId, participantId, participantName })
    setShowCompose(false)
  }

  return (
    <div className={styles.page}>
      <div className={styles.layout}>

        {/* ── Thread list sidebar ── */}
        <div className={[styles.sidebar, activeThread ? styles.sidebarHiddenMobile : ''].join(' ')}>
          <div className={styles.sidebarTop}>
            <h1 className={styles.title}>Messages</h1>
            <div className={styles.topActions}>
              {canBroadcast && (
                <button className={styles.broadcastBtn} onClick={() => setShowBroadcast(true)} title="Broadcast to officials">
                  📢
                </button>
              )}
              <Button size="sm" variant="primary" onClick={() => setShowCompose(true)}>+ New</Button>
            </div>
          </div>

          <div className={styles.threadList}>
            {threadsLoading ? (
              <div className={styles.center}><Spinner color="muted" /></div>
            ) : threads.length === 0 ? (
              <div className={styles.emptyThreads}>
                <div className={styles.emptyIcon}>💬</div>
                <div className={styles.emptyTitle}>No messages yet</div>
                <div className={styles.emptySub}>Start a conversation using the + New button above.</div>
              </div>
            ) : (
              threads.map(thread => (
                <ThreadItem
                  key={thread.id}
                  thread={thread}
                  isActive={activeThread?.id === thread.id}
                  onClick={() => {
                    console.log('Thread clicked:', thread)
                    setActiveThread(thread)
                  }}
                />
              ))
            )}
          </div>
        </div>

        {/* ── Chat area ── */}
        <div className={[styles.chatArea, !activeThread ? styles.chatAreaHiddenMobile : ''].join(' ')}>
          {activeThread ? (
            <ChatPane
              key={activeThread.participantId}
              thread={activeThread}
              currentUid={user?.uid}
              currentName={profile?.displayName}
              onBack={() => setActiveThread(null)}
            />
          ) : (
            <div className={styles.chatEmpty}>
              <div className={styles.chatEmptyIcon}>💬</div>
              <div className={styles.chatEmptyTitle}>Select a conversation</div>
              <div className={styles.chatEmptySub}>Choose from the list or start a new message.</div>
            </div>
          )}
        </div>
      </div>

      {/* Compose modal */}
      <ComposeModal
        open={showCompose}
        onClose={() => setShowCompose(false)}
        roster={roster}
        roles={roles}
        isScheduler={isScheduler}
        isDirector={isDirector}
        isOfficial={isOfficial}
        currentUid={user?.uid}
        currentName={profile?.displayName}
        onStart={handleStartThread}
      />

      {/* Broadcast modal — schedulers only */}
      {canBroadcast && (
        <BroadcastModal
          open={showBroadcast}
          onClose={() => setShowBroadcast(false)}
          roster={roster}
          groups={groups}
          schedulerId={user?.uid}
          schedulerName={profile?.displayName}
        />
      )}
    </div>
  )
}

// ── Thread item ───────────────────────────────────────────────────────────────
function ThreadItem({ thread, isActive, onClick }) {
  const timeAgo = thread.updatedAt
    ? formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: false })
    : ''

  return (
    <div
      className={[styles.threadItem, isActive ? styles.threadActive : '', thread.unread ? styles.threadUnread : ''].join(' ')}
      onClick={onClick}
    >
      <Avatar name={thread.participantName ?? '?'} size="md" />
      <div className={styles.threadInfo}>
        <div className={styles.threadName}>{thread.participantName ?? 'Unknown'}</div>
        <div className={styles.threadPreview}>{thread.lastMessage ?? 'No messages yet'}</div>
      </div>
      <div className={styles.threadMeta}>
        {timeAgo && <span className={styles.threadTime}>{timeAgo}</span>}
        {thread.unread && <div className={styles.unreadDot} />}
      </div>
    </div>
  )
}

// ── Chat pane ─────────────────────────────────────────────────────────────────
function ChatPane({ thread, currentUid, currentName, onBack }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading]   = useState(true)
  const [text, setText]         = useState('')
  const [sending, setSending]   = useState(false)
  const bottomRef = useRef(null)

  // thread.id is the RTDB key = the thread ID
  // Fallback: compute from currentUid + participantId
  const threadId = thread.id
    || (currentUid && thread.participantId ? getThreadId(currentUid, thread.participantId) : null)
  const participantId = thread.participantId

  console.log('ChatPane rendering:', { threadId, participantId, thread })

  useEffect(() => {
    if (!threadId) return
    setLoading(true)
    setMessages([])
    const unsub = subscribeMessages(threadId, (msgs) => {
      setMessages(msgs)
      setLoading(false)
      if (currentUid) markThreadRead(currentUid, threadId)
    })
    return unsub
  }, [threadId])

  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSend = async () => {
    if (!text.trim() || !threadId || !currentUid) return
    setSending(true)
    try {
      await sendMessage(threadId, currentUid, currentName, text, participantId)
      setText('')
    } catch { toast.error('Failed to send') }
    finally { setSending(false) }
  }

  const handleDelete = async (msgId) => {
    if (!threadId || !msgId) return
    try {
      await remove(ref(rtdb, `threads/${threadId}/messages/${msgId}`))
    } catch { toast.error('Failed to delete message') }
  }

  const timeStr = (msg) => {
    try {
      const ts = msg.timestamp
      if (!ts) return ''
      const date = typeof ts === 'number' ? new Date(ts) : new Date(ts)
      return formatDistanceToNow(date, { addSuffix: true })
    } catch { return '' }
  }

  return (
    <div className={styles.chatPane}>
      {/* Header */}
      <div className={styles.chatHeader}>
        <button className={styles.backBtn} onClick={onBack}>‹</button>
        <Avatar name={thread.participantName} size="sm" />
        <div className={styles.chatHeaderName}>{thread.participantName}</div>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {loading ? (
          <div className={styles.center}><Spinner color="muted" /></div>
        ) : messages.length === 0 ? (
          <div className={styles.noMessages}>No messages yet — say hello! 👋</div>
        ) : (
          messages.map(msg => {
            const isMe = msg.senderId === currentUid
            return (
              <div key={msg.id} className={[styles.msgRow, isMe ? styles.msgMe : styles.msgThem].join(' ')}>
                {!isMe && <Avatar name={msg.senderName} size="xs" />}
                <div className={styles.bubbleWrap}>
                  <div className={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem].join(' ')}>
                    {!isMe && <div className={styles.senderName}>{msg.senderName}</div>}
                    <div className={styles.bubbleText}>{msg.text}</div>
                    <div className={styles.bubbleTime}>{timeStr(msg)}</div>
                  </div>
                  {isMe && (
                    <button className={styles.deleteMsg} onClick={() => handleDelete(msg.id)} title="Delete message">✕</button>
                  )}
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <input
          className={styles.inputField}
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          autoFocus
        />
        <Button variant="primary" loading={sending} onClick={handleSend}>Send</Button>
      </div>
    </div>
  )
}

// ── Compose modal ─────────────────────────────────────────────────────────────
function ComposeModal({ open, onClose, roster, roles, isScheduler, isDirector, isOfficial, currentUid, currentName, onStart }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults]       = useState([])
  const [searching, setSearching]   = useState(false)

  // Who can this user message?
  // Official → Schedulers on their roster
  // Scheduler → Officials on roster + Directors they're connected to
  // Director → Schedulers they're connected to

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      const { searchUsers } = await import('@/services/firestore')
      // Search across relevant roles
      const searchRoles = []
      if (isOfficial || isScheduler)  searchRoles.push('scheduler')
      if (isScheduler || isDirector)  searchRoles.push('director')
      if (isScheduler)                searchRoles.push('official')

      const allResults = await Promise.all(searchRoles.map(r => searchUsers(r, searchTerm)))
      const flat = allResults.flat().filter(u => u.uid !== currentUid)
      // Deduplicate
      const seen = new Set()
      setResults(flat.filter(u => { if (seen.has(u.uid)) return false; seen.add(u.uid); return true }))
    } catch { toast.error('Search failed') }
    finally { setSearching(false) }
  }

  // Always show roster as quick picks
  const quickPicks = roster.slice(0, 6)

  return (
    <Modal open={open} onClose={onClose} title="New Message" size="sm"
      footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}
    >
      {quickPicks.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div className={styles.composeLabel}>From your roster</div>
          <div className={styles.quickPicks}>
            {quickPicks.map(o => (
              <div key={o.uid ?? o.id} className={styles.pickItem} onClick={() => onStart(o.uid ?? o.id, o.displayName)}>
                <Avatar name={o.displayName} size="sm" />
                <span className={styles.pickName}>{o.displayName}</span>
              </div>
            ))}
          </div>
          <div className={styles.composeDivider}>or search</div>
        </div>
      )}
      <div className={styles.searchRow}>
        <Input label="Search by name" placeholder="Search users…" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
        <Button variant="secondary" loading={searching} onClick={handleSearch} style={{ marginTop: 22, flexShrink: 0 }}>Search</Button>
      </div>
      {results.map(u => (
        <div key={u.uid} className={styles.pickItem} onClick={() => onStart(u.uid, u.displayName)}>
          <Avatar name={u.displayName} size="sm" />
          <div>
            <div className={styles.pickName}>{u.displayName}</div>
            <div className={styles.pickSub}>{u.roles?.join(', ')}</div>
          </div>
        </div>
      ))}
    </Modal>
  )
}

// ── Broadcast modal ───────────────────────────────────────────────────────────
function BroadcastModal({ open, onClose, roster, groups, schedulerId, schedulerName }) {
  const [sending, setSending] = useState(false)
  const [target, setTarget]   = useState('all')
  const [groupId, setGroupId] = useState('')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')

  const handleSend = async () => {
    if (!message.trim()) { toast.error('Message is required'); return }
    setSending(true)
    try {
      let officials = roster
      if (target === 'group' && groupId) {
        const snap = await getDocs(query(collection(db, 'games'), where('groupId', '==', groupId)))
        const uids = new Set()
        snap.docs.forEach(d => (d.data().assignedUids ?? []).forEach(uid => uids.add(uid)))
        officials = roster.filter(o => uids.has(o.uid ?? o.id))
      }
      if (!officials.length) { toast.error('No officials found'); setSending(false); return }

      const fullMsg = subject ? `📢 [${subject}]\n\n${message}` : `📢 ${message}`
      await Promise.all(officials.map(async o => {
        const toUid = o.uid ?? o.id
        const threadId = getThreadId(schedulerId, toUid)
        await startThread(schedulerId, schedulerName, toUid, o.displayName)
        await sendMessage(threadId, schedulerId, schedulerName, fullMsg, toUid)
      }))

      toast.success(`Broadcast sent to ${officials.length} official${officials.length > 1 ? 's' : ''}`)
      setMessage(''); setSubject(''); onClose()
    } catch { toast.error('Failed to send broadcast') }
    finally { setSending(false) }
  }

  const selectedGroup = groups.find(g => g.id === groupId)

  return (
    <Modal open={open} onClose={onClose} title="📢 Broadcast to Officials" size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={sending} onClick={handleSend}>Send Broadcast</Button></>}
    >
      <div className={styles.broadcastTargetRow}>
        {[{ id:'all', label:`All Roster (${roster.length})` }, { id:'group', label:'Specific Group' }].map(t => (
          <button key={t.id} className={[styles.targetBtn, target === t.id ? styles.targetActive : ''].join(' ')} onClick={() => setTarget(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {target === 'group' && (
        <Select label="Game Group" value={groupId} onChange={e => setGroupId(e.target.value)}>
          <option value="">Select a group…</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      )}
      {target === 'group' && groupId && (
        <p className={styles.groupNote}>Sends to all officials assigned to at least one game in <strong>{selectedGroup?.name}</strong>.</p>
      )}
      <Input label="Subject (optional)" placeholder="Weekend schedule update" value={subject} onChange={e => setSubject(e.target.value)} />
      <Textarea label="Message *" rows={5} placeholder="Type your message here…" value={message} onChange={e => setMessage(e.target.value)} />
      <p className={styles.broadcastNote}>📢 Broadcast messages are one-way. Officials will see them in their inbox but cannot reply to the broadcast thread.</p>
    </Modal>
  )
}
