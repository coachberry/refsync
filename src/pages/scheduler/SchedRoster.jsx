import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useRoster } from '@/hooks/useRoster'
import { sendConnectionRequest, searchUsers } from '@/services/firestore'
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

export default function SchedRoster() {
  const { user, profile } = useAuth()
  const { isRefScheduler, isSKScheduler } = useSubRoles()
  const { roster, loading } = useRoster()
  const [showInvite, setShowInvite]   = useState(false)
  const [search, setSearch]           = useState('')
  const [roleFilter, setRoleFilter]   = useState('all')

  const filtered = roster.filter(o => {
    const matchSearch = !search || o.displayName?.toLowerCase().includes(search.toLowerCase())
    const matchRole = roleFilter === 'all' || o.subRoles?.includes(roleFilter)
    return matchSearch && matchRole
  })

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My Roster</h1>
          <p className={styles.sub}>{roster.length} official{roster.length !== 1 ? 's' : ''} on your roster</p>
        </div>
        <Button variant="primary" onClick={() => setShowInvite(true)}>
          + Invite Official
        </Button>
      </div>

      {/* Filters */}
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
            <button
              key={f.id}
              className={[styles.filterBtn, roleFilter === f.id ? styles.filterActive : ''].join(' ')}
              onClick={() => setRoleFilter(f.id)}
            >
              {f.label}
            </button>
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
              message={roster.length === 0 ? 'Invite officials to join your roster. They\'ll appear here once they accept.' : 'Try a different search or filter.'}
              action={roster.length === 0 ? { label: '+ Invite Official', onClick: () => setShowInvite(true) } : undefined}
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className={styles.rosterTable}>
            <div className={styles.rosterHeader}>
              <span>Official</span>
              <span>Roles</span>
              <span>Cert</span>
              <span>Games</span>
              <span>Status</span>
              <span></span>
            </div>
            {filtered.map(o => (
              <OfficialRow key={o.id ?? o.uid} official={o} />
            ))}
          </div>
        </Card>
      )}

      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        schedulerId={user?.uid}
        schedulerName={profile?.displayName}
      />
    </div>
  )
}

// ── Official row ──────────────────────────────────────────────────────────────
function OfficialRow({ official }) {
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
        <Badge variant={status === 'available' ? 'green' : status === 'unavailable' ? 'red' : 'amber'}>
          {status}
        </Badge>
      </div>
      <div className={styles.rosterCell}>
        <div className={styles.rowActions}>
          <Button size="sm" variant="ghost" title="View availability">📅</Button>
          <Button size="sm" variant="ghost" title="Message">💬</Button>
        </div>
      </div>
    </div>
  )
}

// ── Invite Modal ──────────────────────────────────────────────────────────────
function InviteModal({ open, onClose, schedulerId, schedulerName }) {
  const [mode, setMode]           = useState('email')  // 'email' | 'search'
  const [email, setEmail]         = useState('')
  const [note, setNote]           = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults]     = useState([])
  const [searching, setSearching] = useState(false)
  const [sending, setSending]     = useState(null)

  const handleSearch = async () => {
    if (!searchTerm.trim()) return
    setSearching(true)
    try {
      const users = await searchUsers('official', searchTerm)
      setResults(users)
    } catch {
      toast.error('Search failed')
    } finally {
      setSearching(false)
    }
  }

  const sendInvite = async (toUid, toName, toEmail) => {
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
    } catch {
      toast.error('Failed to send invitation')
    } finally {
      setSending(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite Official to Roster"
      size="md"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      {/* Mode toggle */}
      <div className={styles.modeToggle}>
        <button className={[styles.modeBtn, mode === 'email'  ? styles.modeActive : ''].join(' ')} onClick={() => setMode('email')}>
          Invite by Email
        </button>
        <button className={[styles.modeBtn, mode === 'search' ? styles.modeActive : ''].join(' ')} onClick={() => setMode('search')}>
          Find Existing User
        </button>
      </div>

      {mode === 'email' && (
        <div>
          <p className={styles.inviteHint}>
            If they have a RefSync account they'll get a notification. If not, they'll receive an email invitation.
          </p>
          <Input label="Email Address" placeholder="official@example.com" value={email} onChange={e => setEmail(e.target.value)} />
          <Input label="Note (optional)" placeholder="Hey, I'd like to add you to my officiating roster…" value={note} onChange={e => setNote(e.target.value)} />
          <Button variant="primary" fullWidth loading={sending === 'email'} onClick={() => sendInvite(null, null, email)}>
            Send Invitation
          </Button>
        </div>
      )}

      {mode === 'search' && (
        <div>
          <div className={styles.searchRow}>
            <Input label="Search by name" placeholder="Jordan Mackay" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            <Button variant="secondary" loading={searching} onClick={handleSearch} style={{ marginTop: 22 }}>
              Search
            </Button>
          </div>
          {results.length > 0 && (
            <div className={styles.searchResults}>
              {results.map(u => (
                <div key={u.id} className={styles.searchResult}>
                  <Avatar name={u.displayName} size="sm" />
                  <div className={styles.searchResultInfo}>
                    <div className={styles.searchResultName}>{u.displayName}</div>
                    <div className={styles.searchResultSub}>
                      {(u.subRoles ?? []).filter(s => ['referee','scorekeeper'].includes(s)).map(s => SUB_ROLE_LABELS[s]).join(', ') || 'Official'}
                    </div>
                  </div>
                  <Button size="sm" variant="primary" loading={sending === u.id} onClick={() => sendInvite(u.id, u.displayName, u.email)}>
                    Invite
                  </Button>
                </div>
              ))}
            </div>
          )}
          {results.length === 0 && searchTerm && !searching && (
            <p className={styles.noResults}>No officials found. Try inviting by email instead.</p>
          )}
        </div>
      )}
    </Modal>
  )
}
