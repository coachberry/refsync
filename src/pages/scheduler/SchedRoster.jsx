import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useRoster } from '@/hooks/useRoster'
import { useConnections } from '@/hooks/useConnections'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, limit, getDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { sendConnectionRequest, respondToConnection } from '@/services/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner, Skeleton } from '@/components/ui/LoadingSpinner'
import { Avatar } from '@/components/ui/Avatar'
import toast from 'react-hot-toast'
import { format, addDays, startOfDay, isBefore } from 'date-fns'
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
  const navigate = useNavigate()
  const [tab, setTab]                 = useState('Roster')
  const [showInvite, setShowInvite]   = useState(false)
  const [search, setSearch]           = useState('')
  const [roleFilter, setRoleFilter]   = useState('all')
  const [withdrawing, setWithdrawing] = useState(null)
  const [availOfficial, setAvailOfficial] = useState(null)
  const [messagingUid, setMessagingUid]   = useState(null)

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

  const [profileOfficial, setProfileOfficial] = useState(null)

  const handleMessage = async (official) => {
    setMessagingUid(official.uid)
    try {
      const threadId  = [user.uid, official.uid].sort().join('_')
      const threadRef = doc(db, 'threads', threadId)
      const snap = await getDoc(threadRef)
      if (!snap.exists()) {
        await setDoc(threadRef, {
          participants: [user.uid, official.uid],
          participantNames: {
            [user.uid]: profile?.displayName ?? 'Scheduler',
            [official.uid]: official.displayName,
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          lastMessage: '',
        })
      }
      navigate('/profile/messages', { state: { openThreadId: threadId, otherUser: official } })
    } catch { toast.error('Failed to open message thread') }
    finally { setMessagingUid(null) }
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
                {filtered.map(o => (
                  <OfficialRow key={o.id ?? o.uid} official={o}
                    onRemove={() => handleRemove(o)}
                    removing={removing === o.connectionId}
                    onAvailability={() => setAvailOfficial(o)}
                    onMessage={() => handleMessage(o)}
                    onProfile={() => setProfileOfficial(o)}
                    messagingUid={messagingUid}
                  />
                ))}
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

      {availOfficial && (
        <AvailabilityModal
          official={availOfficial}
          onClose={() => setAvailOfficial(null)}
        />
      )}

      {profileOfficial && (
        <OfficialProfileModal
          official={profileOfficial}
          onClose={() => setProfileOfficial(null)}
          onMessage={() => { setProfileOfficial(null); handleMessage(profileOfficial) }}
          onRemove={() => { setProfileOfficial(null); handleRemove(profileOfficial) }}
          removing={removing === profileOfficial.connectionId}
          messagingUid={messagingUid}
        />
      )}
    </div>
  )
}

// ── Official row ──────────────────────────────────────────────────────────────
function OfficialRow({ official, onRemove, removing, onAvailability, onMessage, onProfile, messagingUid }) {
  const subRoles  = official.subRoles ?? []
  const certLevel = official.officialProfile?.certLevel ?? '—'
  const games     = official.officialProfile?.totalGames ?? 0
  const status    = official.status ?? 'available'
  return (
    <div className={styles.rosterRow} onClick={onProfile} style={{ cursor:'pointer' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
      onMouseLeave={e => e.currentTarget.style.background = ''}
    >
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
      <div className={styles.rosterCell} onClick={e => e.stopPropagation()}>
        <div className={styles.rowActions}>
          <Button size="sm" variant="ghost" title="View availability" onClick={onAvailability}>📅</Button>
          <Button size="sm" variant="ghost" title="Send message" loading={messagingUid === official.uid} onClick={onMessage}>💬</Button>
          <Button size="sm" variant="danger" loading={removing} onClick={onRemove} title="Remove from roster">✕</Button>
        </div>
      </div>
    </div>
  )
}

// ── Official Profile Modal ────────────────────────────────────────────────────
function OfficialProfileModal({ official, onClose, onMessage, onRemove, removing, messagingUid }) {
  const [upcomingGames, setUpcomingGames] = useState([])
  const [gamesLoading, setGamesLoading]   = useState(true)
  const [totalGames, setTotalGames]       = useState(0)
  const [thisMonthGames, setThisMonthGames] = useState(0)

  useEffect(() => {
    if (!official.uid) return
    const now    = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    getDocs(query(
      collection(db, 'games'),
      where('assignedUids', 'array-contains', official.uid)
    )).then(snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const upcoming = all
        .filter(g => {
          const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
          return gd >= startOfDay(now)
        })
        .sort((a, b) => {
          const da = a.gameDate?.toDate?.() ?? new Date(a.gameDate)
          const db_ = b.gameDate?.toDate?.() ?? new Date(b.gameDate)
          return da - db_
        })
        .slice(0, 8)

      const thisMonth = all.filter(g => {
        const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
        return gd >= monthStart && gd <= now
      })

      setUpcomingGames(upcoming)
      setTotalGames(all.length)
      setThisMonthGames(thisMonth.length)
      setGamesLoading(false)
    }).catch(() => setGamesLoading(false))
  }, [official.uid])

  const subRoles  = official.subRoles ?? []
  const certLevel = official.officialProfile?.certLevel ?? null
  const certNum   = official.officialProfile?.certNumber ?? null
  const jersey    = official.officialProfile?.jerseyNumber ?? null
  const bio       = official.bio ?? null
  const phone     = official.phone ?? null

  return (
    <Modal open={true} onClose={onClose} title="" size="md"
      footer={
        <div style={{ display:'flex', gap:8, width:'100%' }}>
          <Button variant="danger" loading={removing} onClick={onRemove} style={{ marginRight:'auto' }}>
            Remove from Roster
          </Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button variant="primary" loading={messagingUid === official.uid} onClick={onMessage}>
            💬 Message
          </Button>
        </div>
      }
    >
      {/* Profile header */}
      <div style={{ display:'flex', alignItems:'center', gap:16, padding:'0 0 20px', borderBottom:'1px solid var(--color-border)', marginBottom:20 }}>
        <div style={{
          width:64, height:64, borderRadius:'50%', background:'var(--orange)',
          display:'flex', alignItems:'center', justifyContent:'center',
          fontSize:26, color:'#fff', fontWeight:800, fontFamily:'var(--font-display)', flexShrink:0,
        }}>
          {(official.displayName ?? '?')[0]}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:20, fontWeight:800, fontFamily:'var(--font-display)' }}>{official.displayName}</div>
          <div style={{ display:'flex', gap:8, marginTop:5, flexWrap:'wrap' }}>
            {subRoles.filter(s => ['referee','scorekeeper'].includes(s)).map(s => (
              <Badge key={s} variant="ice">{s === 'referee' ? '🏒 Referee' : '📋 Scorekeeper'}</Badge>
            ))}
            {certLevel && <Badge variant="gray">{certLevel}</Badge>}
          </div>
          {bio && <div style={{ fontSize:13, color:'var(--color-muted)', marginTop:6, lineHeight:1.5 }}>{bio}</div>}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Total Games', value: gamesLoading ? '…' : totalGames },
          { label:'This Month',  value: gamesLoading ? '…' : thisMonthGames },
          { label:'Upcoming',    value: gamesLoading ? '…' : upcomingGames.length },
        ].map(s => (
          <div key={s.label} style={{
            background:'var(--color-surface-2)', border:'1px solid var(--color-border)',
            borderRadius:10, padding:'12px 14px', textAlign:'center',
          }}>
            <div style={{ fontSize:26, fontWeight:800, fontFamily:'var(--font-display)', color:'var(--orange)' }}>{s.value}</div>
            <div style={{ fontSize:11.5, color:'var(--color-muted)', marginTop:3 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Details */}
      <div style={{ display:'flex', flexDirection:'column', gap:0, marginBottom:20, border:'1px solid var(--color-border)', borderRadius:10, overflow:'hidden' }}>
        {[
          certNum   && { label:'USAH #',        value: certNum },
          jersey    && { label:'Jersey #',       value: `#${jersey}` },
          phone     && { label:'Phone',          value: phone },
          official.email && { label:'Email',     value: official.email },
        ].filter(Boolean).map((item, i) => (
          <div key={item.label} style={{
            display:'flex', justifyContent:'space-between', alignItems:'center',
            padding:'10px 14px', fontSize:13,
            borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
          }}>
            <span style={{ color:'var(--color-muted)', fontWeight:500 }}>{item.label}</span>
            <span style={{ fontWeight:600 }}>{item.value}</span>
          </div>
        ))}
      </div>

      {/* Upcoming games */}
      <div>
        <div style={{ fontSize:12, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--color-muted)', marginBottom:10 }}>
          Upcoming Games
        </div>
        {gamesLoading ? (
          <div style={{ textAlign:'center', padding:16, color:'var(--color-muted)' }}><Spinner size="sm" /></div>
        ) : upcomingGames.length === 0 ? (
          <div style={{ fontSize:13, color:'var(--color-muted)', fontStyle:'italic', padding:'8px 0' }}>No upcoming games scheduled.</div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {upcomingGames.map(g => {
              const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
              const myRole = (g.assignedOfficials ?? []).find(o => o.uid === official.uid)?.role
              return (
                <div key={g.id} style={{
                  display:'flex', alignItems:'center', gap:12, padding:'10px 12px',
                  background:'var(--color-surface-2)', border:'1px solid var(--color-border)',
                  borderRadius:8,
                }}>
                  <div style={{ textAlign:'center', minWidth:36 }}>
                    <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', color:'var(--color-muted)' }}>{format(gd, 'MMM')}</div>
                    <div style={{ fontSize:18, fontWeight:800, fontFamily:'var(--font-display)', lineHeight:1 }}>{format(gd, 'd')}</div>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{g.homeTeam} vs {g.awayTeam}</div>
                    <div style={{ fontSize:12, color:'var(--color-muted)' }}>{format(gd, 'h:mm a')} · {g.venue}</div>
                  </div>
                  {myRole && <Badge variant="ice">{myRole}</Badge>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Modal>
  )
}

// ── Availability Modal (read-only view of official's availability) ────────────
function AvailabilityModal({ official, onClose }) {
  const [availability, setAvailability] = useState({})
  const [loading, setLoading]           = useState(true)

  useEffect(() => {
    getDoc(doc(db, 'users', official.uid, 'availability', 'data'))
      .then(snap => { if (snap.exists()) setAvailability(snap.data()); setLoading(false) })
      .catch(() => setLoading(false))
  }, [official.uid])

  // Show next 30 days
  const today = startOfDay(new Date())
  const days  = Array.from({ length: 30 }, (_, i) => addDays(today, i))

  const getStatus = (dateStr) => {
    const d = availability[dateStr]
    if (!d || d.status === 'unavailable_all_day') return 'unavailable'
    if (d.status === 'available_all_day') return 'available'
    if (d.status === 'partial') return 'partial'
    return 'unavailable'
  }

  const getWindows = (dateStr) => availability[dateStr]?.windows ?? []

  return (
    <Modal open={true} onClose={onClose}
      title={`${official.displayName}'s Availability`}
      size="md"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:32 }}><Spinner size="md" /></div>
      ) : (
        <div>
          <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--color-muted)', marginBottom:16, flexWrap:'wrap' }}>
            <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'var(--green)', marginRight:5 }} />Available all day</span>
            <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'var(--blue)', marginRight:5 }} />Partial</span>
            <span><span style={{ display:'inline-block', width:10, height:10, borderRadius:2, background:'rgba(255,97,0,.3)', marginRight:5 }} />Unavailable</span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4, maxHeight:420, overflowY:'auto' }}>
            {days.map(day => {
              const dateStr = format(day, 'yyyy-MM-dd')
              const status  = getStatus(dateStr)
              const windows = getWindows(dateStr)
              const isToday = isBefore(today, addDays(day, 1)) && !isBefore(addDays(today, 1), day)
              const dotColor = status === 'available' ? 'var(--green)' : status === 'partial' ? 'var(--blue)' : 'rgba(255,97,0,.25)'
              const textColor = status === 'available' ? 'var(--green)' : status === 'partial' ? 'var(--blue)' : 'var(--color-muted)'
              return (
                <div key={dateStr} style={{
                  display:'flex', alignItems:'flex-start', gap:12, padding:'8px 12px',
                  borderRadius:8, background: isToday ? 'var(--orange-light)' : 'transparent',
                  border: isToday ? '1px solid var(--orange-light)' : '1px solid transparent',
                }}>
                  <div style={{ width:16, height:16, borderRadius:4, background:dotColor, flexShrink:0, marginTop:2 }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight: isToday ? 700 : 500 }}>
                      {format(day, 'EEE, MMM d')}{isToday ? ' — Today' : ''}
                    </div>
                    {status === 'partial' && windows.length > 0 && (
                      <div style={{ fontSize:12, color:'var(--blue)', marginTop:2 }}>
                        {windows.map(w => `${w.start} – ${w.end}`).join(' · ')}
                      </div>
                    )}
                    {status !== 'partial' && (
                      <div style={{ fontSize:12, color:textColor }}>
                        {status === 'available' ? 'Available all day' : 'Unavailable'}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </Modal>
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
      const term = searchTerm.trim().toLowerCase()
      const snap = await getDocs(query(
        collection(db, 'users'),
        where('roles', 'array-contains', 'official'),
        limit(200)
      ))
      const users = snap.docs
        .filter(d => {
          const data = d.data()
          return data.displayName?.toLowerCase().includes(term) || data.email?.toLowerCase().includes(term)
        })
        .map(d => ({ id: d.id, ...d.data() }))
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
