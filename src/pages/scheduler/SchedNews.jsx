import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRoster } from '@/hooks/useRoster'
import { db } from '@/lib/firebase'
import {
  collection, query, where, onSnapshot, addDoc,
  updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore'
import { useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Textarea, Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { Avatar } from '@/components/ui/Avatar'
import { format, formatDistanceToNow } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './SchedNews.module.css'

const POST_TYPES = [
  { value: 'announcement', label: '📢 Announcement', color: 'var(--blue)' },
  { value: 'schedule',     label: '📅 Schedule Update', color: 'var(--teal)' },
  { value: 'payment',      label: '💰 Payment Update', color: 'var(--green)' },
  { value: 'reminder',     label: '⏰ Reminder', color: 'var(--amber)' },
  { value: 'urgent',       label: '🚨 Urgent', color: 'var(--red)' },
]

const TYPE_META = Object.fromEntries(POST_TYPES.map(t => [t.value, t]))

export default function SchedNews() {
  const { user, profile } = useAuth()
  const { roster } = useRoster()
  const [posts, setPosts]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [editPost, setEditPost]   = useState(null)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'news'), where('schedulerId', '==', user.uid))
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setPosts(data)
      setLoading(false)
    })
    return unsub
  }, [user])

  const handleDelete = async (post) => {
    if (!window.confirm(`Delete "${post.title}"?`)) return
    setDeletingId(post.id)
    try {
      await deleteDoc(doc(db, 'news', post.id))
      toast.success('Post deleted')
    } catch { toast.error('Failed to delete') }
    finally { setDeletingId(null) }
  }

  const handlePin = async (post) => {
    try {
      await updateDoc(doc(db, 'news', post.id), { pinned: !post.pinned })
      toast.success(post.pinned ? 'Unpinned' : 'Pinned to top')
    } catch { toast.error('Failed to update') }
  }

  const pinnedPosts  = posts.filter(p => p.pinned)
  const regularPosts = posts.filter(p => !p.pinned)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>News & Announcements</h1>
          <p className={styles.sub}>Posts visible to all officials on your roster ({roster.length} officials)</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreate(true)}>+ New Post</Button>
      </div>

      {loading ? (
        <div className={styles.center}><Spinner size="lg" /></div>
      ) : posts.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon="📢"
              title="No posts yet"
              message="Post announcements, schedule updates, and reminders for your officials."
              action={{ label: '+ New Post', onClick: () => setShowCreate(true) }}
            />
          </CardBody>
        </Card>
      ) : (
        <div className={styles.postList}>
          {/* Pinned posts */}
          {pinnedPosts.length > 0 && (
            <>
              <div className={styles.sectionLabel}>📌 Pinned</div>
              {pinnedPosts.map(post => (
                <PostCard key={post.id} post={post} onDelete={handleDelete} onPin={handlePin} onEdit={() => setEditPost(post)} deletingId={deletingId} />
              ))}
              {regularPosts.length > 0 && <div className={styles.sectionLabel}>Recent</div>}
            </>
          )}
          {regularPosts.map(post => (
            <PostCard key={post.id} post={post} onDelete={handleDelete} onPin={handlePin} onEdit={() => setEditPost(post)} deletingId={deletingId} />
          ))}
        </div>
      )}

      <PostModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        schedulerId={user?.uid}
        schedulerName={profile?.displayName}
      />
      {editPost && (
        <PostModal
          open={!!editPost}
          onClose={() => setEditPost(null)}
          schedulerId={user?.uid}
          schedulerName={profile?.displayName}
          existing={editPost}
        />
      )}
    </div>
  )
}

// ── Post card ─────────────────────────────────────────────────────────────────
function PostCard({ post, onDelete, onPin, onEdit, deletingId }) {
  const meta = TYPE_META[post.type] ?? TYPE_META.announcement
  const createdAt = post.createdAt?.toDate?.() ?? (post.createdAt ? new Date(post.createdAt) : null)

  return (
    <div className={[styles.postCard, post.pinned ? styles.postPinned : ''].join(' ')} style={{ '--post-color': meta.color }}>
      <div className={styles.postHeader}>
        <div className={styles.postType} style={{ color: meta.color, background: `${meta.color}15` }}>
          {meta.label}
        </div>
        {post.pinned && <span className={styles.pinBadge}>📌 Pinned</span>}
        <div className={styles.postActions}>
          <button className={styles.actionBtn} onClick={() => onPin(post)} title={post.pinned ? 'Unpin' : 'Pin to top'}>
            {post.pinned ? '📌' : '📍'}
          </button>
          <button className={styles.actionBtn} onClick={() => onEdit(post)} title="Edit">✏️</button>
          <button className={styles.actionBtn} style={{ color: 'var(--red)' }} onClick={() => onDelete(post)} title="Delete">🗑️</button>
        </div>
      </div>
      <div className={styles.postTitle}>{post.title}</div>
      <div className={styles.postBody}>{post.body}</div>
      <div className={styles.postFooter}>
        <span>{createdAt ? formatDistanceToNow(createdAt, { addSuffix: true }) : ''}</span>
        {post.audience === 'all' ? <span>👥 All roster</span> : <span>👤 {post.audience}</span>}
      </div>
    </div>
  )
}

// ── Post modal ────────────────────────────────────────────────────────────────
function PostModal({ open, onClose, schedulerId, schedulerName, existing }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title:    existing?.title    ?? '',
    body:     existing?.body     ?? '',
    type:     existing?.type     ?? 'announcement',
    audience: existing?.audience ?? 'all',
    pinned:   existing?.pinned   ?? false,
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('Title is required'); return }
    if (!form.body.trim())  { toast.error('Body is required');  return }
    setSaving(true)
    try {
      if (existing) {
        await updateDoc(doc(db, 'news', existing.id), {
          ...form, updatedAt: serverTimestamp(),
        })
        toast.success('Post updated!')
      } else {
        await addDoc(collection(db, 'news'), {
          ...form, schedulerId, schedulerName,
          createdAt: serverTimestamp(),
        })
        toast.success('Post published!')
      }
      onClose()
    } catch { toast.error('Failed to save post') }
    finally { setSaving(false) }
  }

  const meta = TYPE_META[form.type] ?? TYPE_META.announcement

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Edit Post' : 'New Announcement'}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            {existing ? 'Save Changes' : 'Publish'}
          </Button>
        </>
      }
    >
      {/* Type selector */}
      <div style={{ marginBottom: 14 }}>
        <label style={labelSt}>Post Type</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          {POST_TYPES.map(t => (
            <div
              key={t.value}
              onClick={() => set('type', t.value)}
              style={{
                padding: '9px 12px', borderRadius: 'var(--radius)',
                border: `2px solid ${form.type === t.value ? t.color : 'var(--color-border)'}`,
                background: form.type === t.value ? `${t.color}10` : 'var(--color-surface)',
                cursor: 'pointer', fontSize: 13, fontWeight: 600, transition: 'all .12s',
              }}
            >
              {t.label}
            </div>
          ))}
        </div>
      </div>

      <Input label="Title *" placeholder="e.g. Weekend Game Schedule" value={form.title} onChange={e => set('title', e.target.value)} />
      <Textarea label="Body *" rows={5} placeholder="Write your announcement here…" value={form.body} onChange={e => set('body', e.target.value)} />

      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={form.pinned} onChange={e => set('pinned', e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--blue)' }} />
          📌 Pin to top of news feed
        </label>
      </div>

      {/* Preview */}
      <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius)', padding: 14, border: `2px solid ${meta.color}25` }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--color-muted)', marginBottom: 6 }}>Preview</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: meta.color, marginBottom: 5 }}>{meta.label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 5 }}>{form.title || 'Your title here'}</div>
        <div style={{ fontSize: 13, color: 'var(--color-text-2)', lineHeight: 1.5 }}>{form.body || 'Your announcement body here…'}</div>
      </div>
    </Modal>
  )
}

const labelSt = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }
