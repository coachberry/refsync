import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useThreads, useChat } from '@/hooks/useMessages'
import { Avatar } from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { formatDistanceToNow } from 'date-fns'
import styles from './OfficialInbox.module.css'

export default function OfficialInbox() {
  const { user } = useAuth()
  const { threads, loading } = useThreads()
  const [activeThread, setActiveThread] = useState(null)

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        {/* Thread list */}
        <div className={[styles.threadList, activeThread ? styles.threadListHidden : ''].join(' ')}>
          <div className={styles.threadListHeader}>
            <h1 className={styles.title}>Inbox</h1>
            <Button size="sm" variant="primary">+ New Message</Button>
          </div>
          {threads.length === 0 ? (
            <div className={styles.emptyThreads}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>💬</div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>No messages yet</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>Messages from schedulers and other officials will appear here.</div>
            </div>
          ) : (
            threads.map(thread => (
              <div
                key={thread.id}
                className={[styles.threadItem, thread.unread ? styles.threadUnread : '', activeThread?.id === thread.id ? styles.threadActive : ''].join(' ')}
                onClick={() => setActiveThread(thread)}
              >
                <Avatar name={thread.participantName ?? '?'} size="md" />
                <div className={styles.threadInfo}>
                  <div className={styles.threadName}>{thread.participantName ?? 'Unknown'}</div>
                  <div className={styles.threadPreview}>{thread.lastMessage ?? 'No messages yet'}</div>
                </div>
                <div className={styles.threadMeta}>
                  {thread.updatedAt && (
                    <span className={styles.threadTime}>
                      {formatDistanceToNow(new Date(thread.updatedAt), { addSuffix: false })}
                    </span>
                  )}
                  {thread.unread && <div className={styles.threadDot} />}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Chat window */}
        <div className={[styles.chatWindow, !activeThread ? styles.chatWindowHidden : ''].join(' ')}>
          {activeThread ? (
            <ChatWindow
              thread={activeThread}
              currentUid={user?.uid}
              onBack={() => setActiveThread(null)}
            />
          ) : (
            <div className={styles.chatEmpty}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Select a conversation</div>
              <div style={{ fontSize: 13, color: 'var(--color-muted)' }}>Choose a thread from the left to start messaging.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ChatWindow({ thread, currentUid, onBack }) {
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
    <div className={styles.chat}>
      {/* Chat header */}
      <div className={styles.chatHeader}>
        <button className={styles.backBtn} onClick={onBack}>‹</button>
        <Avatar name={thread.participantName} size="sm" />
        <div className={styles.chatHeaderInfo}>
          <div className={styles.chatHeaderName}>{thread.participantName}</div>
        </div>
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {loading ? (
          <div className={styles.center}><Spinner color="muted" /></div>
        ) : messages.length === 0 ? (
          <div className={styles.noMessages}>No messages yet. Say hello!</div>
        ) : (
          messages.map(msg => {
            const isMe = msg.senderId === currentUid
            return (
              <div key={msg.id} className={[styles.msgRow, isMe ? styles.msgRowMe : ''].join(' ')}>
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

      {/* Input */}
      <div className={styles.chatInput}>
        <input
          className={styles.chatInputField}
          placeholder="Type a message…"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
        />
        <Button variant="primary" size="sm" loading={sending} onClick={handleSend}>
          Send
        </Button>
      </div>
    </div>
  )
}
