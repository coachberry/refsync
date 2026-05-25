import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useConnections } from '@/hooks/useConnections'
import { useGameGroups } from '@/hooks/useGameGroups'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, getDoc, doc, addDoc, limit, serverTimestamp } from 'firebase/firestore'
import { respondToConnection, sendConnectionRequest } from '@/services/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Textarea } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './DirSchedulers.module.css'

const SCHED_TYPE_LABEL = {
  ref: '🏒 Referee Scheduler',
  sk:  '📋 Scorekeeper Scheduler',
  both: '🏒📋 Both',
}

export default function DirSchedulers() {
  const { user, profile } = useAuth()
  const { accepted, pendingOutgoing, loading } = useConnections()
  const { groups } = useGameGroups()
  const [schedulers, setSchedulers] = useState([])
  const [loadingProfiles, setLoadingProfiles] = useState(true)
  const [showInvite, setShowInvite] = useState(false)
  const [removingId, setRemovingId] = useState(null)

  // Filter to director-scheduler connections
  const schedulerConnections = accepted.filter(c => c.type === 'director-scheduler')
  const pendingRequests      = pendingOutgoing.filter(c => c.type === 'director-scheduler')

  useEffect(() => {
    if (!schedulerConnections.length) { setLoadingProfiles(false); return }
    const fetchProfiles = async () => {
      setLoadingProfiles(true)
      try {
        const withProfiles = await Promise.all(
          schedulerConnections.map(async conn => {
            const uid = conn.toUid ?? conn.fromUid
            if (!uid || uid === '__invite__') return { ...conn, schedulerName: conn.toName ?? conn.fromName ?? 'Scheduler' }
            try {
              const snap = await getDoc(doc(db, 'users', uid))
              const data = snap.exists() ? snap.data() : {}
              return {
                ...conn,
                schedulerName: data.displayName ?? conn.toName ?? 'Scheduler',
                schedulerEmail: data.email ?? '',
                schedulerSubRoles: data.subRoles ?? [],
                schedulerOrg: data.schedulerProfile?.organization ?? '',
                photoURL: data.photoURL ?? null,
              }
            } catch { return { ...conn, schedulerName: conn.toName ?? 'Scheduler' } }
          })
        )
        setSchedulers(withProfiles)
      } catch { toast.error('Failed to load scheduler profiles') }
      finally { setLoadingProfiles(false) }
    }
    fetchProfiles()
  }, [schedulerConnections.length])

  const handleRemove = async (conn) => {
    if (!window.confirm(`Remove ${conn.schedulerName} from your schedulers?`)) return
    setRemovingId(conn.id)
    try {
      await respondToConnection(conn.id, 'declined')
      toast.success(`${conn.schedulerName} removed`)
    } catch { toast.error('Failed to remove scheduler') }
    finally { setRemovingId(null) }
  }

  // Games assigned to each scheduler
  const gamesForScheduler = (schedulerUid) =>
    groups.filter(g => g.schedulerId === schedulerUid || g.refSchedulerId === schedulerUid || g.skSchedulerId === schedulerUid)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My Schedulers</h1>
          <p className={styles.sub}>{schedulers.length} connected · {pendingRequests.length} pending</p>
        </div>
        <Button variant="primary" onClick={() => setShowInvite(true)}>+ Request Scheduler</Button>
      </div>

      {/* Pending requests */}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Pending Requests</CardTitle></CardHeader>
          <CardBody noPadding>
            {pendingRequests.map(req => (
              <div key={req.id} className={styles.pendingRow}>
                <div className={styles.pendingIcon}>📤</div>
                <div className={styles.pendingInfo}>
                  <div className={styles.pendingName}>{req.inviteEmail ?? req.toName ?? 'Scheduler'}</div>
                  <div className={styles.pendingMeta}>
                    Request sent · {req.groupName ?? '—'}
                    {req.schedulerType && ` · ${SCHED_TYPE_LABEL[req.schedulerType]}`}
                  </div>
                </div>
                <Badge variant="amber">Pending</Badge>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Connected schedulers */}
      {loading || loadingProfiles ? (
        <div className={styles.center}><Spinner size="lg" /></div>
      ) : schedulers.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon="📋"
              title="No schedulers connected yet"
              message="Request a scheduler from your events page or invite one directly."
              action={{ label: '+ Request Scheduler', onClick: () => setShowInvite(true) }}
            />
          </CardBody>
        </Card>
      ) : (
        <div className={styles.schedulerList}>
          {schedulers.map(sched => {
            const uid = sched.toUid ?? sched.fromUid
            const assignedGroups = gamesForScheduler(uid)
            const subRoles = sched.schedulerSubRoles ?? []
            const typeLabel = subRoles.includes('ref_scheduler') && subRoles.includes('sk_scheduler')
              ? '🏒📋 Referee & Scorekeeper Scheduler'
              : subRoles.includes('ref_scheduler') ? '🏒 Referee Scheduler'
              : subRoles.includes('sk_scheduler')  ? '📋 Scorekeeper Scheduler'
              : '📋 Scheduler'

            return (
              <div key={sched.id} className={styles.schedulerCard}>
                <div className={styles.schedulerTop}>
                  <Avatar name={sched.schedulerName} src={sched.photoURL} size="lg" />
                  <div className={styles.schedulerInfo}>
                    <div className={styles.schedulerName}>{sched.schedulerName}</div>
                    {sched.schedulerEmail && <div className={styles.schedulerEmail}>{sched.schedulerEmail}</div>}
                    <div className={styles.schedulerType}>{typeLabel}</div>
                    {sched.schedulerOrg && <div className={styles.schedulerOrg}>{sched.schedulerOrg}</div>}
                    {sched.createdAt && (
                      <div className={styles.schedulerSince}>
                        Connected {format(sched.createdAt.toDate?.() ?? new Date(sched.createdAt), 'MMM d, yyyy')}
                      </div>
                    )}
                  </div>
                  <div className={styles.schedulerActions}>
                    <Badge variant="green">Active</Badge>
                    <Button size="sm" variant="danger" loading={removingId === sched.id} onClick={() => handleRemove(sched)}>
                      Remove
                    </Button>
                  </div>
                </div>

                {/* Assigned events */}
                {assignedGroups.length > 0 && (
                  <div className={styles.assignedGroups}>
                    <div className={styles.assignedLabel}>Assigned Events</div>
                    <div className={styles.assignedList}>
                      {assignedGroups.map(g => (
                        <div key={g.id} className={styles.assignedGroup}>
                          <span className={styles.assignedGroupName}>{g.name}</span>
                          <span className={styles.assignedGroupMeta}>
                            {g.totalGames ?? 0} games · {g.filledGames ?? 0} filled
                          </span>
                          <Badge variant={g.filledGames >= g.totalGames ? 'green' : 'amber'}>
                            {g.filledGames >= g.totalGames ? 'Full' : 'In progress'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <InviteSchedulerModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        groups={groups}
        userId={user?.uid}
        userName={profile?.displayName}
        userEmail={profile?.email}
      />
    </div>
  )
}

// ── Invite Scheduler Modal ────────────────────────────────────────────────────
function InviteSchedulerModal({ open, onClose, groups, userId, userName, userEmail }) {
  const [saving, setSaving]         = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searching, setSearching]   = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searched, setSearched]     = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const [note, setNote]             = useState('')
  const [groupId, setGroupId]       = useState('')
  const [schedType, setSchedType]   = useState('both')

  const selectedGroup = groups.find(g => g.id === groupId)

  const handleSearch = async () => {
    if (!searchQuery.trim()) { toast.error('Enter a name or email to search'); return }
    setSearching(true)
    setSearchResults([])
    setSearched(false)
    setSelectedUser(null)
    try {
      // Search by display name or email
      const term = searchQuery.trim().toLowerCase()
      const [byName, byEmail] = await Promise.all([
        getDocs(query(
          collection(db, 'users'),
          where('roles', 'array-contains', 'scheduler'),
          where('displayNameLower', '>=', term),
          where('displayNameLower', '<=', term + '\uf8ff'),
          limit(10)
        )),
        getDocs(query(
          collection(db, 'users'),
          where('roles', 'array-contains', 'scheduler'),
          where('email', '>=', term),
          where('email', '<=', term + '\uf8ff'),
          limit(10)
        )),
      ])
      const seen = new Set()
      const results = []
      ;[...byName.docs, ...byEmail.docs].forEach(d => {
        if (!seen.has(d.id) && d.id !== userId) {
          seen.add(d.id)
          results.push({ id: d.id, ...d.data() })
        }
      })
      setSearchResults(results)
      setSearched(true)
    } catch (err) {
      console.error(err)
      // Fallback: search by email only (doesn't need composite index)
      try {
        const snap = await getDocs(query(
          collection(db, 'users'),
          where('email', '==', searchQuery.trim().toLowerCase()),
          limit(5)
        ))
        const results = snap.docs
          .filter(d => d.id !== userId && (d.data().roles ?? []).includes('scheduler'))
          .map(d => ({ id: d.id, ...d.data() }))
        setSearchResults(results)
        setSearched(true)
      } catch { toast.error('Search failed — try searching by exact email') }
    } finally {
      setSearching(false) }
  }

  const handleSendToUser = async () => {
    if (!selectedUser) return
    setSaving(true)
    try {
      await sendConnectionRequest(userId, selectedUser.id, 'director-scheduler', {
        fromName: userName, fromEmail: userEmail,
        toName: selectedUser.displayName,
        groupId: groupId || null,
        groupName: selectedGroup?.name ?? '',
        schedulerType: schedType,
        note,
        status: 'pending',
      })
      // In-app notification
      await addDoc(collection(db, 'notifications'), {
        uid:     selectedUser.id,
        type:    'connection',
        title:   '🤝 Scheduler Request',
        message: `${userName} wants to connect with you as a scheduler`,
        read:    false,
        link:    '/profile',
        createdAt: serverTimestamp(),
      })
      toast.success(`Request sent to ${selectedUser.displayName}!`)
      resetAndClose()
    } catch { toast.error('Failed to send request') }
    finally { setSaving(false) }
  }

  const handleInviteByEmail = async () => {
    if (!inviteEmail.trim()) { toast.error('Enter an email address'); return }
    setSaving(true)
    try {
      // Check if email matches an existing user first
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', inviteEmail.trim().toLowerCase())))
      if (!snap.empty && snap.docs[0].id !== userId) {
        const existingUser = { id: snap.docs[0].id, ...snap.docs[0].data() }
        setSelectedUser(existingUser)
        toast(`Found ${existingUser.displayName} — sending them a request now`)
        await sendConnectionRequest(userId, existingUser.id, 'director-scheduler', {
          fromName: userName, fromEmail: userEmail,
          toName: existingUser.displayName,
          groupId: groupId || null,
          groupName: selectedGroup?.name ?? '',
          schedulerType: schedType,
          note, status: 'pending',
        })
        await addDoc(collection(db, 'notifications'), {
          uid: existingUser.id, type: 'connection',
          title: '🤝 Scheduler Request',
          message: `${userName} wants to connect with you as a scheduler`,
          read: false, link: '/profile',
          createdAt: serverTimestamp(),
        })
        toast.success(`Request sent to ${existingUser.displayName}!`)
      } else {
        // No account — send invite
        await sendConnectionRequest(userId, '__invite__', 'director-scheduler', {
          fromName: userName, fromEmail: userEmail,
          inviteEmail: inviteEmail.trim(),
          groupId: groupId || null,
          groupName: selectedGroup?.name ?? '',
          schedulerType: schedType,
          note, status: 'invited',
        })
        toast.success(`Invitation sent to ${inviteEmail}`)
      }
      resetAndClose()
    } catch { toast.error('Failed to send invitation') }
    finally { setSaving(false) }
  }

  const resetAndClose = () => {
    setSearchQuery(''); setSearchResults([]); setSearched(false)
    setSelectedUser(null); setInviteEmail(''); setNote(''); setGroupId('')
    onClose()
  }

  const SchedTypeSelector = () => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Scheduler Type</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {[
          { id: 'both', label: '🏒📋 Referees & Scorekeepers' },
          { id: 'ref',  label: '🏒 Referee Scheduler Only' },
          { id: 'sk',   label: '📋 Scorekeeper Scheduler Only' },
        ].map(opt => (
          <label key={opt.id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13.5, fontWeight: 500 }}>
            <input type="radio" name="schedType" value={opt.id} checked={schedType === opt.id} onChange={() => setSchedType(opt.id)} />
            {opt.label}
          </label>
        ))}
      </div>
    </div>
  )

  return (
    <Modal open={open} onClose={resetAndClose} title="Request a Scheduler" size="md"
      footer={<Button variant="ghost" onClick={resetAndClose}>Cancel</Button>}
    >
      {/* Step 1 — Search */}
      <div style={sectionSt}>
        <div style={sectionLabelSt}>Search for a Scheduler</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inputSt, flex: 1 }}
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={e => { setSearchQuery(e.target.value); setSearched(false); setSelectedUser(null) }}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="secondary" loading={searching} onClick={handleSearch}>Search</Button>
        </div>

        {/* Search results */}
        {searched && (
          <div style={{ marginTop: 10 }}>
            {searchResults.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--color-muted)', padding: '10px 0' }}>
                No schedulers found matching "{searchQuery}". Use the email invite below.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {searchResults.map(u => {
                  const isSelected = selectedUser?.id === u.id
                  return (
                    <div key={u.id}
                      onClick={() => setSelectedUser(isSelected ? null : u)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 13px', borderRadius: 'var(--radius)',
                        border: `2px solid ${isSelected ? 'var(--blue)' : 'var(--color-border)'}`,
                        background: isSelected ? 'rgba(37,99,235,.05)' : 'var(--color-surface)',
                        cursor: 'pointer', transition: 'all .13s',
                      }}
                    >
                      <Avatar name={u.displayName} src={u.photoURL} size="sm" />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{u.displayName}</div>
                        <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{u.email}</div>
                      </div>
                      {isSelected && <span style={{ color: 'var(--blue)', fontWeight: 700, fontSize: 13 }}>✓ Selected</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Send to selected user */}
        {selectedUser && (
          <div style={{ marginTop: 14 }}>
            <SchedTypeSelector />
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Link to Event (optional)</label>
              <select style={{ ...inputSt }} value={groupId} onChange={e => setGroupId(e.target.value)}>
                <option value="">No specific event</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <Textarea label="Note (optional)" placeholder="Hi, I'd like you to schedule officials for our tournament…" value={note} onChange={e => setNote(e.target.value)} rows={2} />
            <Button variant="primary" fullWidth loading={saving} onClick={handleSendToUser}>
              Send Request to {selectedUser.displayName}
            </Button>
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0' }}>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
        <span style={{ fontSize: 12, color: 'var(--color-muted)', fontWeight: 600 }}>or invite by email</span>
        <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
      </div>

      {/* Step 2 — Email fallback */}
      <div style={sectionSt}>
        <div style={sectionLabelSt}>Invite by Email</div>
        <p style={{ fontSize: 12.5, color: 'var(--color-muted)', marginBottom: 10, lineHeight: 1.5 }}>
          If they have a RefSync account we'll send them a notification. If not, they'll get an invitation to join.
        </p>
        <Input label="Scheduler's Email" placeholder="scheduler@example.com" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
        {!selectedUser && (
          <>
            <SchedTypeSelector />
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Link to Event (optional)</label>
              <select style={{ ...inputSt }} value={groupId} onChange={e => setGroupId(e.target.value)}>
                <option value="">No specific event</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <Textarea label="Note (optional)" placeholder="Hi, I'd like you to schedule officials for our tournament…" value={note} onChange={e => setNote(e.target.value)} rows={2} />
          </>
        )}
        <Button variant="secondary" fullWidth loading={saving} onClick={handleInviteByEmail}>
          Send Invite
        </Button>
      </div>
    </Modal>
  )
}

const sectionSt      = { marginBottom: 4 }
const sectionLabelSt = { fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--color-muted)', marginBottom: 10 }
const inputSt        = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box' }

