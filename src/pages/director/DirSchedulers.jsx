import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useConnections } from '@/hooks/useConnections'
import { useGameGroups } from '@/hooks/useGameGroups'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, getDoc, doc } from 'firebase/firestore'
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
  const [saving, setSaving]     = useState(false)
  const [email, setEmail]       = useState('')
  const [note, setNote]         = useState('')
  const [groupId, setGroupId]   = useState('')
  const [schedType, setSchedType] = useState('both')

  const selectedGroup = groups.find(g => g.id === groupId)

  const handleSend = async () => {
    if (!email.trim()) { toast.error('Enter an email address'); return }
    setSaving(true)
    try {
      await sendConnectionRequest(userId, '__invite__', 'director-scheduler', {
        fromName: userName, fromEmail: userEmail,
        inviteEmail: email.trim(),
        groupId:  groupId  || null,
        groupName: selectedGroup?.name ?? '',
        schedulerType: schedType,
        note,
        status: 'invited',
      })
      toast.success(`Request sent to ${email}`)
      setEmail(''); setNote(''); setGroupId(''); onClose()
    } catch { toast.error('Failed to send request') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Request a Scheduler" size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSend}>Send Request</Button></>}
    >
      <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        If they have a RefSync account they'll get a notification and email. If not, they'll receive an invitation to join.
      </p>

      <Input label="Scheduler's Email *" placeholder="scheduler@example.com" value={email} onChange={e => setEmail(e.target.value)} />

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

      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Link to Event (optional)</label>
        <select
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }}
          value={groupId} onChange={e => setGroupId(e.target.value)}
        >
          <option value="">No specific event</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <Textarea label="Note (optional)" placeholder="Hi, I'd like you to schedule officials for our tournament…" value={note} onChange={e => setNote(e.target.value)} rows={3} />
    </Modal>
  )
}
