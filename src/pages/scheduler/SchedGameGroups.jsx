import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useGameGroups } from '@/hooks/useGameGroups'
import { db } from '@/lib/firebase'
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, arrayUnion, serverTimestamp, getDoc
} from 'firebase/firestore'
import { assignOfficial } from '@/services/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, statusBadge, EmptyState } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/LoadingSpinner'
import toast from 'react-hot-toast'
import { format, isBefore, startOfDay } from 'date-fns'
import styles from './SchedGameGroups.module.css'

const toMins = (t) => { const [h, m] = (t ?? '00:00').split(':').map(Number); return h * 60 + m }

const checkAvailability = (dayData, gameTimeStr, durationH) => {
  if (!dayData || dayData.status === 'unavailable_all_day') return 'unavailable'
  if (dayData.status === 'available_all_day') return 'available'
  if (dayData.status === 'partial') {
    const bufferMins  = 60
    const gameStart   = toMins(gameTimeStr)
    const gameEnd     = gameStart + (durationH ?? 1.5) * 60
    const neededStart = gameStart - bufferMins
    const neededEnd   = gameEnd   + bufferMins
    const covered = (dayData.windows ?? []).some(w =>
      toMins(w.start) <= neededStart && toMins(w.end) >= neededEnd
    )
    return covered ? 'available' : 'insufficient'
  }
  return 'unavailable'
}

const AVAIL_COLORS = {
  available:    'var(--green)',
  insufficient: 'var(--orange)',
  unavailable:  'var(--color-muted)',
  unknown:      'var(--color-muted)',
}

export default function SchedGameGroups() {
  const { user } = useAuth()
  const { isRefScheduler, isSKScheduler, isBothScheduler } = useSubRoles()
  const { groups, loading } = useGameGroups()

  // Games across all groups
  const [allGames, setAllGames] = useState([])
  const [gamesLoading, setGamesLoading] = useState(true)

  // Roster + availability
  const [roster, setRoster] = useState([])
  const [officialAvailability, setOfficialAvailability] = useState({})
  const [pricingSheet, setPricingSheet] = useState(null)
  const [showUnavailable, setShowUnavailable] = useState(false)

  // UI state
  const [filter, setFilter]           = useState('all') // 'all' | 'needs_assigning' | 'filled'
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [selectedGame, setSelectedGame]   = useState(null)
  const [selectedRole, setSelectedRole]   = useState('')
  const [assigning, setAssigning]         = useState(null)
  const [assignTab, setAssignTab]         = useState('manual') // 'manual' | 'requests'
  const [officialSearch, setOfficialSearch] = useState('')
  const [officialSort, setOfficialSort]   = useState('availability')

  // Reset panel state when game changes
  useEffect(() => {
    setAssignTab('manual')
    setOfficialSearch('')
  }, [selectedGame?.id])

  // Subscribe to all games for this scheduler's groups
  useEffect(() => {
    if (!groups.length) { setAllGames([]); setGamesLoading(false); return }
    const groupIds = groups.map(g => g.id)
    const chunks = []
    for (let i = 0; i < groupIds.length; i += 30) chunks.push(groupIds.slice(i, i + 30))
    const results = new Map()
    const unsubs = chunks.map(chunk => {
      const q = query(collection(db, 'games'), where('groupId', 'in', chunk))
      return onSnapshot(q, snap => {
        snap.docs.forEach(d => results.set(d.id, { id: d.id, ...d.data() }))
        const sorted = Array.from(results.values()).sort((a, b) => {
          const da = a.gameDate?.toDate?.() ?? new Date(a.gameDate)
          const db_ = b.gameDate?.toDate?.() ?? new Date(b.gameDate)
          return da - db_
        })
        setAllGames(sorted)
        setGamesLoading(false)
      })
    })
    return () => unsubs.forEach(u => u())
  }, [groups.map(g => g.id).join(',')])

  // Load roster
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'connections'),
      where('fromUid', '==', user.uid),
      where('type', '==', 'scheduler-official'),
      where('status', '==', 'accepted')
    )
    const unsub = onSnapshot(q, async snap => {
      const uids = snap.docs.map(d => d.data().toUid).filter(Boolean)
      const profiles = await Promise.all(uids.map(async uid => {
        const s = await getDoc(doc(db, 'users', uid))
        return s.exists() ? { uid, ...s.data() } : null
      }))
      setRoster(profiles.filter(Boolean))
    })
    return unsub
  }, [user?.uid])

  // Load pricing sheet
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid, 'pricingSheet', 'data'))
      .then(s => setPricingSheet(s.exists() ? s.data() : { defaultPay: 0, rules: [] }))
      .catch(() => {})
  }, [user?.uid])

  // Load availability when game is selected
  useEffect(() => {
    if (!selectedGame || !roster.length) return
    const gd = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
    const dateStr = format(gd, 'yyyy-MM-dd')
    Promise.all(roster.map(async o => {
      try {
        const s = await getDoc(doc(db, 'users', o.uid, 'availability', 'data'))
        return [o.uid, s.exists() ? (s.data()[dateStr] ?? null) : null]
      } catch { return [o.uid, null] }
    })).then(entries => setOfficialAvailability(Object.fromEntries(entries)))
  }, [selectedGame?.id, roster.length])

  // Auto-select first open slot when game changes
  useEffect(() => {
    if (!selectedGame) return
    const slots = buildCrewSlots(selectedGame)
    const first = slots.find(s => !s.assignedOfficial)
    if (first) setSelectedRole(first.role)
  }, [selectedGame?.id])

  const lookupPay = (division, role) => {
    if (!pricingSheet) return 0
    const rule = (pricingSheet.rules ?? []).find(r =>
      r.division?.toLowerCase() === division?.toLowerCase() && r.role === role
    )
    return rule?.pay ?? pricingSheet.defaultPay ?? 0
  }

  const buildCrewSlots = (game) => {
    const slots    = []
    const assigned = game.assignedOfficials ?? []
    const refs  = Number(game.refs  ?? 0)
    const lines = Number(game.linesmen ?? 0)
    const sks   = Number(game.scorekeepers ?? 0)
    if (isRefScheduler || isBothScheduler) {
      for (let i = 1; i <= refs;  i++) { const role = refs  === 1 ? 'Referee'  : `Referee ${i}`;  slots.push({ role, type:'ref', assignedOfficial: assigned.find(o => o.role === role) ?? null }) }
      for (let i = 1; i <= lines; i++) { const role = lines === 1 ? 'Linesman' : `Linesman ${i}`; slots.push({ role, type:'ref', assignedOfficial: assigned.find(o => o.role === role) ?? null }) }
    }
    if (isSKScheduler || isBothScheduler) {
      for (let i = 1; i <= sks; i++) { const role = sks === 1 ? 'Scorekeeper' : `Scorekeeper ${i}`; slots.push({ role, type:'sk', assignedOfficial: assigned.find(o => o.role === role) ?? null }) }
    }
    return slots
  }

  const isMySlotsFull = (game) => {
    if (isRefScheduler && !isBothScheduler) return !!game.refSlotsFull
    if (isSKScheduler  && !isBothScheduler) return !!game.skSlotsFull
    return !!game.allSlotsFull
  }

  const handleAutoAssign = async (game) => {
    setAssigning('auto')
    try {
      const schedulerType = isRefScheduler && !isBothScheduler ? 'ref_scheduler'
                          : isSKScheduler  && !isBothScheduler ? 'sk_scheduler'
                          : 'both'
      const res = await fetch('https://autoassigngame-hmh3r2a4ra-uc.a.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, schedulerId: user.uid, schedulerType }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Auto-assign failed')
      if (!data.assigned?.length) toast('No available officials found for this slot', { icon: '⚠️' })
      else toast.success(`${data.assigned.length} official${data.assigned.length > 1 ? 's' : ''} auto-assigned!`)
    } catch (err) { toast.error('Auto-assign failed: ' + err.message) }
    finally { setAssigning(null) }
  }

  const handleApproveRequest = async (req) => {
    if (!selectedGame) return
    setAssigning(req.uid)
    try {
      const pay = lookupPay(selectedGame.division, selectedRole)
      await assignOfficial(selectedGame.id, {
        uid: req.uid, name: req.name, role: selectedRole, pay,
      }, user.uid)
      // Update request status
      const updatedRequests = (selectedGame.requests ?? []).map(r =>
        r.uid === req.uid ? { ...r, status: 'approved' } : r
      )
      await updateDoc(doc(db, 'games', selectedGame.id), { requests: updatedRequests })
      toast.success(`${req.name} approved and assigned`)
    } catch (err) { toast.error('Failed: ' + err.message) }
    finally { setAssigning(null) }
  }

  const handleDeclineRequest = async (req) => {
    if (!selectedGame) return
    const updatedRequests = (selectedGame.requests ?? []).map(r =>
      r.uid === req.uid ? { ...r, status: 'declined' } : r
    )
    try {
      await updateDoc(doc(db, 'games', selectedGame.id), { requests: updatedRequests })
      toast.success('Request declined')
    } catch { toast.error('Failed to decline') }
  }

  const handleAssign = async (official) => {
    if (!selectedGame || !user || !selectedRole) return
    // Prevent assigning same official twice on same game
    const alreadyOnGame = (selectedGame.assignedOfficials ?? []).some(o => o.uid === official.uid)
    if (alreadyOnGame) { toast.error(`${official.displayName} is already assigned to this game`); return }
    setAssigning(official.uid)
    try {
      const pay = lookupPay(selectedGame.division, selectedRole)
      await assignOfficial(selectedGame.id, {
        uid: official.uid, name: official.displayName,
        role: selectedRole, pay,
      }, user.uid)
      toast.success(`${official.displayName} assigned as ${selectedRole}`)
    } catch (err) { toast.error('Failed to assign: ' + err.message) }
    finally { setAssigning(null) }
  }

  const handleUnassign = async (uid, role) => {
    if (!selectedGame) return
    setAssigning(uid)
    try {
      const updatedOfficials = (selectedGame.assignedOfficials ?? []).filter(o => !(o.uid === uid && o.role === role))
      const updatedUids = [...new Set(updatedOfficials.map(o => o.uid))]
      const refsN = Number(selectedGame.refs ?? 0), linesN = Number(selectedGame.linesmen ?? 0), sksN = Number(selectedGame.scorekeepers ?? 0)
      const refsA = updatedOfficials.filter(o => o.role?.startsWith('Referee')).length
      const linesA = updatedOfficials.filter(o => o.role?.startsWith('Linesman')).length
      const sksA  = updatedOfficials.filter(o => o.role?.startsWith('Scorekeeper')).length
      const refSlotsFull = refsA >= refsN && linesA >= linesN
      const skSlotsFull  = sksA >= sksN
      await updateDoc(doc(db, 'games', selectedGame.id), {
        assignedOfficials: updatedOfficials, assignedUids: updatedUids,
        refSlotsFull, skSlotsFull, allSlotsFull: refSlotsFull && skSlotsFull,
        status: updatedUids.length === 0 ? 'open' : 'assigned', updatedAt: serverTimestamp(),
      })
      toast.success('Official unassigned')
    } catch (err) { toast.error('Failed to unassign: ' + err.message) }
    finally { setAssigning(null) }
  }

  // ── Compute stats ──────────────────────────────────────────────────────────
  const today = startOfDay(new Date())

  // Enrich groups with their games
  const enrichedGroups = groups.map(g => {
    const games = allGames.filter(gm => gm.groupId === g.id)
    const needsAssigning = games.some(gm => !isMySlotsFull(gm))
    const allFilled      = games.length > 0 && games.every(gm => isMySlotsFull(gm))
    const firstGame      = games[0] // already sorted by date
    return { ...g, games, needsAssigning, allFilled, firstGame }
  }).sort((a, b) => {
    const da = a.firstGame?.gameDate?.toDate?.() ?? new Date(a.startDate ?? 9999999999999)
    const db_ = b.firstGame?.gameDate?.toDate?.() ?? new Date(b.startDate ?? 9999999999999)
    return da - db_
  })

  const totalGroups      = enrichedGroups.length
  const needsAssigning   = enrichedGroups.filter(g => g.needsAssigning).length
  const fullyFilled      = enrichedGroups.filter(g => g.allFilled).length
  const totalGames       = allGames.length
  const openGames        = allGames.filter(gm => !isMySlotsFull(gm)).length
  const filledGames      = allGames.filter(gm => isMySlotsFull(gm)).length

  const filteredGroups = enrichedGroups.filter(g => {
    if (filter === 'needs_assigning') return g.needsAssigning
    if (filter === 'filled')          return g.allFilled
    return true
  })

  const getRelevantOfficials = () => {
    if (isBothScheduler) return roster
    if (isRefScheduler)  return roster.filter(o => (o.subRoles ?? []).includes('referee'))
    if (isSKScheduler)   return roster.filter(o => (o.subRoles ?? []).includes('scorekeeper'))
    return roster
  }

  // Sync selectedGame from live allGames
  useEffect(() => {
    if (!selectedGame) return
    const live = allGames.find(g => g.id === selectedGame.id)
    if (live) setSelectedGame(live)
  }, [allGames])

  if (loading || gamesLoading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Game Groups</h1>

      {/* ── Stats containers ── */}
      <div className={styles.statsRow}>
        <div className={[styles.statCard, filter === 'all' ? styles.statActive : ''].join(' ')} onClick={() => setFilter('all')}>
          <div className={styles.statNum}>{totalGroups}</div>
          <div className={styles.statLabel}>Total Groups</div>
        </div>
        <div className={[styles.statCard, filter === 'needs_assigning' ? styles.statActive : ''].join(' ')}
          onClick={() => setFilter('needs_assigning')} style={{ borderColor: needsAssigning > 0 ? 'var(--orange)' : undefined }}>
          <div className={styles.statNum} style={{ color: needsAssigning > 0 ? 'var(--orange)' : undefined }}>{needsAssigning}</div>
          <div className={styles.statLabel}>Need Assigning</div>
        </div>
        <div className={[styles.statCard, filter === 'filled' ? styles.statActive : ''].join(' ')}
          onClick={() => setFilter('filled')} style={{ borderColor: fullyFilled > 0 ? 'var(--green)' : undefined }}>
          <div className={styles.statNum} style={{ color: fullyFilled > 0 ? 'var(--green)' : undefined }}>{fullyFilled}</div>
          <div className={styles.statLabel}>Fully Filled</div>
        </div>
        <div className={styles.statCard} style={{ cursor:'default' }}>
          <div className={styles.statNum}>{openGames}</div>
          <div className={styles.statLabel}>Open Game Slots</div>
        </div>
        <div className={styles.statCard} style={{ cursor:'default' }}>
          <div className={styles.statNum}>{filledGames}</div>
          <div className={styles.statLabel}>Filled Game Slots</div>
        </div>
      </div>

      {/* ── Filter label ── */}
      {filter !== 'all' && (
        <div className={styles.filterLabel}>
          Showing: <strong>{filter === 'needs_assigning' ? 'Groups needing assignment' : 'Fully filled groups'}</strong>
          <button className={styles.clearFilter} onClick={() => setFilter('all')}>✕ Clear</button>
        </div>
      )}

      {/* ── Two-column layout when game is selected ── */}
      <div className={selectedGame ? styles.splitLayout : styles.fullLayout}>

        {/* ── Group + game list ── */}
        <div className={styles.groupList}>
          {filteredGroups.length === 0 ? (
            <Card><CardBody>
              <EmptyState icon="📋" title="No groups match this filter"
                message="Try selecting a different filter above." />
            </CardBody></Card>
          ) : (
            filteredGroups.map(group => (
              <div key={group.id} className={[styles.groupCard, selectedGroup === group.id ? styles.groupCardOpen : ''].join(' ')}>
                {/* Group header */}
                <div className={styles.groupHeader} onClick={() => setSelectedGroup(id => id === group.id ? null : group.id)}>
                  <div className={styles.groupHeaderLeft}>
                    <div className={styles.groupName}>{group.name}</div>
                    <div className={styles.groupMeta}>
                      {group.directorName && <span>Director: {group.directorName}</span>}
                      {group.games[0] && <span>First game: {format(group.games[0].gameDate?.toDate?.() ?? new Date(group.games[0].gameDate), 'MMM d, yyyy')}</span>}
                      <span>{group.games.length} game{group.games.length !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                  <div className={styles.groupHeaderRight}>
                    {group.needsAssigning
                      ? <Badge variant="red">{group.games.filter(g => !isMySlotsFull(g)).length} open</Badge>
                      : <Badge variant="green">Filled ✓</Badge>
                    }
                    <span className={styles.chevron}>{selectedGroup === group.id ? '▲' : '▼'}</span>
                  </div>
                </div>

                {/* Fill bar */}
                {(() => {
                  const total  = group.games.length
                  const filled = group.games.filter(g => isMySlotsFull(g)).length
                  const pct    = total ? Math.round(filled / total * 100) : 0
                  return (
                    <div className={styles.fillBar}>
                      <div className={styles.fillProgress} style={{ width: `${pct}%` }} />
                    </div>
                  )
                })()}

                {/* Game list */}
                {selectedGroup === group.id && (
                  <div className={styles.gameList}>
                    {group.games.length === 0 ? (
                      <div className={styles.noGames}>No games in this group yet.</div>
                    ) : (
                      group.games.map(game => {
                        const gd        = game.gameDate?.toDate?.() ?? new Date(game.gameDate)
                        const isPast    = isBefore(gd, today)
                        const myFilled  = isMySlotsFull(game)
                        const isActive  = selectedGame?.id === game.id
                        return (
                          <div key={game.id}
                            className={[styles.gameRow, isActive ? styles.gameRowActive : '', isPast ? styles.gameRowPast : ''].join(' ')}
                            onClick={() => setSelectedGame(isActive ? null : game)}
                          >
                            <div className={styles.gameRowDate}>
                              <div className={styles.gameMonth}>{format(gd, 'MMM')}</div>
                              <div className={styles.gameDay}>{format(gd, 'd')}</div>
                            </div>
                            <div className={styles.gameRowInfo}>
                              <div className={styles.gameTitle}>{game.homeTeam} vs {game.awayTeam}</div>
                              <div className={styles.gameMeta}>{format(gd, 'h:mm a')} · {game.venue}{game.division ? ` · ${game.division}` : ''}</div>
                              <div className={styles.gameCrew}>
                                {(() => {
                                  const all = game.assignedOfficials ?? []
                                  const mine = all.filter(o => {
                                    if (isBothScheduler) return true
                                    if (isRefScheduler) return o.role?.startsWith('Referee') || o.role?.startsWith('Linesman')
                                    if (isSKScheduler)  return o.role?.startsWith('Scorekeeper')
                                    return true
                                  })
                                  return mine.length > 0
                                    ? mine.map(o => `${o.name?.split(' ')[0]} (${o.role})`).join(', ')
                                    : <span style={{ color:'var(--color-muted)', fontStyle:'italic' }}>No officials assigned</span>
                                })()}
                              </div>
                            </div>
                            <div className={styles.gameRowRight}>
                              <Badge variant={myFilled ? 'green' : 'red'}>{myFilled ? 'Filled' : 'Open'}</Badge>
                              {!isPast && !myFilled && (
                                <span className={styles.assignHint}>Click to assign →</span>
                              )}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* ── Assign panel ── */}
        {selectedGame && (
          <div className={styles.assignPanel}>
            {/* Header */}
            <div className={styles.assignPanelHeader}>
              <div style={{ flex:1 }}>
                <div className={styles.assignPanelTitle}>{selectedGame.homeTeam} vs {selectedGame.awayTeam}</div>
                <div className={styles.assignPanelMeta}>
                  {format(selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate), 'EEE, MMM d · h:mm a')}
                  {' · '}{selectedGame.venue}
                  {selectedGame.division ? ` · ${selectedGame.division}` : ''}
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0, alignItems:'flex-start' }}>
                <Button size="sm" variant="teal" loading={assigning === 'auto'} onClick={() => handleAutoAssign(selectedGame)}>
                  ⚡ Auto-Assign
                </Button>
                <button className={styles.closePanel} onClick={() => setSelectedGame(null)}>✕</button>
              </div>
            </div>

            {/* Crew slots */}
            <div className={styles.crewSection}>
              <div className={styles.crewSectionTitle}>Crew Slots — click a slot to assign</div>
              {buildCrewSlots(selectedGame).length === 0 ? (
                <div className={styles.noSlots}>No {isRefScheduler && !isBothScheduler ? 'referee' : 'scorekeeper'} slots for this game.</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {buildCrewSlots(selectedGame).map((slot, i) => (
                    <div key={i} className={[
                      styles.crewSlot,
                      slot.assignedOfficial ? styles.slotFilled : styles.slotOpen,
                      selectedRole === slot.role && !slot.assignedOfficial ? styles.slotSelecting : '',
                    ].join(' ')}>
                      <div className={styles.slotRole}>{slot.role}</div>
                      {slot.assignedOfficial ? (
                        <div className={styles.slotAssigned}>
                          <span className={styles.slotName}>✓ {slot.assignedOfficial.name}</span>
                          <button className={styles.unassignBtn}
                            onClick={() => handleUnassign(slot.assignedOfficial.uid, slot.role)}
                            title="Unassign">✕</button>
                        </div>
                      ) : (
                        <button className={[styles.selectSlotBtn, selectedRole === slot.role ? styles.selectSlotBtnActive : ''].join(' ')}
                          onClick={() => setSelectedRole(slot.role)}>
                          {selectedRole === slot.role ? '← Selecting from list' : 'Select Official'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Panel tabs: Manual | Requests */}
            <div className={styles.panelTabRow}>
              <button className={[styles.panelTab, assignTab === 'manual' ? styles.panelTabActive : ''].join(' ')}
                onClick={() => setAssignTab('manual')}>Manual Assign</button>
              <button className={[styles.panelTab, assignTab === 'requests' ? styles.panelTabActive : ''].join(' ')}
                onClick={() => setAssignTab('requests')}>
                Requests
                {(selectedGame.requests ?? []).filter(r => r.status === 'pending').length > 0 && (
                  <span className={styles.reqBadge}>{(selectedGame.requests ?? []).filter(r => r.status === 'pending').length}</span>
                )}
              </button>
            </div>

            {/* Manual Assign tab */}
            {assignTab === 'manual' && (
              <>
                {/* Search + filters */}
                <div className={styles.officialToolbar}>
                  <input
                    className={styles.searchInput}
                    placeholder="Search officials…"
                    value={officialSearch}
                    onChange={e => setOfficialSearch(e.target.value)}
                  />
                  <select className={styles.sortSelect} value={officialSort} onChange={e => setOfficialSort(e.target.value)}>
                    <option value="availability">Sort: Availability first</option>
                    <option value="name">Sort: Name A–Z</option>
                    <option value="games">Sort: Fewest games</option>
                  </select>
                </div>
                <div className={styles.availCheckRow}>
                  <input type="checkbox" id="showUnavailPanel" checked={showUnavailable}
                    onChange={e => setShowUnavailable(e.target.checked)} style={{ width:14, height:14 }} />
                  <label htmlFor="showUnavailPanel" style={{ fontSize:12, cursor:'pointer', color:'var(--color-muted)' }}>
                    Show unavailable officials
                  </label>
                </div>

                {/* Assigning role indicator */}
                {selectedRole && (
                  <div className={styles.assigningRole}>
                    Assigning to: <strong>{selectedRole}</strong>
                    <span style={{ fontSize:11, color:'var(--color-muted)', marginLeft:8 }}>select a slot above to change</span>
                  </div>
                )}

                {/* Official list */}
                <div className={styles.officialList}>
                  {(() => {
                    const gd = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
                    const gameTimeStr = format(gd, 'HH:mm')

                    const officials = getRelevantOfficials()
                      .map(o => {
                        const dayData = officialAvailability[o.uid]
                        const avail = dayData === undefined ? 'unknown'
                          : checkAvailability(dayData, gameTimeStr, selectedGame.duration ?? 1.5)
                        return { ...o, avail }
                      })
                      .filter(o => {
                        if (!showUnavailable && o.avail === 'unavailable') return false
                        if (officialSearch) {
                          const q = officialSearch.toLowerCase()
                          return o.displayName?.toLowerCase().includes(q)
                        }
                        return true
                      })
                      .sort((a, b) => {
                        if (officialSort === 'availability') {
                          const order = { available:0, unknown:1, insufficient:2, unavailable:3 }
                          return (order[a.avail] ?? 9) - (order[b.avail] ?? 9)
                        }
                        if (officialSort === 'name') return (a.displayName ?? '').localeCompare(b.displayName ?? '')
                        if (officialSort === 'games') return (a.gameCount ?? 0) - (b.gameCount ?? 0)
                        return 0
                      })

                    if (officials.length === 0) return (
                      <div style={{ padding:'20px', textAlign:'center', color:'var(--color-muted)', fontSize:13 }}>
                        {officialSearch ? 'No officials match your search.' : 'No available officials for this time slot.'}
                      </div>
                    )

                    return officials.map(official => {
                      const uid = official.uid
                      const assignedToRole = (selectedGame.assignedOfficials ?? []).find(o => o.uid === uid && o.role === selectedRole)
                      const assignedElsewhere = (selectedGame.assignedOfficials ?? []).find(o => o.uid === uid && o.role !== selectedRole)
                      const slotFull = buildCrewSlots(selectedGame).find(s => s.role === selectedRole)?.assignedOfficial != null

                      return (
                        <div key={uid} className={[styles.officialRow, assignedToRole ? styles.officialRowAssigned : ''].join(' ')}>
                          <Avatar name={official.displayName} size="sm" />
                          <div className={styles.officialInfo}>
                            <div className={styles.officialName}>{official.displayName}</div>
                            <div className={styles.officialMeta}>
                              {(official.subRoles ?? []).filter(s => ['referee','scorekeeper'].includes(s)).join(', ') || 'Official'}
                              <span style={{ marginLeft:8, fontWeight:600, fontSize:11, color: AVAIL_COLORS[official.avail] }}>
                                {official.avail === 'available'    ? '✓ Available'
                                 : official.avail === 'insufficient' ? '⚠ Outside buffer'
                                 : official.avail === 'unavailable'  ? '✗ Unavailable'
                                 : 'No availability set'}
                              </span>
                              {assignedElsewhere && (
                                <span style={{ marginLeft:6, fontSize:11, color:'var(--blue)' }}>· Already assigned ({assignedElsewhere.role})</span>
                              )}
                            </div>
                          </div>
                          {assignedToRole ? (
                            <Button size="sm" variant="ghost" style={{ color:'var(--orange)', borderColor:'var(--orange-light)' }}
                              loading={assigning === uid}
                              onClick={() => handleUnassign(uid, selectedRole)}>
                              Unassign
                            </Button>
                          ) : slotFull ? (
                            <Badge variant="gray">Slot full</Badge>
                          ) : (
                            <Button size="sm"
                              variant={official.avail === 'unavailable' ? 'ghost' : official.avail === 'available' ? 'primary' : 'secondary'}
                              loading={assigning === uid}
                              onClick={() => handleAssign(official)}>
                              Assign
                            </Button>
                          )}
                        </div>
                      )
                    })
                  })()}
                </div>
              </>
            )}

            {/* Requests tab */}
            {assignTab === 'requests' && (
              <div className={styles.officialList}>
                {(selectedGame.requests ?? []).length === 0 ? (
                  <div style={{ padding:'24px', textAlign:'center', color:'var(--color-muted)', fontSize:13 }}>
                    No officials have requested this game yet.
                  </div>
                ) : (
                  (selectedGame.requests ?? []).map((req, i) => (
                    <div key={i} className={styles.officialRow}>
                      <Avatar name={req.name} size="sm" />
                      <div className={styles.officialInfo}>
                        <div className={styles.officialName}>{req.name}</div>
                        <div className={styles.officialMeta}>
                          {req.note && <span style={{ fontStyle:'italic' }}>"{req.note}"</span>}
                        </div>
                      </div>
                      {req.status === 'pending' ? (
                        <div style={{ display:'flex', gap:6 }}>
                          <Button size="sm" variant="teal" loading={assigning === req.uid}
                            onClick={() => handleApproveRequest(req)}>✓</Button>
                          <Button size="sm" variant="ghost"
                            onClick={() => handleDeclineRequest(req)}>✗</Button>
                        </div>
                      ) : (
                        <Badge variant={req.status === 'approved' ? 'green' : 'red'}>{req.status}</Badge>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
