import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useOfficialGames } from '@/hooks/useGames'
import { useOpenGames } from '@/hooks/useOpenGames'
import { respondToAssignment, generateCalendarToken } from '@/services/firestore'
import { db } from '@/lib/firebase'
import { doc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore'
import { Card, CardBody, Badge, statusBadge, EmptyState } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { Input } from '@/components/ui/Input'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import styles from './OfficialSchedule.module.css'

const TABS = ['My Schedule', 'Request Games', 'My Requests']
const CALENDAR_FUNC_URL = 'https://officialcalendarfeed-hmh3r2a4ra-uc.a.run.app'

export default function OfficialSchedule() {
  const { user, profile } = useAuth()
  const { isReferee, isScorekeeper, isBothOfficial } = useSubRoles()
  const { games, loading }                           = useOfficialGames()
  const { available, myRequests, loading: openLoading } = useOpenGames()
  const [activeTab, setActiveTab]   = useState('My Schedule')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('All')
  const [responding, setResponding] = useState(null)
  const [requestNote, setRequestNote] = useState({})
  const [requesting, setRequesting] = useState(null)
  const [editingRequestId, setEditingRequestId] = useState(null)
  const [editNoteText, setEditNoteText] = useState('')
  const [generatingToken, setGeneratingToken] = useState(false)

  const calendarToken = profile?.calendarToken
  const calendarUrl   = calendarToken
    ? `${CALENDAR_FUNC_URL}?uid=${user?.uid}&token=${calendarToken}`
    : null

  const handleGenerateCalendarLink = async () => {
    setGeneratingToken(true)
    try {
      await generateCalendarToken(user.uid)
      toast.success('Calendar link generated!')
    } catch { toast.error('Failed to generate link') }
    finally { setGeneratingToken(false) }
  }

  const copyCalendarUrl = () => {
    if (!calendarUrl) return
    navigator.clipboard.writeText(calendarUrl)
    toast.success('Calendar URL copied!')
  }

  // ── Request a game ──────────────────────────────────────────────────────────
  const handleRequest = async (game) => {
    if (!user || !profile) return
    setRequesting(game.id)
    try {
      await updateDoc(doc(db, 'games', game.id), {
        requests: arrayUnion({
          uid:         user.uid,
          name:        profile.displayName,
          note:        requestNote[game.id] ?? '',
          status:      'pending',
          requestedAt: new Date().toISOString(),
        }),
        updatedAt: serverTimestamp(),
      })
      toast.success('Game requested! The scheduler will review and approve.')
      setRequestNote(n => ({ ...n, [game.id]: '' }))
    } catch { toast.error('Failed to request game') }
    finally { setRequesting(null) }
  }

  // ── Edit a pending request note ─────────────────────────────────────────────
  const handleEditRequest = async (game, myReq, newNote) => {
    setResponding(game.id + 'edit')
    try {
      const updatedRequests = (game.requests ?? []).map(r =>
        r.uid === user?.uid ? { ...r, note: newNote } : r
      )
      await updateDoc(doc(db, 'games', game.id), { requests: updatedRequests })
      toast.success('Note updated')
      setEditingRequestId(null)
    } catch { toast.error('Failed to update note') }
    finally { setResponding(null) }
  }

  // ── Withdraw a pending request ───────────────────────────────────────────────
  const handleWithdrawRequest = async (game) => {
    if (!window.confirm('Withdraw your request for this game?')) return
    setResponding(game.id + 'withdraw')
    try {
      const updatedRequests = (game.requests ?? []).filter(r => r.uid !== user?.uid)
      await updateDoc(doc(db, 'games', game.id), { requests: updatedRequests })
      toast.success('Request withdrawn')
    } catch { toast.error('Failed to withdraw request') }
    finally { setResponding(null) }
  }

  // ── Accept / Decline assignment ─────────────────────────────────────────────
  const handleRespond = async (gameId, response) => {
    setResponding(gameId + response)
    try {
      await respondToAssignment(gameId, user.uid, response)
      toast.success(response === 'accepted' ? 'Game accepted!' : 'Game declined')
    } catch { toast.error('Failed to respond') }
    finally { setResponding(null) }
  }

  const filteredMyGames = games.filter(game => {
    const my = game.assignedOfficials?.find(o => o.uid === user?.uid)
    if (roleFilter === 'referee'     && my?.role === 'Scorekeeper') return false
    if (roleFilter === 'scorekeeper' && my?.role !== 'Scorekeeper') return false
    if (statusFilter === 'Requests')  return my?.status === 'pending'
    if (statusFilter === 'Confirmed') return my?.status === 'accepted'
    if (statusFilter === 'Completed') return game.status === 'completed'
    return true
  })

  const pendingCount = games.filter(g =>
    g.assignedOfficials?.find(o => o.uid === user?.uid && o.status === 'pending')
  ).length

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Schedule</h1>
      </div>

      {/* Main tabs */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button key={tab} className={[styles.tab, activeTab === tab ? styles.tabActive : ''].join(' ')} onClick={() => setActiveTab(tab)}>
            {tab}
            {tab === 'My Schedule' && pendingCount > 0 && <span className={styles.tabBadge}>{pendingCount}</span>}
            {tab === 'Request Games' && available.length > 0 && <span className={styles.tabBadge}>{available.length}</span>}
            {tab === 'My Requests' && myRequests.length > 0 && <span className={styles.tabBadge}>{myRequests.length}</span>}
          </button>
        ))}
      </div>

      {/* Calendar sync */}
      {activeTab === 'My Schedule' && (
        <Card>
          <CardBody>
            <div style={{ display:'flex', alignItems:'flex-start', gap:14, flexWrap:'wrap' }}>
              <div style={{ fontSize:26 }}>📅</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:3 }}>Sync to Your Phone Calendar</div>
                <div style={{ fontSize:12.5, color:'var(--color-muted)', lineHeight:1.5, marginBottom:10 }}>
                  Subscribe once and your games automatically appear in Apple Calendar, Google Calendar, or Outlook.
                </div>
                {calendarUrl ? (
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <Button variant="teal" size="sm" onClick={copyCalendarUrl}>📋 Copy URL</Button>
                    <a href={`webcal://${calendarUrl.replace('https://','')}`} style={{ textDecoration:'none' }}>
                      <Button variant="secondary" size="sm" onClick={() => {}}>🍎 Apple Calendar</Button>
                    </a>
                    <a href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendarUrl)}`} target="_blank" rel="noreferrer" style={{ textDecoration:'none' }}>
                      <Button variant="secondary" size="sm" onClick={() => {}}>📆 Google Calendar</Button>
                    </a>
                    <Button variant="ghost" size="sm" loading={generatingToken} onClick={handleGenerateCalendarLink}>Regenerate</Button>
                  </div>
                ) : (
                  <Button variant="primary" size="sm" loading={generatingToken} onClick={handleGenerateCalendarLink}>
                    Generate Calendar Link
                  </Button>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* ── My Schedule tab ── */}
      {activeTab === 'My Schedule' && (
        <>
          {isBothOfficial && (
            <div className={styles.roleFilter}>
              {[{ id:'all', label:'All' }, { id:'referee', label:'🏒 Referee' }, { id:'scorekeeper', label:'📋 Scorekeeper' }].map(f => (
                <button key={f.id} className={[styles.roleFilterBtn, roleFilter === f.id ? styles.roleFilterActive : ''].join(' ')} onClick={() => setRoleFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          )}
          <div className={styles.statusFilter}>
            {['All','Requests','Confirmed','Completed'].map(s => (
              <button key={s} className={[styles.statusBtn, statusFilter === s ? styles.statusActive : ''].join(' ')} onClick={() => setStatusFilter(s)}>
                {s}
              </button>
            ))}
          </div>
          {filteredMyGames.length === 0 ? (
            <Card><CardBody><EmptyState icon="📅" title="No games here yet" /></CardBody></Card>
          ) : (
            <div className={styles.gameList}>
              {filteredMyGames.map(game => {
                const my = game.assignedOfficials?.find(o => o.uid === user?.uid)
                const gameDate = game.gameDate?.toDate?.() ?? new Date(game.gameDate)
                const isPending = my?.status === 'pending'
                const isSK = my?.role === 'Scorekeeper'
                return (
                  <div key={game.id} className={[styles.gameCard, isPending ? styles.pending : ''].join(' ')}>
                    {isPending && <div className={styles.pendingStripe} />}
                    <div className={styles.gameTop}>
                      <div className={styles.gameSport}>{isSK ? '📋' : '🏒'}</div>
                      <div className={styles.gameInfo}>
                        <div className={styles.gameTitle}>{game.homeTeam} vs {game.awayTeam}</div>
                        <div className={styles.gameMeta}>
                          <span>📅 {format(gameDate, 'EEE, MMM d')} · {format(gameDate, 'h:mm a')}</span>
                          <span>📍 {game.venue}</span>
                          {game.duration && <span>⏱ {game.duration}hr</span>}
                          {game.division && <span>🎯 {game.division}</span>}
                        </div>
                      </div>
                      <div className={styles.gameRight}>
                        <Badge variant={statusBadge(my?.status ?? game.status)}>{my?.status ?? game.status}</Badge>
                        <div className={styles.gamePay}>${my?.pay ?? game.payRate ?? '—'}</div>
                      </div>
                    </div>
                    {my?.role && <div style={{ padding: '0 0 8px' }}><Badge variant={isSK ? 'blue' : 'ice'}>{my.role}</Badge></div>}
                    {game.assignedOfficials?.length > 1 && (
                      <div className={styles.crew}>
                        <span className={styles.crewLabel}>Crew:</span>
                        {game.assignedOfficials.filter(o => o.uid !== user?.uid).map((o, i) => (
                          <span key={i} className={styles.crewMember}>{o.name?.split(' ')[0]} · {o.role}</span>
                        ))}
                      </div>
                    )}
                    {isPending && (
                      <div className={styles.actions}>
                        <Button variant="primary" size="sm" loading={responding === game.id + 'accepted'} onClick={() => handleRespond(game.id, 'accepted')}>✓ Accept</Button>
                        <Button variant="ghost"   size="sm" loading={responding === game.id + 'declined'} onClick={() => handleRespond(game.id, 'declined')}>✗ Decline</Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── Request Games tab ── */}
      {activeTab === 'Request Games' && (
        <div>
          {openLoading ? <div className={styles.center}><Spinner /></div>
            : available.length === 0 ? (
              <Card><CardBody><EmptyState icon="🔍" title="No open games right now" message="When a scheduler posts open games, they'll appear here for you to request." /></CardBody></Card>
            ) : (
              <div className={styles.gameList}>
                {available.map(game => {
                  const gameDate = game.gameDate?.toDate?.() ?? new Date(game.gameDate)
                  return (
                    <div key={game.id} className={styles.gameCard}>
                      <div className={styles.gameTop}>
                        <div className={styles.gameSport}>🏒</div>
                        <div className={styles.gameInfo}>
                          <div className={styles.gameTitle}>{game.homeTeam} vs {game.awayTeam}</div>
                          <div className={styles.gameMeta}>
                            <span>📅 {format(gameDate, 'EEE, MMM d')} · {format(gameDate, 'h:mm a')}</span>
                            <span>📍 {game.venue}</span>
                            {game.duration && <span>⏱ {game.duration}hr</span>}
                            {game.division && <span>🎯 {game.division}</span>}
                          </div>
                          {game.groupName && <div className={styles.groupTag}>🏆 {game.groupName}</div>}
                        </div>
                        <div className={styles.gameRight}>
                          <div className={styles.gamePay}>
                            {game.skPayRate ? `$${Number(game.skPayRate).toFixed(2)}` : game.refPayRate ? `$${Number(game.refPayRate).toFixed(2)}` : game.payRate ? `$${Number(game.payRate).toFixed(2)}` : 'Pay TBD'}
                          </div>
                          <Badge variant="blue">Open</Badge>
                        </div>
                      </div>
                      <div className={styles.requestRow}>
                        <input
                          className={styles.noteInput}
                          placeholder="Optional note to scheduler (e.g. 'I know this venue well')"
                          value={requestNote[game.id] ?? ''}
                          onChange={e => setRequestNote(n => ({ ...n, [game.id]: e.target.value }))}
                        />
                        <Button variant="primary" size="sm" loading={requesting === game.id} onClick={() => handleRequest(game)}>
                          Request Game
                        </Button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          }
        </div>
      )}

      {/* ── My Requests tab ── */}
      {activeTab === 'My Requests' && (
        <div>
          {myRequests.length === 0 ? (
            <Card><CardBody><EmptyState icon="📬" title="No pending requests" message="Games you've requested will appear here while awaiting scheduler approval." /></CardBody></Card>
          ) : (
            <div className={styles.gameList}>
              {myRequests.map(game => {
                const gameDate = game.gameDate?.toDate?.() ?? new Date(game.gameDate)
                const myReq = (game.requests ?? []).find(r => r.uid === user?.uid)
                const isEditing = editingRequestId === game.id
                return (
                  <div key={game.id} className={[styles.gameCard, styles.requestPending].join(' ')}>
                    <div className={styles.gameTop}>
                      <div className={styles.gameSport}>📬</div>
                      <div className={styles.gameInfo}>
                        <div className={styles.gameTitle}>{game.homeTeam} vs {game.awayTeam}</div>
                        <div className={styles.gameMeta}>
                          <span>📅 {format(gameDate, 'EEE, MMM d')} · {format(gameDate, 'h:mm a')}</span>
                          <span>📍 {game.venue}</span>
                          {game.duration && <span>⏱ {game.duration}hr</span>}
                        </div>
                      </div>
                      <div className={styles.gameRight}>
                        <Badge variant="amber">Awaiting Approval</Badge>
                        <div className={styles.gamePay}>
                          {game.skPayRate ? `$${Number(game.skPayRate).toFixed(2)}` : game.refPayRate ? `$${Number(game.refPayRate).toFixed(2)}` : game.payRate ? `$${Number(game.payRate).toFixed(2)}` : 'Pay TBD'}
                        </div>
                      </div>
                    </div>

                    {/* Note — editable */}
                    {isEditing ? (
                      <div className={styles.editNoteRow}>
                        <input
                          className={styles.noteInput}
                          value={editNoteText}
                          onChange={e => setEditNoteText(e.target.value)}
                          placeholder="Update your note to the scheduler…"
                          autoFocus
                        />
                        <Button size="sm" variant="primary" loading={responding === game.id + 'edit'} onClick={() => handleEditRequest(game, myReq, editNoteText)}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingRequestId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <div className={styles.reqNoteRow}>
                        <span className={styles.reqNote}>{myReq?.note ? `"${myReq.note}"` : 'No note added'}</span>
                        <button className={styles.editNoteBtn} onClick={() => { setEditingRequestId(game.id); setEditNoteText(myReq?.note ?? '') }}>✏️ Edit note</button>
                      </div>
                    )}

                    {myReq?.requestedAt && <div className={styles.reqTime}>Requested {format(new Date(myReq.requestedAt), 'MMM d, h:mm a')}</div>}

                    {/* Withdraw button */}
                    <div className={styles.withdrawRow}>
                      <Button size="sm" variant="danger" loading={responding === game.id + 'withdraw'} onClick={() => handleWithdrawRequest(game)}>
                        Withdraw Request
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
