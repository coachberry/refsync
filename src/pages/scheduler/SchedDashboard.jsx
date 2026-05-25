import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useGameGroups } from '@/hooks/useGameGroups'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, addDoc, limit, serverTimestamp } from 'firebase/firestore'
import { sendConnectionRequest } from '@/services/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { Avatar } from '@/components/ui/Avatar'
import { Input, Textarea } from '@/components/ui/Input'
import PendingConnections from '@/components/PendingConnections'
import styles from './SchedDashboard.module.css'

export default function SchedDashboard() {
  const { user, profile } = useAuth()
  const { isRefScheduler, isSKScheduler, isBothScheduler } = useSubRoles()
  const { groups, loading: groupsLoading } = useGameGroups()
  const navigate = useNavigate()
  const [showFindDirector, setShowFindDirector] = useState(false)

  const totalOpen  = groups.reduce((s, g) => s + ((g.totalGames ?? 0) - (g.filledGames ?? 0)), 0)
  const totalGames = groups.reduce((s, g) => s + (g.totalGames ?? 0), 0)

  const roleLabel = isBothScheduler
    ? 'Referee & Scorekeeper Scheduler'
    : isRefScheduler ? 'Referee Scheduler' : 'Scorekeeper Scheduler'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.sub}>Welcome back, {profile?.displayName?.split(' ')[0]} · {roleLabel}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={() => setShowFindDirector(true)}>🔍 Find a Director</Button>
          <Button variant="primary"   onClick={() => navigate('/scheduler/groups')}>View Game Groups</Button>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <StatCard icon="📋" label="Active Groups"   value={groups.length} />
        <StatCard icon="🏒" label="Total Games"     value={totalGames} />
        <StatCard icon="⚠️" label="Open / Unfilled" value={totalOpen} />
        <StatCard icon="👥" label="Roster Size"     value="—" />
      </div>

      {/* Pending connections — directors, officials */}
      <PendingConnections filterTypes={['director-scheduler', 'scheduler-director', 'scheduler-official']} />

      {/* Recent game groups */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Game Groups</CardTitle>
          <Button size="sm" variant="ghost" onClick={() => navigate('/scheduler/groups')}>View all</Button>
        </CardHeader>
        <CardBody noPadding>
          {groupsLoading ? (
            <div className={styles.center}><Spinner /></div>
          ) : groups.length === 0 ? (
            <EmptyState icon="📋" title="No game groups yet"
              message="Game groups will appear here when directors assign you to events." />
          ) : (
            groups.slice(0, 5).map(g => (
              <div key={g.id} className={styles.groupRow}>
                <div className={styles.groupInfo}>
                  <div className={styles.groupName}>{g.name}</div>
                  <div className={styles.groupMeta}>{g.directorName ?? 'Director'} · {g.sport ?? 'Hockey'}</div>
                </div>
                <div className={styles.groupFill}>
                  <div className={styles.fillBar}>
                    <div className={styles.fillProgress}
                      style={{ width: `${g.totalGames ? Math.round((g.filledGames / g.totalGames) * 100) : 0}%` }} />
                  </div>
                  <div className={styles.fillText}>{g.filledGames ?? 0}/{g.totalGames ?? 0}</div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => navigate('/scheduler/assign')}>Assign</Button>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <FindDirectorModal
        open={showFindDirector}
        onClose={() => setShowFindDirector(false)}
        schedulerUid={user?.uid}
        schedulerName={profile?.displayName}
      />
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}

// ── Find Director Modal ───────────────────────────────────────────────────────
function FindDirectorModal({ open, onClose, schedulerUid, schedulerName }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching]     = useState(false)
  const [results, setResults]         = useState([])
  const [searched, setSearched]       = useState(false)
  const [selected, setSelected]       = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [note, setNote]               = useState('')
  const [saving, setSaving]           = useState(false)

  const handleSearch = async () => {
    if (!searchQuery.trim()) { return }
    setSearching(true); setResults([]); setSearched(false); setSelected(null)
    try {
      const term = searchQuery.trim().toLowerCase()
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('roles', 'array-contains', 'director'),
        limit(200)
      ))
      const found = snap.docs
        .filter(d => {
          if (d.id === schedulerUid) return false
          const data = d.data()
          return data.displayName?.toLowerCase().includes(term) || data.email?.toLowerCase().includes(term)
        })
        .map(d => ({ id: d.id, ...d.data() }))
      setResults(found); setSearched(true)
    } catch {
      setSearched(true)
    } finally { setSearching(false) }
  }

  const handleConnect = async () => {
    if (!selected) return
    setSaving(true)
    try {
      await sendConnectionRequest(schedulerUid, selected.id, 'scheduler-director', {
        fromName: schedulerName,
        toName:   selected.displayName,
        note,
      })
      await addDoc(collection(db, 'notifications'), {
        uid:       selected.id,
        type:      'connection',
        title:     '🤝 Scheduler Connection Request',
        message:   `${schedulerName} wants to connect with you as a scheduler`,
        read:      false,
        link:      '/director',
        createdAt: serverTimestamp(),
      })
      toast_success(`Request sent to ${selected.displayName}!`)
      reset()
    } catch { } finally { setSaving(false) }
  }

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return
    setSaving(true)
    try {
      // Check if email exists
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', inviteEmail.trim().toLowerCase())))
      if (!snap.empty) {
        const dir = { id: snap.docs[0].id, ...snap.docs[0].data() }
        setSelected(dir)
        await sendConnectionRequest(schedulerUid, dir.id, 'scheduler-director', { fromName: schedulerName, toName: dir.displayName, note })
        await addDoc(collection(db, 'notifications'), {
          uid: dir.id, type: 'connection', title: '🤝 Scheduler Connection Request',
          message: `${schedulerName} wants to connect with you as a scheduler`,
          read: false, link: '/director', createdAt: serverTimestamp(),
        })
        toast_success(`Request sent to ${dir.displayName}!`)
      } else {
        await sendConnectionRequest(schedulerUid, '__invite__', 'scheduler-director', { fromName: schedulerName, inviteEmail: inviteEmail.trim(), note, status: 'invited' })
        toast_success(`Invitation sent to ${inviteEmail}`)
      }
      reset()
    } catch { } finally { setSaving(false) }
  }

  // Simple toast since we can't import toast here without issues
  const toast_success = (msg) => {
    const t = document.createElement('div')
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;z-index:9999;box-shadow:0 4px 20px rgba(0,0,0,.3)'
    t.textContent = '✅ ' + msg; document.body.appendChild(t)
    setTimeout(() => t.remove(), 3000)
  }

  const reset = () => {
    setSearchQuery(''); setResults([]); setSearched(false)
    setSelected(null); setInviteEmail(''); setNote(''); onClose()
  }

  return (
    <Modal open={open} onClose={reset} title="Find a Game Director" size="md"
      footer={<Button variant="ghost" onClick={reset}>Cancel</Button>}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={sLabelSt}>Search by Name or Email</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input style={{ ...iSt, flex: 1 }} placeholder="Search directors…"
            value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setSearched(false) }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()} />
          <Button variant="secondary" loading={searching} onClick={handleSearch}>Search</Button>
        </div>
        {searched && results.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 10 }}>
            No directors found. Try their email below.
          </div>
        )}
        {results.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {results.map(u => {
              const isSel = selected?.id === u.id
              return (
                <div key={u.id} onClick={() => setSelected(isSel ? null : u)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 13px',
                  borderRadius: 'var(--radius)', cursor: 'pointer', transition: 'all .13s',
                  border: `2px solid ${isSel ? 'var(--blue)' : 'var(--color-border)'}`,
                  background: isSel ? 'rgba(37,99,235,.05)' : 'var(--color-surface)',
                }}>
                  <Avatar name={u.displayName} src={u.photoURL} size="sm" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{u.displayName}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{u.email}</div>
                  </div>
                  {isSel && <span style={{ color: 'var(--blue)', fontWeight: 700, fontSize: 13 }}>✓</span>}
                </div>
              )
            })}
          </div>
        )}
        {selected && (
          <div style={{ marginTop: 14 }}>
            <Textarea label="Note (optional)" placeholder="Hi, I'm a scorekeeper scheduler in Nashville…" value={note} onChange={e => setNote(e.target.value)} rows={2} />
            <Button variant="primary" fullWidth loading={saving} onClick={handleConnect}>
              Send Connection Request to {selected.displayName}
            </Button>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        <span style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>or invite by email</span>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      </div>

      <Input label="Director's Email" placeholder="director@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
      {!selected && <Textarea label="Note (optional)" placeholder="Hi, I'm a scheduler looking to work your events…" value={note} onChange={e => setNote(e.target.value)} rows={2} />}
      <Button variant="secondary" fullWidth loading={saving} onClick={handleInvite}>Send Invite</Button>
    </Modal>
  )
}

const sLabelSt = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--color-muted)', marginBottom: 8 }
const iSt = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }
