import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { subscribeRFQsForScheduler, updateRFQ } from '@/services/firestore'
import { db } from '@/lib/firebase'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Textarea, FormRow } from '@/components/ui/Input'
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

  useEffect(() => {
    if (!user) return
    const unsub = subscribeRFQsForScheduler(user.uid, (data) => {
      data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setRfqs(data)
      setLoading(false)
    })
    return unsub
  }, [user])

  const openRfqs    = rfqs.filter(r => r.status === 'open')
  const activeRfqs  = rfqs.filter(r => ['quoted','accepted','not_selected','declined'].includes(r.status))

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Quote Requests</h1>
        <p className={styles.sub}>Game directors who want you to schedule their games</p>
      </div>

      {rfqs.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon="📬" title="No quote requests yet" message="When a game director selects you to quote for their event, it will appear here." />
          </CardBody>
        </Card>
      ) : (
        <>
          {/* Open requests — need a quote */}
          {openRfqs.length > 0 && (
            <>
              <div className={styles.sectionLabel}>📬 Awaiting Your Quote ({openRfqs.length})</div>
              <div className={styles.rfqList}>
                {openRfqs.map(rfq => (
                  <RFQCard key={rfq.id} rfq={rfq} onQuote={() => setQuoteTarget(rfq)} />
                ))}
              </div>
            </>
          )}

          {/* Active/historical */}
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
function RFQCard({ rfq, onQuote }) {
  const meta = STATUS_META[rfq.status] ?? STATUS_META.open
  const receivedAt = rfq.createdAt?.toDate?.() ?? (rfq.createdAt ? new Date(rfq.createdAt) : null)

  const refRate = rfq.refInvoiceRate
  const skRate  = rfq.skInvoiceRate
  const totalHours = rfq.totalHours ?? 0
  const totalGames = rfq.gameCount  ?? 0

  return (
    <div className={[styles.rfqCard, rfq.status === 'accepted' ? styles.rfqAccepted : ''].join(' ')}>
      <div className={styles.rfqTop}>
        <div className={styles.rfqLeft}>
          <div className={styles.rfqName}>{rfq.groupName}</div>
          <div className={styles.rfqDirector}>From: <strong>{rfq.directorName}</strong></div>
          {receivedAt && <div className={styles.rfqDate}>Received {format(receivedAt, 'MMM d, yyyy')}</div>}
        </div>
        <Badge variant={meta.variant}>{meta.icon} {meta.label}</Badge>
      </div>

      {/* Game details */}
      <div className={styles.rfqDetails}>
        <div className={styles.rfqDetail}><span>🏒 Games</span><strong>{totalGames}</strong></div>
        <div className={styles.rfqDetail}><span>⏱ Hours</span><strong>{totalHours.toFixed(2)}hrs</strong></div>
        <div className={styles.rfqDetail}><span>Officials</span><strong>{{both:'Refs & SKs', referees:'Refs Only', scorekeepers:'SKs Only'}[rfq.officialsNeeded] ?? '—'}</strong></div>
        {rfq.startDate && <div className={styles.rfqDetail}><span>📅 Dates</span><strong>{format(new Date(rfq.startDate), 'MMM d')}{rfq.endDate ? ` – ${format(new Date(rfq.endDate), 'MMM d')}` : ''}</strong></div>}
        {rfq.venues?.length > 0 && <div className={styles.rfqDetail}><span>📍 Venues</span><strong>{rfq.venues.join(', ')}</strong></div>}
      </div>

      {/* Budget guidance */}
      {(refRate || skRate) && (
        <div className={styles.rfqBudget}>
          <div className={styles.rfqBudgetLabel}>Director's Budget Guidance</div>
          {refRate && <div className={styles.rfqBudgetRow}>🏒 Ref: ${refRate.hourlyRate}/hr + ${refRate.perGameFee}/game → Est. <strong>${(refRate.hourlyRate * totalHours + refRate.perGameFee * totalGames).toFixed(2)}</strong></div>}
          {skRate  && <div className={styles.rfqBudgetRow}>📋 SK: ${skRate.hourlyRate}/hr + ${skRate.perGameFee}/game → Est. <strong>${(skRate.hourlyRate * totalHours + skRate.perGameFee * totalGames).toFixed(2)}</strong></div>}
        </div>
      )}

      {/* Quote submitted */}
      {rfq.quoteAmount && (
        <div className={styles.rfqQuoteSent}>
          Your quote: <strong>${rfq.quoteAmount.toFixed(2)}</strong>
          {rfq.quoteNote && <span> · "{rfq.quoteNote}"</span>}
        </div>
      )}

      {onQuote && (
        <div className={styles.rfqActions}>
          <Button variant="primary" onClick={onQuote}>Submit Quote</Button>
        </div>
      )}

      {rfq.status === 'accepted' && (
        <div className={styles.rfqAcceptedNotice}>
          ✅ Your quote was accepted! An invoice has been created for the director to pay.
        </div>
      )}
      {rfq.status === 'not_selected' && (
        <div className={styles.rfqNotSelected}>Another scheduler was selected for this event.</div>
      )}
    </div>
  )
}

// ── Submit Quote Modal ────────────────────────────────────────────────────────
function SubmitQuoteModal({ open, onClose, rfq, schedulerUid, schedulerName }) {
  const [saving, setSaving]       = useState(false)
  const [amount, setAmount]       = useState('')
  const [breakdown, setBreakdown] = useState('')
  const [note, setNote]           = useState('')

  // Pre-fill with estimated amount
  useEffect(() => {
    if (!rfq) return
    const refRate = rfq.refInvoiceRate
    const skRate  = rfq.skInvoiceRate
    const hrs = rfq.totalHours ?? 0
    const games = rfq.gameCount ?? 0
    let est = 0
    if (refRate) est += refRate.hourlyRate * hrs + refRate.perGameFee * games
    if (skRate)  est += skRate.hourlyRate  * hrs + skRate.perGameFee  * games
    if (est > 0) setAmount(est.toFixed(2))

    // Pre-fill breakdown
    const lines = []
    if (refRate) lines.push(`Referee scheduling: ${hrs}hrs × $${refRate.hourlyRate}/hr + ${games} games × $${refRate.perGameFee}/game = $${(refRate.hourlyRate * hrs + refRate.perGameFee * games).toFixed(2)}`)
    if (skRate)  lines.push(`Scorekeeper scheduling: ${hrs}hrs × $${skRate.hourlyRate}/hr + ${games} games × $${skRate.perGameFee}/game = $${(skRate.hourlyRate * hrs + skRate.perGameFee * games).toFixed(2)}`)
    if (lines.length) setBreakdown(lines.join('\n'))
  }, [rfq])

  const handleSubmit = async () => {
    if (!amount || isNaN(Number(amount))) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      await updateRFQ(rfq.id, {
        status:        'quoted',
        schedulerName,
        quoteAmount:   Number(amount),
        quoteBreakdown: breakdown,
        quoteNote:     note,
        quotedAt:      new Date().toISOString(),
      })
      // Notify director
      await addDoc(collection(db, 'notifications'), {
        uid:     rfq.directorUid,
        type:    'rfq',
        title:   'Quote Received',
        message: `${schedulerName} submitted a quote of $${Number(amount).toFixed(2)} for "${rfq.groupName}"`,
        read:    false,
        link:    '/director/events',
        createdAt: serverTimestamp(),
      })
      toast.success('Quote submitted! The director will be notified.')
      onClose()
    } catch (err) {
      toast.error('Failed to submit quote')
      console.error(err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Submit Quote — ${rfq?.groupName ?? ''}`} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSubmit}>Submit Quote</Button></>}
    >
      <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        Review the game details and submit your price. The director will see your quote and can accept or decline.
      </p>

      <Input
        label="Your Price ($) *"
        type="number"
        step="0.01"
        placeholder="0.00"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        hint="This is what you'll invoice the director if they accept"
      />

      <Textarea
        label="Price Breakdown (optional)"
        rows={4}
        placeholder="Hourly rate × hours + per-game fee × games…"
        value={breakdown}
        onChange={e => setBreakdown(e.target.value)}
      />

      <Textarea
        label="Note to Director (optional)"
        rows={2}
        placeholder="Any additional info, availability notes, or conditions…"
        value={note}
        onChange={e => setNote(e.target.value)}
      />

      {amount && (
        <div style={{ background: 'rgba(0,184,153,.08)', border: '1px solid rgba(0,184,153,.2)', borderRadius: 'var(--radius)', padding: '12px 14px', fontSize: 14, fontWeight: 700, color: 'var(--teal)' }}>
          You are quoting: ${Number(amount || 0).toFixed(2)}
        </div>
      )}
    </Modal>
  )
}
