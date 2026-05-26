import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGameGroups } from '@/hooks/useGameGroups'
import { useGroupGames } from '@/hooks/useGames'
import { useRoster } from '@/hooks/useRoster'
import { db } from '@/lib/firebase'
import {
  collection, query, where, onSnapshot,
  doc, updateDoc, arrayUnion, serverTimestamp, writeBatch
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

export default function SchedAssign() {
  const { user, profile } = useAuth()
  const { groups } = useGameGroups()
  const { roster } = useRoster()
  const [selectedGroupId, setSelectedGroupId] = useState('')
  const { games, open, loading: gamesLoading } = useGroupGames(selectedGroupId)
  const [selectedGame, setSelectedGame] = useState(null)
  const [selectedRole, setSelectedRole] = useState('Scorekeeper')
  const [assigning, setAssigning] = useState(null)
  const [approving, setApproving] = useState(null)
  const [tab, setTab] = useState('requests') // 'requests' | 'manual'

  // Subscribe to game requests for selected game
  const [gameRequests, setGameRequests] = useState([])
  useEffect(() => {
    if (!selectedGame?.id) { setGameRequests([]); return }
    // Refresh selected game from live games list
    const live = games.find(g => g.id === selectedGame.id)
    if (live) { setSelectedGame(live); setGameRequests(live.requests ?? []) }
  }, [games, selectedGame?.id])

  useEffect(() => {
    if (groups.length && !selectedGroupId) setSelectedGroupId(groups[0].id)
  }, [groups])

  useEffect(() => {
    if (open.length && (!selectedGame || !games.find(g => g.id === selectedGame?.id))) {
      setSelectedGame(open[0])
    }
  }, [open])

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
    setAssigning(official.uid)
    try {
      await assignOfficial(selectedGame.id, {
        uid: official.uid, name: official.displayName,
        role: selectedRole, pay: selectedGame.payRate ?? 0,
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
                  <Badge variant="red">{open.length} open</Badge>
                  <Badge variant="green">{games.length - open.length} filled</Badge>
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
                            <Badge variant={statusBadge(game.status)}>{game.status}</Badge>
                            {pendingReqs > 0 && <span className={styles.requestsBadge}>⚡ {pendingReqs} request{pendingReqs > 1 ? 's' : ''}</span>}
                            {game.assignedOfficials?.length > 0 && (
                              <span className={styles.crewLine}>
                                {game.assignedOfficials.map(o => o.name?.split(' ')[0]).join(', ')}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className={styles.gamePay}>
                          {game.skPayRate ? `SK $${Number(game.skPayRate).toFixed(2)}` : game.refPayRate ? `Ref $${Number(game.refPayRate).toFixed(2)}` : game.payRate ? `$${Number(game.payRate).toFixed(2)}` : '—'}
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
                  <Badge variant={statusBadge(selectedGame.status)}>{selectedGame.status}</Badge>
                </CardHeader>

                {/* Game details */}
                <div className={styles.gameDetails}>
                  {(() => {
                    const gd = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
                    return <><span>📅 {format(gd, 'EEE, MMM d · h:mm a')}</span><span>📍 {selectedGame.venue}</span>{selectedGame.duration && <span>⏱ {selectedGame.duration}hr slot</span>}<span>💰 SK Pay: ${(selectedGame.payRate ?? 0).toFixed(2)}</span></>
                  })()}
                </div>

                {/* Role selector */}
                <div className={styles.roleConfig}>
                  <label className={styles.configLabel}>Role</label>
                  <select className={styles.select} value={selectedRole} onChange={e => setSelectedRole(e.target.value)}>
                    {HOCKEY_ROLES.map(r => <option key={r}>{r}</option>)}
                  </select>
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
                        <EmptyState icon="📥" title="No requests yet" message="Scorekeepers will appear here when they request this game." />
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
                      {roster.length === 0 ? (
                        <EmptyState icon="👥" title="No officials on your roster" message="Invite officials to your roster first." />
                      ) : (
                        roster.map(official => {
                          const uid = official.uid ?? official.id
                          const assigned = selectedGame.assignedUids?.includes(uid)
                          const gameDate = selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate)
                          const gameDateStr = gameDate.toISOString().slice(0, 10)
                          const avail = official.availability ?? {}
                          const isAvailable   = avail[gameDateStr] === true || avail[gameDateStr] === 'available'
                          const isUnavailable = avail[gameDateStr] === false || avail[gameDateStr] === 'unavailable'
                          return (
                            <div key={uid} className={[styles.officialRow, assigned ? styles.officialAssigned : ''].join(' ')}>
                              <Avatar name={official.displayName} size="sm" />
                              <div className={styles.officialInfo}>
                                <div className={styles.officialName}>{official.displayName}</div>
                                <div className={styles.officialMeta}>
                                  {(official.subRoles ?? []).filter(s => ['referee','scorekeeper'].includes(s)).join(', ') || 'Official'}
                                  {isAvailable   && <span style={{ color:'var(--teal)', marginLeft:8, fontWeight:700 }}>✓ Available</span>}
                                  {isUnavailable && <span style={{ color:'var(--red)',  marginLeft:8, fontWeight:700 }}>✗ Unavailable</span>}
                                  {!isAvailable && !isUnavailable && <span style={{ color:'var(--color-muted)', marginLeft:8 }}>No availability set</span>}
                                </div>
                              </div>
                              {assigned ? <Badge variant="green">Assigned</Badge> : (
                                <Button size="sm" variant={isUnavailable ? 'ghost' : 'primary'}
                                  loading={assigning === uid}
                                  onClick={() => handleManualAssign(official)}
                                  title={isUnavailable ? 'Official marked themselves unavailable' : ''}>
                                  {isUnavailable ? 'Assign Anyway' : 'Assign'}
                                </Button>
                              )}
                            </div>
                          )
                        })
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
