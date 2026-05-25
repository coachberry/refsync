import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, onSnapshot, limit } from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { Card, CardBody, Badge, EmptyState } from '@/components/ui'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { Avatar } from '@/components/ui/Avatar'
import styles from './OfficialNews.module.css'

const TYPE_META = {
  announcement: { label: '📢 Announcement', color: 'var(--blue)' },
  schedule:     { label: '📅 Schedule Update', color: 'var(--teal)' },
  payment:      { label: '💰 Payment Update', color: 'var(--green)' },
  reminder:     { label: '⏰ Reminder', color: 'var(--amber)' },
  urgent:       { label: '🚨 Urgent', color: 'var(--red)' },
}

export default function OfficialNews() {
  const { user } = useAuth()
  const [posts, setPosts]           = useState([])
  const [loading, setLoading]       = useState(true)
  const [schedulerIds, setSchedulerIds] = useState([])

  // Step 1 — get all accepted scheduler connections
  useEffect(() => {
    if (!user) return
    const q = query(
      collection(db, 'connections'),
      where('toUid',  '==', user.uid),
      where('type',   '==', 'scheduler-official'),
      where('status', '==', 'accepted')
    )
    getDocs(q).then(snap => {
      const ids = snap.docs.map(d => d.data().fromUid).filter(Boolean)
      setSchedulerIds(ids)
    })
  }, [user])

  // Step 2 — subscribe to news from those schedulers
  useEffect(() => {
    if (!schedulerIds.length) { setLoading(false); return }
    // Firestore 'in' supports up to 30 values
    const chunks = []
    for (let i = 0; i < schedulerIds.length; i += 10) {
      chunks.push(schedulerIds.slice(i, i + 10))
    }
    const unsubscribers = chunks.map(chunk => {
      const q = query(
        collection(db, 'news'),
        where('schedulerId', 'in', chunk),
        limit(50)
      )
      return onSnapshot(q, snap => {
        setPosts(prev => {
          const newPosts = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          const otherChunkPosts = prev.filter(p => !chunk.includes(p.schedulerId))
          const combined = [...otherChunkPosts, ...newPosts]
          combined.sort((a, b) => {
            if (a.pinned && !b.pinned) return -1
            if (!a.pinned && b.pinned) return 1
            return (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
          })
          return combined
        })
        setLoading(false)
      })
    })
    return () => unsubscribers.forEach(u => u())
  }, [schedulerIds.join(',')])

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>News & Updates</h1>
        <p className={styles.sub}>Announcements from your schedulers</p>
      </div>

      {posts.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon="📢"
              title="No announcements yet"
              message={schedulerIds.length === 0
                ? "Join a roster to see news and updates from your scheduler."
                : "Your schedulers haven't posted any announcements yet."
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className={styles.postList}>
          {posts.map(post => {
            const meta = TYPE_META[post.type] ?? TYPE_META.announcement
            const createdAt = post.createdAt?.toDate?.() ?? (post.createdAt ? new Date(post.createdAt) : null)
            return (
              <div
                key={post.id}
                className={[styles.postCard, post.pinned ? styles.pinned : '', post.type === 'urgent' ? styles.urgent : ''].join(' ')}
                style={{ '--post-color': meta.color }}
              >
                {post.pinned && <div className={styles.pinnedBanner}>📌 Pinned</div>}
                <div className={styles.postHeader}>
                  <div className={styles.postType} style={{ color: meta.color, background: `${meta.color}15` }}>
                    {meta.label}
                  </div>
                  {createdAt && (
                    <span className={styles.postTime}>
                      {formatDistanceToNow(createdAt, { addSuffix: true })}
                    </span>
                  )}
                </div>
                <div className={styles.postTitle}>{post.title}</div>
                <div className={styles.postBody}>{post.body}</div>
                <div className={styles.postFrom}>
                  <Avatar name={post.schedulerName ?? 'Scheduler'} size="xs" />
                  <span>{post.schedulerName ?? 'Your Scheduler'}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
