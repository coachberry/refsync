import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { subscribeRFQsForScheduler, updateRFQ } from '@/services/firestore'
import { db } from '@/lib/firebase'
import { addDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Textarea } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './SchedQuotes.module.css'

const STATUS_META = {
  open:         { label: 'Quote Requested', variant: 'blue',  icon: '📬' },
  quoted:       { label: 'Quote Sent',      variant: 'amber', icon: '📤' },
  accepted:     { label: 'Accepted',        variant: 'green', icon: '✅' },
  declined:     { label: 'Declined',        variant: 'red',   icon: '✗'  },
  not_selected: { label: 'Not Selected',    variant: 'gray',  icon: '—'  },
}

export default function SchedQuotes() {
  const { user, profile } = useAuth()
  const [rfqs, setRfqs]         = useState([])
  const [loading, setLoading]   = useState(true)
  const [quoteTarget, setQuoteTarget] = useState(null)
  const [rejectingId, setRejectingId] = useState(null)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeRFQsForScheduler(user.uid, (data) => {
      data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setRfqs(data)
      setLoading(false)
    })
    return unsub
  }, [user])

  const handleReject = async (rfq) => {
    if (!window.confirm(`Reject this quote request from "${rfq.groupName}"?\n\nThe game director will be notified that you're unable to fill this request.`)) return
    setRejectingId(rfq.id)
    try {
      await updateRFQ(rfq.id, {
        status:     'declined',
        declinedAt: new Date().toISOString(),
        schedulerName: profile?.displayName,
      })
      // Notify the director
      await addDoc(collection(db, 'notifications'), {
        uid:       rfq.directorUid,
        type:      'rfq',
        title:     '❌ Scheduler Unable to Fill Request',
        message:   `${profile?.displayName ?? 'A scheduler'} is unable to fill the quote request for "${rfq.groupName}". You may want to find another scheduler.`,
        read:      false,
        link:      '/director/events',
        groupId:   rfq.groupId,
        createdAt: serverTimestamp(),
      })
      toast.success('Request rejected — the director has been notified')
    } catch (err) {
      console.error(err)
      toast.error('Failed to reject request')
    } finally { setRejectingId(null) }
  }

  const openRfqs   = rfqs.filter(r => r.status === 'open')
  const activeRfqs = rfqs.filter(r => ['quoted','accepted','not_selected','declined'].includes(r.status))

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Quote Requests</h1>
        <p className={styles.sub}>Game directors who want you to schedule their games</p>
      </div>

      {rfqs.length === 0 ? (
        <Card><CardBody>
          <EmptyState icon="📬" title="No quote requests yet"
            message="When a game director selects you to quote for their event, it will appear here." />
        </CardBody></Card>
      ) : (
        <>
          {openRfqs.length > 0 && (
            <>
              <div className={styles.sectionLabel}>📬 Awaiting Your Quote ({openRfqs.length})</div>
              <div className={styles.rfqList}>
                {openRfqs.map(rfq => (
                  <RFQCard key={rfq.id} rfq={rfq}
                    onQuote={() => setQuoteTarget(rfq)}
                    onReject={() => handleReject(rfq)}
                    rejecting={rejectingId === rfq.id}
                  />
                ))}
              </div>
            </>
          )}
          {activeRfqs.length > 0 && (
            <>
              <div className={styles.sectionLabel}>History</div>
              <div className={styles.rfqList}>
                {activeRfqs.map(rfq => (
                  <RFQCard key={rfq.id} rfq={rfq} onQuote={rfq.status === 'open' ? () => setQuoteTarget(rfq) : null} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {quoteTarget && (
        <SubmitQuoteModal
          open={!!quoteTarget}
          onClose={() => setQuoteTarget(null)}
          rfq={quoteTarget}
          schedulerUid={user?.uid}
          schedulerName={profile?.displayName}
        />
      )}
    </div>
  )
}

// ── RFQ Card ──────────────────────────────────────────────────────────────────
function RFQCard({ rfq, onQuote, onReject, rejecting }) {
  const meta = STATUS_META[rfq.status] ?? STATUS_META.open
  const receivedAt = rfq.createdAt?.toDate?.() ?? (rfq.createdAt ? new Date(rfq.createdAt) : null)
  const totalHours = rfq.totalHours ?? 0
  const totalGames = rfq.gameCount  ?? 0
  const [games, setGames]               = useState([])
  const [gamesLoading, setGamesLoading] = useState(false)
  const [gamesLoaded, setGamesLoaded]   = useState(false)
  const [expanded, setExpanded]         = useState(false)

  // Load games only once when first expanded
  useEffect(() => {
    if (!expanded || gamesLoaded || !rfq.groupId) return
    setGamesLoading(true)
    getDocs(query(collection(db, 'games'), where('groupId', '==', rfq.groupId)))
      .then(snap => {
        const g = snap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const da = a.gameDate?.toDate?.() ?? new Date(a.gameDate)
            const db_ = b.gameDate?.toDate?.() ?? new Date(b.gameDate)
            return da - db_
          })
        setGames(g)
        setGamesLoaded(true)
      })
      .finally(() => setGamesLoading(false))
  }, [expanded]) // only re-run when expanded changes, gamesLoaded guards duplicate fetches

  const officialsLabel = {
    both:         '🏒📋 Referees & Scorekeepers',
    referees:     '🏒 Referees Only',
    scorekeepers: '📋 Scorekeepers Only',
  }[rfq.officialsNeeded] ?? '—'

  // Average game duration across games (or use totalHours / totalGames as estimate)
  const avgDuration = totalGames > 0 && totalHours > 0
    ? (totalHours / totalGames).toFixed(2).replace(/\.?0+$/, '')
    : '—'

  return (
    <div className={[styles.rfqCard, rfq.status === 'accepted' ? styles.rfqAccepted : ''].join(' ')}>
      {/* Header */}
      <div className={styles.rfqTop}>
        <div className={styles.rfqLeft}>
          <div className={styles.rfqName}>{rfq.groupName}</div>
          <div className={styles.rfqDirector}>From: <strong>{rfq.directorName}</strong></div>
          {receivedAt && <div className={styles.rfqDate}>Received {format(receivedAt, 'MMM d, yyyy')}</div>}
        </div>
        <Badge variant={meta.variant}>{meta.icon} {meta.label}</Badge>
      </div>

      {/* Summary stats — Games · Game Duration · Total Hours · Officials */}
      <div className={styles.rfqDetails}>
        <div className={styles.rfqDetail}><span>Games</span><strong>{totalGames}</strong></div>
        <div className={styles.rfqDetail}><span>Game Duration</span><strong>{avgDuration}hr</strong></div>
        <div className={styles.rfqDetail}><span>Total Hours</span><strong>{totalHours.toFixed(1)}hrs</strong></div>
        <div className={styles.rfqDetail}><span>Officials</span><strong>{officialsLabel}</strong></div>
      </div>

      {/* Dates, Venues, Divisions, Notes */}
      <div className={styles.rfqMeta}>
        {rfq.startDate && (
          <div className={styles.rfqMetaRow}>
            <span className={styles.rfqMetaLabel}>📅 Dates</span>
            <span>
              {format(new Date(rfq.startDate), 'MMM d, yyyy')}
              {rfq.endDate && rfq.endDate !== rfq.startDate
                ? ` – ${format(new Date(rfq.endDate), 'MMM d, yyyy')}` : ''}
            </span>
          </div>
        )}
        {rfq.venues?.length > 0 && (
          <div className={styles.rfqMetaRow}>
            <span className={styles.rfqMetaLabel}>📍 Venues</span>
            <span>{rfq.venues.join(', ')}</span>
          </div>
        )}
        {rfq.divisions?.length > 0 && (
          <div className={styles.rfqMetaRow}>
            <span className={styles.rfqMetaLabel}>🎯 Divisions</span>
            <span>{rfq.divisions.map(d => d.label ?? d).join(', ')}</span>
          </div>
        )}
        {rfq.notes && (
          <div className={styles.rfqMetaRow}>
            <span className={styles.rfqMetaLabel}>📝 Notes</span>
            <span className={styles.rfqNote}>{rfq.notes}</span>
          </div>
        )}
      </div>

      {/* Expand / collapse game list */}
      <button className={styles.expandBtn} onClick={() => setExpanded(e => !e)}>
        {expanded ? '▲ Hide game list' : `▼ View all ${totalGames} games`}
      </button>

      {/* Game list table */}
      {expanded && (
        <div className={styles.gameTable}>
          {gamesLoading ? (
            <div className={styles.gameTableLoading}><Spinner size="sm" /></div>
          ) : games.length === 0 ? (
            <div className={styles.gameTableEmpty}>No games added yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Venue</th>
                    <th>Duration</th>
                    <th>Division</th>
                    <th>Home Team</th>
                    <th>Away Team</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map(g => {
                    const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
                    return (
                      <tr key={g.id}>
                        <td className={styles.tdDate}>{format(gd, 'MMM d, yyyy')}</td>
                        <td className={styles.tdTime}>{format(gd, 'h:mm a')}</td>
                        <td>{g.venue || '—'}</td>
                        <td className={styles.tdDur}>{g.duration ? `${g.duration}hr` : '—'}</td>
                        <td>{g.division || '—'}</td>
                        <td className={styles.tdTeam}>{g.homeTeam}</td>
                        <td className={styles.tdTeam}>{g.awayTeam}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Quote sent */}
      {rfq.quoteAmount && (
        <div className={styles.rfqQuoteSent}>
          Your quote: <strong>${rfq.quoteAmount.toFixed(2)}</strong>
          {rfq.quotePriceMode && <span className={styles.rfqQuoteMode}> · {
            rfq.quotePriceMode === 'flat'          ? 'Flat rate' :
            rfq.quotePriceMode === 'per_game'      ? 'Per game'  :
            rfq.quotePriceMode === 'per_game_list' ? 'Per game (individual)' : ''
          }</span>}
          {rfq.quoteNote && <span> · "{rfq.quoteNote}"</span>}
        </div>
      )}

      {onQuote && (
        <div className={styles.rfqActions}>
          <Button variant="primary" onClick={onQuote}>Submit Quote</Button>
          <Button variant="ghost" loading={rejecting} onClick={onReject}
            style={{ color: 'var(--red)', borderColor: 'var(--red-light)' }}>
            ✕ Reject Request
          </Button>
        </div>
      )}

      {rfq.status === 'accepted' && (
        <div className={styles.rfqAcceptedNotice}>✅ Your quote was accepted! Invoice created for the director.</div>
      )}
      {rfq.status === 'not_selected' && (
        <div className={styles.rfqNotSelected}>Another scheduler was selected for this event.</div>
      )}
      {rfq.status === 'declined' && (
        <div className={styles.rfqNotSelected}>❌ You rejected this request — the director was notified.</div>
      )}
    </div>
  )
}
const PRICE_MODES = [
  { id: 'flat',       label: '💰 Flat Rate',       desc: 'One total price for the entire event' },
  { id: 'per_game',   label: '🏒 Price Per Game',   desc: 'Set one price × number of games' },
  { id: 'per_game_list', label: '📋 Price Per Game (Individual)', desc: 'Set a different price for each game' },
]

function SubmitQuoteModal({ open, onClose, rfq, schedulerUid, schedulerName }) {
  const [saving, setSaving]       = useState(false)
  const [priceMode, setPriceMode] = useState('flat')
  const [flatAmount, setFlatAmount] = useState('')
  const [perGamePrice, setPerGamePrice] = useState('')
  const [gameList, setGameList]   = useState([])
  const [loadingGames, setLoadingGames] = useState(false)
  const [note, setNote]           = useState('')

  const totalGames = rfq?.gameCount ?? 0

  // Load individual games when per_game_list mode selected
  useEffect(() => {
    if (priceMode !== 'per_game_list' || !rfq?.groupId) return
    if (gameList.length > 0) return // already loaded
    setLoadingGames(true)
    getDocs(query(collection(db, 'games'), where('groupId', '==', rfq.groupId)))
      .then(snap => {
        const games = snap.docs
          .map(d => ({ id: d.id, ...d.data(), quotePrice: '' }))
          .sort((a, b) => {
            const da = a.gameDate?.toDate?.() ?? new Date(a.gameDate)
            const db_ = b.gameDate?.toDate?.() ?? new Date(b.gameDate)
            return da - db_
          })
        setGameList(games)
      })
      .finally(() => setLoadingGames(false))
  }, [priceMode, rfq?.groupId])

  const updateGamePrice = (id, price) =>
    setGameList(gl => gl.map(g => g.id === id ? { ...g, quotePrice: price } : g))

  // Calculate totals
  const flatTotal    = Number(flatAmount) || 0
  const perGameTotal = (Number(perGamePrice) || 0) * totalGames
  const perListTotal = gameList.reduce((s, g) => s + (Number(g.quotePrice) || 0), 0)

  const quoteTotal = priceMode === 'flat'          ? flatTotal
                   : priceMode === 'per_game'      ? perGameTotal
                   : perListTotal

  // Build breakdown string
  const buildBreakdown = () => {
    if (priceMode === 'flat')     return `Flat rate for ${totalGames} games`
    if (priceMode === 'per_game') return `$${perGamePrice}/game × ${totalGames} games = $${perGameTotal.toFixed(2)}`
    return gameList.map(g => {
      const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
      return `${g.homeTeam} vs ${g.awayTeam} (${format(gd, 'MMM d')}) — $${Number(g.quotePrice || 0).toFixed(2)}`
    }).join('\n')
  }

  const handleSubmit = async () => {
    if (!quoteTotal || quoteTotal <= 0) { toast.error('Enter a price'); return }
    setSaving(true)
    try {
      await updateRFQ(rfq.id, {
        status:         'quoted',
        schedulerName,
        quoteAmount:    quoteTotal,
        quotePriceMode: priceMode,
        quoteBreakdown: buildBreakdown(),
        quoteNote:      note,
        quoteGamePrices: priceMode === 'per_game_list'
          ? gameList.map(g => ({ gameId: g.id, homeTeam: g.homeTeam, awayTeam: g.awayTeam, price: Number(g.quotePrice) || 0 }))
          : null,
        quotedAt: new Date().toISOString(),
      })
      // Mark the group as having quotes received
      const { updateDoc: ud, doc: fd } = await import('firebase/firestore').then(m => m)
      if (rfq.groupId) {
        await ud(fd(db, 'gameGroups', rfq.groupId), { hasQuotes: true })
      }
      await addDoc(collection(db, 'notifications'), {
        uid:       rfq.directorUid,
        type:      'rfq',
        title:     '💬 Quote Received',
        message:   `${schedulerName} submitted a quote of $${quoteTotal.toFixed(2)} for "${rfq.groupName}"`,
        read:      false,
        link:      '/director/events',
        createdAt: serverTimestamp(),
      })
      toast.success('Quote submitted! The director will be notified.')
      onClose()
    } catch (err) {
      toast.error('Failed to submit quote')
      console.error(err)
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Submit Quote — ${rfq?.groupName ?? ''}`} size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSubmit}
            disabled={!quoteTotal || quoteTotal <= 0}>
            Submit Quote {quoteTotal > 0 ? `— $${quoteTotal.toFixed(2)}` : ''}
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        Choose how you want to price this event. The director will see your full breakdown.
      </p>

      {/* Price mode selector */}
      <div style={{ marginBottom: 18 }}>
        <label style={labelSt}>Pricing Method</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PRICE_MODES.map(m => (
            <div key={m.id}
              onClick={() => setPriceMode(m.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 'var(--radius)',
                border: `2px solid ${priceMode === m.id ? 'var(--blue)' : 'var(--color-border)'}`,
                background: priceMode === m.id ? 'rgba(37,99,235,.05)' : 'var(--color-surface)',
                cursor: 'pointer', transition: 'all .13s',
              }}
            >
              <div style={{
                width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${priceMode === m.id ? 'var(--blue)' : 'var(--color-border)'}`,
                background: priceMode === m.id ? 'var(--blue)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {priceMode === m.id && <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff' }} />}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{m.label}</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 1 }}>{m.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Flat rate ── */}
      {priceMode === 'flat' && (
        <Input
          label="Total Price ($) *"
          type="number" step="0.01" placeholder="0.00"
          value={flatAmount}
          onChange={e => setFlatAmount(e.target.value)}
          hint={`${totalGames} games total`}
        />
      )}

      {/* ── Per game rate ── */}
      {priceMode === 'per_game' && (
        <div>
          <Input
            label="Price Per Game ($) *"
            type="number" step="0.01" placeholder="0.00"
            value={perGamePrice}
            onChange={e => setPerGamePrice(e.target.value)}
            hint={`× ${totalGames} games`}
          />
          {perGamePrice && (
            <div className={styles.calcPreview}>
              ${perGamePrice} × {totalGames} games = <strong>${perGameTotal.toFixed(2)}</strong>
            </div>
          )}
        </div>
      )}

      {/* ── Per game list ── */}
      {priceMode === 'per_game_list' && (
        <div>
          {loadingGames ? (
            <div style={{ textAlign: 'center', padding: 20 }}><Spinner /></div>
          ) : gameList.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--color-muted)', padding: '10px 0' }}>
              No games found for this event yet.
            </div>
          ) : (
            <div className={styles.gameListPricing}>
              <div className={styles.gameListHeader}>
                <span>Game</span><span>Date</span><span>Price</span>
              </div>
              {gameList.map(g => {
                const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
                return (
                  <div key={g.id} className={styles.gameListRow}>
                    <div className={styles.gameListTitle}>
                      <span>{g.homeTeam} vs {g.awayTeam}</span>
                      <span className={styles.gameListVenue}>{g.venue} · {g.duration}hr</span>
                    </div>
                    <div className={styles.gameListDate}>{format(gd, 'MMM d')}</div>
                    <div className={styles.gameListPrice}>
                      <input
                        type="number" step="0.01" placeholder="0.00"
                        value={g.quotePrice}
                        onChange={e => updateGamePrice(g.id, e.target.value)}
                        style={priceInputSt}
                      />
                    </div>
                  </div>
                )
              })}
              <div className={styles.gameListTotal}>
                <span>Total</span>
                <strong>${perListTotal.toFixed(2)}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Note */}
      <div style={{ marginTop: 14 }}>
        <Textarea
          label="Note to Director (optional)"
          rows={2}
          placeholder="Any additional info, availability, or conditions…"
          value={note}
          onChange={e => setNote(e.target.value)}
        />
      </div>

      {/* Total preview */}
      {quoteTotal > 0 && (
        <div className={styles.totalPreview}>
          <span>Your quote total</span>
          <strong>${quoteTotal.toFixed(2)}</strong>
        </div>
      )}
    </Modal>
  )
}

const labelSt     = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8 }
const priceInputSt = {
  width: '90px', padding: '6px 8px', borderRadius: 6,
  border: '1.5px solid var(--color-border)', background: 'var(--color-surface)',
  fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', textAlign: 'right',
}
