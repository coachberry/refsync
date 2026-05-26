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

  const handleAssign = async (official) => {
    if (!selectedGame || !user || !selectedRole) return
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
                      <span className={styles.fillLabel}>{filled}/{total} filled</span>
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
                                {(game.assignedOfficials ?? []).length > 0
                                  ? game.assignedOfficials.map(o => `${o.name?.split(' ')[0]} (${o.role})`).join(', ')
                                  : <span style={{ color:'var(--color-muted)', fontStyle:'italic' }}>No officials assigned</span>
                                }
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
            <div className={styles.assignPanelHeader}>
              <div>
                <div className={styles.assignPanelTitle}>{selectedGame.homeTeam} vs {selectedGame.awayTeam}</div>
                <div className={styles.assignPanelMeta}>
                  {format(selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate), 'EEE, MMM d · h:mm a')} · {selectedGame.venue}
                </div>
              </div>
              <button className={styles.closePanel} onClick={() => setSelectedGame(null)}>✕</button>
            </div>

            {/* Crew slots */}
            <div className={styles.crewSection}>
              <div className={styles.crewSectionTitle}>Crew Slots</div>
              {buildCrewSlots(selectedGame).length === 0 ? (
                <div className={styles.noSlots}>No {isRefScheduler ? 'referee' : 'scorekeeper'} slots for this game.</div>
              ) : buildCrewSlots(selectedGame).map((slot, i) => (
                <div key={i} className={[styles.crewSlot, slot.assignedOfficial ? styles.slotFilled : styles.slotOpen].join(' ')}>
                  <div className={styles.slotRole}>{slot.role}</div>
                  {slot.assignedOfficial ? (
                    <div className={styles.slotAssigned}>
                      <span className={styles.slotName}>{slot.assignedOfficial.name}</span>
                      <button className={styles.unassignBtn}
                        onClick={() => handleUnassign(slot.assignedOfficial.uid, slot.role)}
                        title="Unassign">✕</button>
                    </div>
                  ) : (
                    <div className={styles.slotOpen}>
                      <span className={styles.slotOpenLabel}>Open</span>
                      <button className={[styles.selectSlotBtn, selectedRole === slot.role ? styles.selectSlotBtnActive : ''].join(' ')}
                        onClick={() => setSelectedRole(slot.role)}>
                        {selectedRole === slot.role ? '← Assigning' : 'Select'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Assigning role indicator */}
            {selectedRole && (
              <div className={styles.assigningRole}>
                Assigning: <strong>{selectedRole}</strong>
              </div>
            )}

            {/* Availability checkbox */}
            <div className={styles.availCheck}>
              <input type="checkbox" id="showUnavailPanel" checked={showUnavailable}
                onChange={e => setShowUnavailable(e.target.checked)} style={{ width:14, height:14 }} />
              <label htmlFor="showUnavailPanel" style={{ fontSize:12.5, cursor:'pointer', color:'var(--color-muted)' }}>
                Show unavailable officials
              </label>
            </div>

            {/* Official list */}
            <div className={styles.officialList}>
              {getRelevantOfficials()
                .filter(o => {
                  const gd = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
                  const dayData = officialAvailability[o.uid]
                  const avail = dayData === undefined ? 'unknown'
                    : checkAvailability(dayData, format(gd, 'HH:mm'), selectedGame.duration ?? 1.5)
                  return showUnavailable || avail !== 'unavailable'
                })
                .map(official => {
                  const uid     = official.uid
                  const gd      = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
                  const dayData = officialAvailability[uid]
                  const avail   = dayData === undefined ? 'unknown'
                    : checkAvailability(dayData, format(gd, 'HH:mm'), selectedGame.duration ?? 1.5)
                  const assigned    = (selectedGame.assignedOfficials ?? []).find(o => o.uid === uid && o.role === selectedRole)
                  const assignedAny = (selectedGame.assignedOfficials ?? []).find(o => o.uid === uid)
                  const slotFull    = buildCrewSlots(selectedGame).find(s => s.role === selectedRole)?.assignedOfficial != null

                  return (
                    <div key={uid} className={[styles.officialRow, assigned ? styles.officialRowAssigned : ''].join(' ')}>
                      <Avatar name={official.displayName} size="sm" />
                      <div className={styles.officialInfo}>
                        <div className={styles.officialName}>{official.displayName}</div>
                        <div className={styles.officialMeta}>
                          {(official.subRoles ?? []).filter(s => ['referee','scorekeeper'].includes(s)).join(', ') || 'Official'}
                          <span style={{ marginLeft:8, fontWeight:600, color: AVAIL_COLORS[avail] }}>
                            {avail === 'available' ? '✓ Available' : avail === 'insufficient' ? '⚠ Outside buffer' : avail === 'unavailable' ? '✗ Unavailable' : 'No availability set'}
                          </span>
                        </div>
                      </div>
                      {assigned ? (
                        <Button size="sm" variant="ghost" style={{ color:'var(--orange)' }}
                          loading={assigning === uid}
                          onClick={() => handleUnassign(uid, selectedRole)}>
                          Unassign
                        </Button>
                      ) : slotFull ? (
                        <Badge variant="gray">Slot filled</Badge>
                      ) : (
                        <Button size="sm" variant={avail === 'unavailable' ? 'ghost' : 'primary'}
                          loading={assigning === uid}
                          onClick={() => handleAssign(official)}>
                          Assign
                        </Button>
                      )}
                    </div>
                  )
                })
              }
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
