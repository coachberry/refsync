import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useRoster } from '@/hooks/useRoster'
import { useConnections } from '@/hooks/useConnections'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { sendConnectionRequest, respondToConnection, searchUsers } from '@/services/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner, Skeleton } from '@/components/ui/LoadingSpinner'
import { Avatar } from '@/components/ui/Avatar'
import toast from 'react-hot-toast'
import styles from './SchedRoster.module.css'

const SUB_ROLE_LABELS = {
  referee:     '🏒 Referee',
  scorekeeper: '📋 Scorekeeper',
}

const TABS = ['Roster', 'Pending Invitations']

export default function SchedRoster() {
  const { user, profile } = useAuth()
  const { isRefScheduler, isSKScheduler } = useSubRoles()
  const { roster, loading } = useRoster()
  const { outgoing, incoming } = useConnections()
  const [tab, setTab]             = useState('Roster')
  const [showInvite, setShowInvite] = useState(false)
  const [search, setSearch]       = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [withdrawing, setWithdrawing] = useState(null)

  // Pending outgoing invites (sent by this scheduler, not yet accepted)
  const pendingOutgoing = outgoing.filter(c =>
    c.type === 'scheduler-official' && c.status === 'pending'
  )
  // Pending incoming from officials who want to join
  const pendingIncoming = incoming.filter(c =>
    c.type === 'scheduler-official' && c.status === 'pending'
  )
  const allPending = [...pendingOutgoing, ...pendingIncoming]

  // UIDs already invited or on roster — for duplicate prevention
  const alreadyConnectedUids = new Set([
    ...roster.map(o => o.uid ?? o.id),
    ...pendingOutgoing.map(c => c.toUid).filter(Boolean),
    ...pendingIncoming.map(c => c.fromUid).filter(Boolean),
  ])

  const filtered = roster.filter(o => {
    const matchSearch = !search || o.displayName?.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || o.subRoles?.includes(roleFilter)
    return matchSearch && matchRole
  })

  const [removing, setRemoving] = useState(null)

  const handleRemove = async (official) => {
    if (!window.confirm(`Remove ${official.displayName} from your roster?`)) return
    setRemoving(official.connectionId)
    try {
      await respondToConnection(official.connectionId, 'removed')
      toast.success(`${official.displayName} removed from roster`)
    } catch { toast.error('Failed to remove official') }
    finally { setRemoving(null) }
  }

  const handleWithdraw = async (connId, name) => {
    if (!window.confirm(`Withdraw invitation to ${name}?`)) return
    setWithdrawing(connId)
    try {
      await respondToConnection(connId, 'withdrawn')
      toast.success('Invitation withdrawn')
    } catch { toast.error('Failed to withdraw') }
    finally { setWithdrawing(null) }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My Roster</h1>
          <p className={styles.sub}>{roster.length} official{roster.length !== 1 ? 's' : ''} · {allPending.length} pending</p>
        </div>
        <Button variant="primary" onClick={() => setShowInvite(true)}>+ Invite Official</Button>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t}
            className={[styles.tab, tab === t ? styles.tabActive : ''].join(' ')}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'Pending Invitations' && allPending.length > 0 && (
              <span className={styles.tabBadge}>{allPending.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Roster tab ── */}
      {tab === 'Roster' && (
        <>
          <div className={styles.filters}>
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className={styles.searchInput} placeholder="Search officials…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className={styles.roleFilterRow}>
              {[
                { id: 'all',         label: 'All' },
                { id: 'referee',     label: '🏒 Referees',     show: isRefScheduler },
                { id: 'scorekeeper', label: '📋 Scorekeepers', show: isSKScheduler },
              ].filter(f => f.show !== false).map(f => (
                <button key={f.id}
                  className={[styles.filterBtn, roleFilter === f.id ? styles.filterActive : ''].join(' ')}
                  onClick={() => setRoleFilter(f.id)}
                >{f.label}</button>
              ))}
            </div>
          </div>

          {loading ? (
            <Card><CardBody><div className={styles.skeletons}>{[...Array(4)].map((_, i) => <Skeleton key={i} height={56} radius={10} />)}</div></CardBody></Card>
          ) : filtered.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  icon="👥"
                  title={roster.length === 0 ? 'Your roster is empty' : 'No matches'}
                  message={roster.length === 0 ? "Invite officials to join your roster." : 'Try a different search or filter.'}
                  action={roster.length === 0 ? { label: '+ Invite Official', onClick: () => setShowInvite(true) } : undefined}
                />
              </CardBody>
            </Card>
          ) : (
            <Card>
              <div className={styles.rosterTable}>
                <div className={styles.rosterHeader}>
                  <span>Official</span><span>Roles</span><span>Cert</span><span>Games</span><span>Status</span><span></span>
                </div>
                {filtered.map(o => <OfficialRow key={o.id ?? o.uid} official={o} onRemove={() => handleRemove(o)} removing={removing === o.connectionId} />)}
              </div>
            </Card>
          )}
        </>
      )}

      {/* ── Pending Invitations tab ── */}
      {tab === 'Pending Invitations' && (
        <div>
          {allPending.length === 0 ? (
            <Card><CardBody>
              <EmptyState icon="📬" title="No pending invitations" message="Invitations you send will appear here until they're accepted or declined." />
            </CardBody></Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {/* Sent invitations (outgoing) */}
              {pendingOutgoing.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Sent Invitations</CardTitle>
                    <Badge variant="blue">{pendingOutgoing.length}</Badge>
                  </CardHeader>
                  <CardBody noPadding>
                    {pendingOutgoing.map(conn => (
                      <div key={conn.id} className={styles.pendingRow}>
                        <Avatar name={conn.toName ?? conn.inviteEmail ?? 'Official'} size="sm" />
                        <div className={styles.pendingInfo}>
                          <div className={styles.pendingName}>{conn.toName ?? conn.inviteEmail ?? 'Invited Official'}</div>
                          <div className={styles.pendingMeta}>
                            {conn.inviteEmail ? `📧 ${conn.inviteEmail}` : 'RefSync user'}
                            {conn.note && <span> · "{conn.note}"</span>}
                          </div>
                          <Badge variant="amber">Awaiting Response</Badge>
                        </div>
                        <Button size="sm" variant="ghost" loading={withdrawing === conn.id}
                          onClick={() => handleWithdraw(conn.id, conn.toName ?? conn.inviteEmail)}>
                          Withdraw
                        </Button>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              )}

              {/* Officials who requested to join */}
              {pendingIncoming.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>Officials Requesting to Join</CardTitle>
                    <Badge variant="amber">{pendingIncoming.length}</Badge>
                  </CardHeader>
                  <CardBody noPadding>
                    {pendingIncoming.map(conn => (
                      <div key={conn.id} className={styles.pendingRow}>
                        <Avatar name={conn.fromName ?? 'Official'} size="sm" />
                        <div className={styles.pendingInfo}>
                          <div className={styles.pendingName}>{conn.fromName ?? 'Official'}</div>
                          {conn.note && <div className={styles.pendingMeta}>"{conn.note}"</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <Button size="sm" variant="teal" onClick={async () => {
                            try { await respondToConnection(conn.id, 'accepted'); toast.success('Added to roster!') }
                            catch { toast.error('Failed to accept') }
                          }}>Accept</Button>
                          <Button size="sm" variant="ghost" onClick={async () => {
                            try { await respondToConnection(conn.id, 'declined'); toast.success('Declined') }
                            catch { toast.error('Failed to decline') }
                          }}>Decline</Button>
                        </div>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        schedulerId={user?.uid}
        schedulerName={profile?.displayName}
        alreadyConnectedUids={alreadyConnectedUids}
      />
    </div>
  )
}

// ── Official row ──────────────────────────────────────────────────────────────
function OfficialRow({ official, onRemove, removing }) {
  const subRoles  = official.subRoles ?? []
  const certLevel = official.officialProfile?.certLevel ?? '—'
  const games     = official.officialProfile?.totalGames ?? 0
  const status    = official.status ?? 'available'
  return (
    <div className={styles.rosterRow}>
      <div className={styles.rosterCell}>
        <div className={styles.officialInfo}>
          <Avatar name={official.displayName} src={official.photoURL} size="sm" />
          <div>
            <div className={styles.officialName}>{official.displayName}</div>
            <div className={styles.officialEmail}>{official.email}</div>
          </div>
        </div>
      </div>
      <div className={styles.rosterCell}>
        <div className={styles.subRoles}>
          {subRoles.filter(s => ['referee','scorekeeper'].includes(s)).map(s => (
            <Badge key={s} variant="ice">{SUB_ROLE_LABELS[s]}</Badge>
          ))}
          {!subRoles.length && <span className={styles.noData}>—</span>}
        </div>
      </div>
      <div className={styles.rosterCell}><span className={styles.certLevel}>{certLevel}</span></div>
      <div className={styles.rosterCell}><span className={styles.gamesCount}>{games}</span></div>
      <div className={styles.rosterCell}>
        <Badge variant={status === 'available' ? 'green' : status === 'unavailable' ? 'red' : 'amber'}>{status}</Badge>
      </div>
      <div className={styles.rosterCell}>
        <div className={styles.rowActions}>
          <Button size="sm" variant="ghost" title="View availability">📅</Button>
          <Button size="sm" variant="ghost" title="Message">💬</Button>
          <Button size="sm" variant="danger" loading={removing} onClick={onRemove} title="Remove from roster">✕</Button>
        </div>
      </div>
    </div>
  )
}

// ── Invite Modal ──────────────────────────────────────────────────────────────
function InviteModal({ open, onClose, schedulerId, schedulerName, alreadyConnectedUids }) {
  const [mode, setMode]             = useState('search')
  const [email, setEmail]           = useState('')
  const [note, setNote]             = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults]       = useState([])
  const [searching, setSearching]   = useState(false)
  const [sending, setSending]       = useState(null)

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      const users = await searchUsers('official', searchTerm)
      setResults(users)
    } catch { toast.error('Search failed') }
    finally { setSearching(false) }
  }

  const sendInvite = async (toUid, toName, toEmail) => {
    // Duplicate check
    if (toUid && alreadyConnectedUids.has(toUid)) {
      toast.error(`${toName ?? 'This official'} is already on your roster or has a pending invitation`)
      return
    }
    // Email duplicate check
    if (!toUid && toEmail) {
      const snap = await getDocs(query(collection(db, 'users'), where('email', '==', toEmail.toLowerCase().trim()), limit(1)))
      if (!snap.empty && alreadyConnectedUids.has(snap.docs[0].id)) {
        toast.error('This person is already connected or has a pending invitation')
        return
      }
    }

    setSending(toUid ?? 'email')
    try {
      await sendConnectionRequest(schedulerId, toUid ?? '__invite__', 'scheduler-official', {
        fromName:    schedulerName,
        inviteEmail: toEmail ?? email,
        toName,
        note,
      })
      toast.success(`Invitation sent to ${toName ?? email}`)
      onClose()
    } catch { toast.error('Failed to send invitation') }
    finally { setSending(null) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Invite Official to Roster" size="md"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <div className={styles.modeToggle}>
        <button className={[styles.modeBtn, mode === 'search' ? styles.modeActive : ''].join(' ')} onClick={() => setMode('search')}>
          🔍 Search Users
        </button>
        <button className={[styles.modeBtn, mode === 'email' ? styles.modeActive : ''].join(' ')} onClick={() => setMode('email')}>
          📧 Invite by Email
        </button>
      </div>

      {mode === 'search' && (
        <div>
          <div className={styles.searchRow}>
            <Input label="Search by name or email" placeholder="Jordan Mackay" value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()} />
            <Button variant="secondary" loading={searching} onClick={handleSearch} style={{ marginTop: 22 }}>Search</Button>
          </div>
          {results.length > 0 && (
            <div className={styles.searchResults}>
              {results.map(u => {
                const alreadyAdded = alreadyConnectedUids.has(u.id)
                return (
                  <div key={u.id} className={styles.searchResult}>
                    <Avatar name={u.displayName} size="sm" />
                    <div className={styles.searchResultInfo}>
                      <div className={styles.searchResultName}>{u.displayName}</div>
                      <div className={styles.searchResultSub}>
                        {(u.subRoles ?? []).filter(s => ['referee','scorekeeper'].includes(s)).map(s => SUB_ROLE_LABELS[s]).join(', ') || 'Official'}
                      </div>
                    </div>
                    {alreadyAdded ? (
                      <Badge variant={u.status === 'accepted' ? 'green' : 'amber'}>
                        {u.status === 'accepted' ? 'On Roster' : 'Invited'}
                      </Badge>
                    ) : (
                      <Button size="sm" variant="primary" loading={sending === u.id}
                        onClick={() => sendInvite(u.id, u.displayName, u.email)}>Invite</Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          {results.length === 0 && searchTerm && !searching && (
            <p className={styles.noResults}>No officials found. Try inviting by email instead.</p>
          )}
        </div>
      )}

      {mode === 'email' && (
        <div>
          <p className={styles.inviteHint}>
            If they have a RefSync account they'll get an in-app notification. If not, they'll receive an email invitation.
          </p>
          <Input label="Email Address" placeholder="official@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Input label="Note (optional)" placeholder="Hey, I'd like to add you to my officiating roster…" value={note} onChange={e => setNote(e.target.value)} />
          <Button variant="primary" fullWidth loading={sending === 'email'} onClick={() => sendInvite(null, null, email)}>
            Send Invitation
          </Button>
        </div>
      )}
    </Modal>
  )
}
