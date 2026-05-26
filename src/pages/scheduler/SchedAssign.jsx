import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useGameGroups } from '@/hooks/useGameGroups'
import { useGroupGames } from '@/hooks/useGames'
import { useRoster } from '@/hooks/useRoster'
import { db } from '@/lib/firebase'
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, arrayUnion, serverTimestamp, writeBatch, getDoc
} from 'firebase/firestore'
import { assignOfficial } from '@/services/firestore'
import { startThread, sendMessage, getThreadId } from '@/services/messaging'
import { Card, CardHeader, CardTitle, CardBody, Badge, statusBadge, EmptyState } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/LoadingSpinner'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import styles from './SchedAssign.module.css'

const HOCKEY_ROLES = ['Referee 1', 'Referee 2', 'Linesman 1', 'Linesman 2', 'Scorekeeper']

// Time helpers
const toMins = (t) => { const [h, m] = (t ?? '00:00').split(':').map(Number); return h * 60 + m }

// Check if official's availability covers the game window + 1hr buffer
const checkAvailability = (dayData, gameStartTime, gameDuration) => {
  if (!dayData || dayData.status === 'unavailable_all_day') return 'unavailable'
  if (dayData.status === 'available_all_day') return 'available'
  if (dayData.status === 'partial') {
    const bufferMins = 60
    const gameStart  = toMins(gameStartTime)
    const gameEnd    = gameStart + (gameDuration ?? 1.5) * 60
    const neededStart = gameStart - bufferMins
    const neededEnd   = gameEnd   + bufferMins
    const covered = (dayData.windows ?? []).some(w =>
      toMins(w.start) <= neededStart && toMins(w.end) >= neededEnd
    )
    return covered ? 'available' : 'insufficient'
  }
  return 'unavailable'
}

const AVAIL_META = {
  available:   { label: '✓ Available',                color: 'var(--green)',  btnVariant: 'primary' },
  insufficient:{ label: '⚠ Outside buffer',           color: 'var(--orange)', btnVariant: 'ghost'   },
  unavailable: { label: '✗ Unavailable',              color: 'var(--color-muted)', btnVariant: 'ghost' },
  unknown:     { label: 'No availability set',        color: 'var(--color-muted)', btnVariant: 'ghost' },
}

export default function SchedAssign() {
  const { user, profile } = useAuth()
  const { isRefScheduler, isSKScheduler, isBothScheduler } = useSubRoles()
  const { groups } = useGameGroups()
  const { roster } = useRoster()
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const { games, open, loading: gamesLoading } = useGroupGames(selectedGroupId)
  const [selectedGame, setSelectedGame] = useState(null)
  const [selectedRole, setSelectedRole] = useState('Scorekeeper')
  const [officialAvailability, setOfficialAvailability] = useState({}) // { uid: dayData }
  const [loadingAvail, setLoadingAvail] = useState(false)
  const [assigning, setAssigning]       = useState(null)
  const [approving, setApproving]       = useState(null)
  const [tab, setTab]                   = useState('requests')
  const [showUnavailable, setShowUnavailable] = useState(false)

  // Build crew slot list — only show slots this scheduler is responsible for
  const buildCrewSlots = (game) => {
    const slots = []
    const assigned = game.assignedOfficials ?? []
    const refs  = Number(game.refs  ?? 0)
    const lines = Number(game.linesmen ?? 0)
    const sks   = Number(game.scorekeepers ?? 0)

    // Referee slots — only for ref schedulers
    if (isRefScheduler || isBothScheduler) {
      for (let i = 1; i <= refs;  i++) {
        const role = refs === 1 ? 'Referee' : `Referee ${i}`
        slots.push({ role, type: 'ref', assignedOfficial: assigned.find(o => o.role === role) ?? null })
      }
      for (let i = 1; i <= lines; i++) {
        const role = lines === 1 ? 'Linesman' : `Linesman ${i}`
        slots.push({ role, type: 'ref', assignedOfficial: assigned.find(o => o.role === role) ?? null })
      }
    }

    // Scorekeeper slots — only for SK schedulers
    if (isSKScheduler || isBothScheduler) {
      for (let i = 1; i <= sks; i++) {
        const role = sks === 1 ? 'Scorekeeper' : `Scorekeeper ${i}`
        slots.push({ role, type: 'sk', assignedOfficial: assigned.find(o => o.role === role) ?? null })
      }
    }

    return slots
  }

  // Filter roster to only show officials relevant to this scheduler's type
  const getRelevantOfficials = () => {
    if (isBothScheduler) return roster
    if (isRefScheduler)  return roster.filter(o => (o.subRoles ?? []).includes('referee'))
    if (isSKScheduler)   return roster.filter(o => (o.subRoles ?? []).includes('scorekeeper'))
    return roster
  }

  const isSlotFull = (game, role) => {
    return (game.assignedOfficials ?? []).some(o => o.role === role)
  }

  // Unassign an official from a role
  const handleUnassign = async (uid, role) => {
    if (!selectedGame) return
    setAssigning(uid)
    try {
      const updatedOfficials = (selectedGame.assignedOfficials ?? []).filter(o => !(o.uid === uid && o.role === role))
      const updatedUids = [...new Set(updatedOfficials.map(o => o.uid))]

      // Recompute slot fill status
      const refsNeeded  = Number(selectedGame.refs ?? 0)
      const linesNeeded = Number(selectedGame.linesmen ?? 0)
      const sksNeeded   = Number(selectedGame.scorekeepers ?? 0)
      const refsAssigned  = updatedOfficials.filter(o => o.role?.startsWith('Referee')).length
      const linesAssigned = updatedOfficials.filter(o => o.role?.startsWith('Linesman')).length
      const sksAssigned   = updatedOfficials.filter(o => o.role?.startsWith('Scorekeeper')).length
      const refSlotsFull = refsAssigned >= refsNeeded && linesAssigned >= linesNeeded
      const skSlotsFull  = sksAssigned >= sksNeeded
      const allSlotsFull = refSlotsFull && skSlotsFull

      await updateDoc(doc(db, 'games', selectedGame.id), {
        assignedOfficials: updatedOfficials,
        assignedUids: updatedUids,
        refSlotsFull,
        skSlotsFull,
        allSlotsFull,
        status: updatedUids.length === 0 ? 'open' : allSlotsFull ? 'assigned' : 'open',
        updatedAt: serverTimestamp(),
      })
      toast.success('Official unassigned')
    } catch (err) {
      toast.error('Failed to unassign: ' + err.message)
    } finally { setAssigning(null) }
  }

  // Subscribe to game requests for selected game
  const [gameRequests, setGameRequests] = useState([])
  useEffect(() => {
    if (!selectedGame?.id) { setGameRequests([]); return }
    // Refresh selected game from live games list
    const live = games.find(g => g.id === selectedGame.id)
    if (live) { setSelectedGame(live); setGameRequests(live.requests ?? []) }
  }, [games, selectedGame?.id])

  // Auto-assign via Cloud Function
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
      if (data.assigned?.length === 0) {
        toast('No available officials found for this time slot', { icon: '⚠️' })
      } else {
        toast.success(`${data.assigned.length} official${data.assigned.length > 1 ? 's' : ''} auto-assigned!`)
      }
    } catch (err) {
      toast.error('Auto-assign failed: ' + err.message)
    } finally { setAssigning(null) }
  }
  useEffect(() => {
    if (!selectedGame || !roster.length) return
    const gameDate = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
    const dateStr  = format(gameDate, 'yyyy-MM-dd')
    setLoadingAvail(true)
    Promise.all(
      roster.map(async o => {
        const uid = o.uid ?? o.id
        try {
          const snap = await getDoc(doc(db, 'users', uid, 'availability', 'data'))
          const dayData = snap.exists() ? (snap.data()[dateStr] ?? null) : null
          return [uid, dayData]
        } catch { return [uid, null] }
      })
    ).then(entries => {
      setOfficialAvailability(Object.fromEntries(entries))
      setLoadingAvail(false)
    })
  }, [selectedGame?.id, roster.length])

  useEffect(() => {
    if (groups.length && !selectedGroupId) setSelectedGroupId(groups[0].id)
  }, [groups])

  useEffect(() => {
    if (open.length && (!selectedGame || !games.find(g => g.id === selectedGame?.id))) {
      setSelectedGame(open[0])
    }
  }, [open])

  // Load pricing sheet for pay lookup
  const [pricingSheet, setPricingSheet] = useState(null)
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid, 'pricingSheet', 'data'))
      .then(snap => setPricingSheet(snap.exists() ? snap.data() : { defaultPay: 0, rules: [] }))
      .catch(() => {})
  }, [user])

  const lookupPay = (division, role) => {
    if (!pricingSheet) return 0
    const rule = (pricingSheet.rules ?? []).find(r =>
      r.division?.toLowerCase() === division?.toLowerCase() && r.role === role
    )
    return rule?.pay ?? pricingSheet.defaultPay ?? 0
  }
  useEffect(() => {
    if (!selectedGame) return
    const slots = buildCrewSlots(selectedGame)
    const firstOpen = slots.find(s => !s.assignedOfficial)
    if (firstOpen) setSelectedRole(firstOpen.role)
  }, [selectedGame?.id])

  // Approve a scorekeeper request — assigns them to the game
  const handleApprove = async (request) => {
    if (!selectedGame || !user) return
    setApproving(request.uid)
    try {
      const batch = writeBatch(db)
      const gameRef = doc(db, 'games', selectedGame.id)

      // Add to assignedOfficials
      batch.update(gameRef, {
        assignedOfficials: arrayUnion({
          uid: request.uid, name: request.name,
          role: selectedRole, status: 'accepted',
          pay: selectedGame.payRate ?? 0,
          assignedAt: new Date().toISOString(),
        }),
        assignedUids: arrayUnion(request.uid),
        status: 'assigned',
        updatedAt: serverTimestamp(),
      })

      // Mark this request as approved, others as reviewed
      const updatedRequests = (selectedGame.requests ?? []).map(r => ({
        ...r,
        status: r.uid === request.uid ? 'approved' : r.status === 'pending' ? 'reviewed' : r.status,
      }))
      batch.update(gameRef, { requests: updatedRequests })
      await batch.commit()

      // Notify the scorekeeper via message
      const threadId = getThreadId(user.uid, request.uid)
      await startThread(user.uid, profile?.displayName, request.uid, request.name)
      const gameDate = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
      await sendMessage(
        threadId, user.uid, profile?.displayName,
        `✅ You've been approved to work ${selectedGame.homeTeam} vs ${selectedGame.awayTeam} on ${format(gameDate, 'MMM d')} at ${format(gameDate, 'h:mm a')}. Pay: $${(selectedGame.payRate ?? 0).toFixed(2)}`,
        request.uid
      )

      toast.success(`${request.name} approved!`)
    } catch { toast.error('Failed to approve') }
    finally { setApproving(null) }
  }

  // Decline a request
  const handleDecline = async (request) => {
    if (!selectedGame) return
    try {
      const updatedRequests = (selectedGame.requests ?? []).map(r =>
        r.uid === request.uid ? { ...r, status: 'declined' } : r
      )
      await updateDoc(doc(db, 'games', selectedGame.id), { requests: updatedRequests, updatedAt: serverTimestamp() })

      // Notify
      const threadId = getThreadId(user.uid, request.uid)
      await startThread(user.uid, profile?.displayName, request.uid, request.name)
      const gameDate = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
      await sendMessage(
        threadId, user.uid, profile?.displayName,
        `Sorry ${request.name}, this game slot has been filled. Keep an eye out for other games!`,
        request.uid
      )
      toast.success('Request declined')
    } catch { toast.error('Failed to decline') }
  }

  // Manual assign
  const handleManualAssign = async (official) => {
    if (!selectedGame || !user) return
    setAssigning(official.uid ?? official.id)
    try {
      const pay = lookupPay(selectedGame.division, selectedRole)
      await assignOfficial(selectedGame.id, {
        uid: official.uid ?? official.id,
        name: official.displayName,
        role: selectedRole,
        pay,
      }, user.uid)

      // Notify official
      const threadId = getThreadId(user.uid, official.uid)
      await startThread(user.uid, profile?.displayName, official.uid, official.displayName)
      const gameDate = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
      await sendMessage(
        threadId, user.uid, profile?.displayName,
        `📋 You've been assigned: ${selectedGame.homeTeam} vs ${selectedGame.awayTeam} on ${format(gameDate, 'MMM d')} at ${format(gameDate, 'h:mm a')}. Role: ${selectedRole} · Pay: $${(selectedGame.payRate ?? 0).toFixed(2)}. Please confirm!`,
        official.uid
      )
      toast.success(`${official.displayName} assigned`)
    } catch { toast.error('Failed to assign') }
    finally { setAssigning(null) }
  }

  // Notify all roster of open games (replaces the Excel email)
  const handleNotifyAll = async () => {
    const openGames = games.filter(g => g.status === 'open')
    if (!openGames.length) { toast.error('No open games to notify about'); return }
    if (!roster.length)    { toast.error('No officials on your roster'); return }

    try {
      const gameDate0 = openGames[0].gameDate?.toDate?.() ?? new Date(openGames[0].gameDate)
      const gameList = openGames.slice(0, 10).map(g => {
        const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
        return `• ${format(gd, 'MMM d h:mm a')} — ${g.homeTeam} vs ${g.awayTeam} @ ${g.venue} (${g.duration ?? 1.5}hr · $${(g.payRate ?? 0).toFixed(2)})`
      }).join('\n')

      const msg = `📋 NEW GAMES AVAILABLE — ${selectedGroupId ? groups.find(g => g.id === selectedGroupId)?.name : 'Upcoming Games'}\n\n${gameList}${openGames.length > 10 ? `\n…and ${openGames.length - 10} more` : ''}\n\nReply or tap on each game to request it. First come, first served — but scheduler has final approval.`

      await Promise.all(roster.map(async o => {
        const toUid = o.uid ?? o.id
        const threadId = getThreadId(user.uid, toUid)
        await startThread(user.uid, profile?.displayName, toUid, o.displayName)
        await sendMessage(threadId, user.uid, profile?.displayName, msg, toUid)
      }))

      toast.success(`${openGames.length} open games sent to ${roster.length} officials!`)
    } catch { toast.error('Failed to notify roster') }
  }

  const pendingRequests = selectedGame?.requests?.filter(r => r.status === 'pending') ?? []
  const alreadyAssigned = selectedGame?.assignedUids?.includes

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Assign Officials</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="secondary" onClick={handleNotifyAll}>📢 Notify Roster of Open Games</Button>
          <select className={styles.select} value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}>
            <option value="">Select a group…</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      </div>

      {!selectedGroupId ? (
        <Card><CardBody><EmptyState icon="📋" title="Select a game group above to get started" /></CardBody></Card>
      ) : (
        <div className={styles.layout}>
          {/* Games list */}
          <div className={styles.gamesPanel}>
            <Card>
              <CardHeader>
                <CardTitle>Games</CardTitle>
                <div style={{ display: 'flex', gap: 6 }}>
                  {isRefScheduler && !isBothScheduler && (
                    <>
                      <Badge variant="red">{games.filter(g => !g.refSlotsFull).length} open</Badge>
                      <Badge variant="green">{games.filter(g => g.refSlotsFull).length} filled</Badge>
                    </>
                  )}
                  {isSKScheduler && !isBothScheduler && (
                    <>
                      <Badge variant="red">{games.filter(g => !g.skSlotsFull).length} open</Badge>
                      <Badge variant="green">{games.filter(g => g.skSlotsFull).length} filled</Badge>
                    </>
                  )}
                  {isBothScheduler && (
                    <>
                      <Badge variant="red">{games.filter(g => !g.allSlotsFull).length} open</Badge>
                      <Badge variant="green">{games.filter(g => g.allSlotsFull).length} filled</Badge>
                    </>
                  )}
                </div>
              </CardHeader>
              <CardBody noPadding>
                {gamesLoading ? <div className={styles.center}><Spinner /></div>
                  : games.length === 0 ? <EmptyState icon="🏒" title="No games in this group yet" />
                  : games.map(game => {
                    const gameDate = game.gameDate?.toDate?.() ?? new Date(game.gameDate)
                    const isSelected = selectedGame?.id === game.id
                    const pendingReqs = (game.requests ?? []).filter(r => r.status === 'pending').length
                    return (
                      <div key={game.id}
                        className={[styles.gameItem, isSelected ? styles.gameItemSelected : ''].join(' ')}
                        onClick={() => setSelectedGame(game)}
                      >
                        <div className={styles.gameItemDate}>
                          <div className={styles.gameItemMonth}>{format(gameDate, 'MMM')}</div>
                          <div className={styles.gameItemDay}>{format(gameDate, 'd')}</div>
                        </div>
                        <div className={styles.gameItemInfo}>
                          <div className={styles.gameItemTitle}>{game.homeTeam} vs {game.awayTeam}</div>
                          <div className={styles.gameItemMeta}>
                            {format(gameDate, 'h:mm a')} · {game.venue}
                            {game.duration && ` · ${game.duration}hr`}
                            {game.division && ` · ${game.division}`}
                          </div>
                          <div className={styles.gameItemFooter}>
                            {(() => {
                              const myDone = isRefScheduler && !isBothScheduler ? game.refSlotsFull
                                          : isSKScheduler  && !isBothScheduler ? game.skSlotsFull
                                          : game.allSlotsFull
                              return <Badge variant={myDone ? 'green' : 'red'}>{myDone ? 'Filled' : 'Open'}</Badge>
                            })()}
                            {pendingReqs > 0 && <span className={styles.requestsBadge}>⚡ {pendingReqs} request{pendingReqs > 1 ? 's' : ''}</span>}
                            {game.assignedOfficials?.length > 0 && (
                              <span className={styles.crewLine}>
                                {game.assignedOfficials.map(o => o.name?.split(' ')[0]).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
              </CardBody>
            </Card>
          </div>

          {/* Right panel */}
          <div className={styles.assignPanel}>
            {selectedGame ? (
              <Card>
                <CardHeader>
                  <CardTitle>{selectedGame.homeTeam} vs {selectedGame.awayTeam}</CardTitle>
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <Badge variant={statusBadge(selectedGame.status)}>{selectedGame.status}</Badge>
                    <Button size="sm" variant="teal" loading={assigning === 'auto'}
                      onClick={() => handleAutoAssign(selectedGame)}>
                      ⚡ Auto-Assign
                    </Button>
                  </div>
                </CardHeader>

                {/* Game details */}
                <div className={styles.gameDetails}>
                  {(() => {
                    const gd = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
                    return (
                      <>
                        <span>📅 {format(gd, 'EEE, MMM d · h:mm a')}</span>
                        <span>📍 {selectedGame.venue}</span>
                        {selectedGame.duration && <span>⏱ {selectedGame.duration}hr</span>}
                        {selectedGame.division && <span>🎯 {selectedGame.division}</span>}
                      </>
                    )
                  })()}
                </div>

                {/* Crew slots */}
                <div className={styles.crewSlots}>
                  <div className={styles.crewSlotsTitle}>
                    {isBothScheduler ? 'Full Crew' : isRefScheduler ? 'Referee Slots' : 'Scorekeeper Slots'}
                    {!isBothScheduler && (
                      <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-muted)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                        (you manage {isRefScheduler ? 'refs & linesmen' : 'scorekeepers'} only)
                      </span>
                    )}
                  </div>
                  {buildCrewSlots(selectedGame).length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--color-muted)', fontStyle: 'italic', padding: '4px 0' }}>
                      No {isRefScheduler ? 'referee' : 'scorekeeper'} slots requested for this game.
                    </div>
                  ) : (
                    <div className={styles.crewSlotsList}>
                      {buildCrewSlots(selectedGame).map((slot, i) => {
                        const filled = slot.assignedOfficial
                        return (
                          <div key={i} className={[styles.crewSlot, filled ? styles.crewSlotFilled : styles.crewSlotEmpty].join(' ')}>
                            <div className={styles.crewSlotRole}>{slot.role}</div>
                            {filled ? (
                              <div className={styles.crewSlotAssigned}>
                                <span className={styles.crewSlotName}>{filled.name}</span>
                                <button className={styles.unassignBtn}
                                  onClick={() => handleUnassign(filled.uid, slot.role)}
                                  title="Unassign">✕</button>
                              </div>
                            ) : (
                              <div className={styles.crewSlotOpen}>
                                <span className={styles.crewSlotOpenLabel}>Open</span>
                                <button className={styles.assignToSlotBtn}
                                  onClick={() => setSelectedRole(slot.role)}>
                                  {selectedRole === slot.role ? '← Assigning' : 'Select'}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Tabs */}
                <div className={styles.panelTabs}>
                  <button className={[styles.panelTab, tab === 'requests' ? styles.panelTabActive : ''].join(' ')} onClick={() => setTab('requests')}>
                    Requests {pendingRequests.length > 0 && <span className={styles.requestsBadge}>{pendingRequests.length}</span>}
                  </button>
                  <button className={[styles.panelTab, tab === 'manual' ? styles.panelTabActive : ''].join(' ')} onClick={() => setTab('manual')}>
                    Manual Assign
                  </button>
                </div>

                <CardBody noPadding>
                  {tab === 'requests' && (
                    <div>
                      {(selectedGame.requests ?? []).length === 0 ? (
                        <EmptyState icon="📥" title="No requests yet" message="Officials will appear here when they request this game." />
                      ) : (
                        (selectedGame.requests ?? []).map((req, i) => (
                          <div key={i} className={[styles.requestRow, req.status === 'approved' ? styles.reqApproved : req.status === 'declined' ? styles.reqDeclined : ''].join(' ')}>
                            <Avatar name={req.name} size="sm" />
                            <div className={styles.reqInfo}>
                              <div className={styles.reqName}>{req.name}</div>
                              {req.note && <div className={styles.reqNote}>"{req.note}"</div>}
                              <div className={styles.reqTime}>{req.requestedAt ? format(new Date(req.requestedAt), 'MMM d, h:mm a') : ''}</div>
                            </div>
                            <div className={styles.reqStatus}>
                              {req.status === 'pending' && (
                                <div style={{ display: 'flex', gap: 6 }}>
                                  <Button size="sm" variant="teal" loading={approving === req.uid} onClick={() => handleApprove(req)}>✓ Approve</Button>
                                  <Button size="sm" variant="ghost" onClick={() => handleDecline(req)}>✗</Button>
                                </div>
                              )}
                              {req.status === 'approved' && <Badge variant="green">Approved</Badge>}
                              {req.status === 'declined' && <Badge variant="red">Declined</Badge>}
                              {req.status === 'reviewed' && <Badge variant="gray">Reviewed</Badge>}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {tab === 'manual' && (
                    <div>
                      {loadingAvail && <div style={{ textAlign:'center', padding:16 }}><Spinner size="sm" /></div>}
                      {roster.length === 0 ? (
                        <EmptyState icon="👥" title="No officials on your roster" message="Invite officials to your roster first." />
                      ) : (
                        <>
                          {/* Assigning to role indicator */}
                          <div style={{ padding:'10px 14px', background:'var(--color-surface-2)', borderBottom:'1px solid var(--color-border)', fontSize:13 }}>
                            Assigning: <strong>{selectedRole}</strong>
                            <span style={{ color:'var(--color-muted)', marginLeft:8, fontSize:12 }}>
                              (select a slot above to change)
                            </span>
                          </div>

                          {/* Show unavailable checkbox */}
                          <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--color-border)', display:'flex', alignItems:'center', gap:8 }}>
                            <input type="checkbox" id="showUnavail" checked={showUnavailable}
                              onChange={e => setShowUnavailable(e.target.checked)}
                              style={{ width:15, height:15, cursor:'pointer' }} />
                            <label htmlFor="showUnavail" style={{ fontSize:13, cursor:'pointer', color:'var(--color-muted)' }}>
                              Show unavailable officials
                            </label>
                          </div>

                          {/* Official list — filtered by availability AND scheduler type */}
                          {getRelevantOfficials()
                            .filter(official => {
                              const uid = official.uid ?? official.id
                              const gameDate = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
                              const gameTimeStr = format(gameDate, 'HH:mm')
                              const dayData = officialAvailability[uid]
                              const avail = dayData === undefined ? 'unknown'
                                : checkAvailability(dayData, gameTimeStr, selectedGame.duration ?? 1.5)
                              if (!showUnavailable && avail === 'unavailable') return false
                              return true
                            })
                            .map(official => {
                              const uid = official.uid ?? official.id
                              const assigned = (selectedGame.assignedOfficials ?? []).find(o => o.uid === uid && o.role === selectedRole)
                              const assignedAny = selectedGame.assignedUids?.includes(uid)
                              const gameDate = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
                              const gameTimeStr = format(gameDate, 'HH:mm')
                              const dayData = officialAvailability[uid]
                              const availStatus = dayData === undefined ? 'unknown'
                                : checkAvailability(dayData, gameTimeStr, selectedGame.duration ?? 1.5)
                              const availMeta = AVAIL_META[availStatus]

                              // Check if this role slot is already filled
                              const slotFull = isSlotFull(selectedGame, selectedRole)

                              return (
                                <div key={uid} className={[styles.officialRow, assigned ? styles.officialAssigned : ''].join(' ')}>
                                  <Avatar name={official.displayName} size="sm" />
                                  <div className={styles.officialInfo}>
                                    <div className={styles.officialName}>{official.displayName}</div>
                                    <div className={styles.officialMeta}>
                                      {(official.subRoles ?? []).filter(s => ['referee','scorekeeper'].includes(s)).join(', ') || 'Official'}
                                      <span style={{ marginLeft:8, fontWeight:600, color:availMeta.color }}>{availMeta.label}</span>
                                    </div>
                                  </div>
                                  {assigned ? (
                                    <Button size="sm" variant="ghost"
                                      style={{ color:'var(--orange)', borderColor:'var(--orange-light)' }}
                                      loading={assigning === uid}
                                      onClick={() => handleUnassign(uid, selectedRole)}>
                                      Unassign
                                    </Button>
                                  ) : slotFull ? (
                                    <Badge variant="gray">Slot filled</Badge>
                                  ) : (
                                    <Button size="sm" variant={availStatus === 'unavailable' ? 'ghost' : 'primary'}
                                      loading={assigning === uid}
                                      onClick={() => handleManualAssign(official)}
                                      disabled={availStatus === 'unavailable' && !showUnavailable}>
                                      Assign
                                    </Button>
                                  )}
                                </div>
                              )
                            })
                          }
                        </>
                      )}
                    </div>
                  )}
                </CardBody>
              </Card>
            ) : (
              <Card><CardBody><EmptyState icon="👈" title="Select a game to manage requests" /></CardBody></Card>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
