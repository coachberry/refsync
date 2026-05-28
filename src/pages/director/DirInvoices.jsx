import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import { createInvoicePayment, getStripe } from '@/services/stripe'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './DirInvoices.module.css'

const STATUS_COLORS = {
  draft: 'gray', sent: 'blue', paid: 'green',
  payment_pending: 'amber', failed: 'red',
}

export default function DirInvoices() {
  const { user } = useAuth()
  const [invoices, setInvoices]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [payingId, setPayingId]   = useState(null)
  const [filter, setFilter]       = useState('all')

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'invoices'), where('directorId', '==', user.uid))
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
      setInvoices(data)
      setLoading(false)
    })
    return unsub
  }, [user])

  const handlePay = async (invoice, method) => {
    setPayingId(invoice.id + method)
    try {
      // Validate invoice has required fields before calling server
      if (!invoice.schedulerId) {
        throw new Error('Invoice is missing scheduler ID — this invoice may have been created before this field was added. Please delete and recreate it.')
      }

      const result = await createInvoicePayment(
        invoice.id, user.uid, invoice.schedulerId, invoice.amount, method
      )

      if (!result.clientSecret) {
        throw new Error('Server did not return a payment token. Check that the scheduler has connected their bank account.')
      }

      const stripe = await getStripe()
      if (!stripe) {
        throw new Error('Stripe.js failed to load. Check that VITE_STRIPE_PUBLISHABLE_KEY is set in Vercel.')
      }

      // Detect live/test key mismatch
      const pubKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? ''
      const isTestPub = pubKey.startsWith('pk_test_')
      const isTestSecret = result.clientSecret?.includes('_test_')
      if (isTestPub !== isTestSecret) {
        throw new Error(`Stripe key mismatch: frontend is using a ${isTestPub ? 'test' : 'live'} publishable key but the server returned a ${isTestSecret ? 'test' : 'live'} client secret. Both must match.`)
      }

      const { error } = await stripe.confirmPayment({
        clientSecret: result.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/director/invoices?paid=${invoice.id}`,
        },
        redirect: 'always',
      })
      if (error) throw new Error(error.message)
    } catch (err) {
      console.error('Payment error full details:', err)
      toast.error(err.message ?? 'Payment failed', { duration: 8000 })
    } finally {
      setPayingId(null)
    }
  }

  // Handle return from Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('paid')) {
      toast.success('Payment successful! Invoice marked as paid.')
      window.history.replaceState({}, '', '/director/invoices')
    }
  }, [])

  const filtered = invoices.filter(inv => {
    if (filter === 'unpaid') return inv.status !== 'paid'
    if (filter === 'paid')   return inv.status === 'paid'
    return true
  })

  const totalOwed = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalPaid = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount ?? 0), 0)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Invoices</h1>
          <p className={styles.sub}>Invoices from your schedulers</p>
        </div>
      </div>

      {/* Summary */}
      <div className={styles.statsGrid}>
        <div className={styles.stat}>
          <div className={styles.statIcon}>📄</div>
          <div className={styles.statValue} style={{ color: 'var(--red)' }}>${totalOwed.toLocaleString()}</div>
          <div className={styles.statLabel}>Outstanding</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statIcon}>✅</div>
          <div className={styles.statValue} style={{ color: 'var(--teal)' }}>${totalPaid.toLocaleString()}</div>
          <div className={styles.statLabel}>Paid to date</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statIcon}>🧾</div>
          <div className={styles.statValue}>{invoices.length}</div>
          <div className={styles.statLabel}>Total invoices</div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        {['all', 'unpaid', 'paid'].map(f => (
          <button key={f} className={[styles.filterBtn, filter === f ? styles.filterActive : ''].join(' ')} onClick={() => setFilter(f)}>
            {f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.center}><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState icon="🧾" title="No invoices yet" message="When a scheduler sends you an invoice it will appear here." />
          </CardBody>
        </Card>
      ) : (
        <div className={styles.invoiceList}>
          {filtered.map(inv => {
            const isPaid    = inv.status === 'paid'
            const isPending = inv.status === 'payment_pending'
            const createdAt = inv.createdAt?.toDate?.() ?? (inv.createdAt ? new Date(inv.createdAt) : null)
            const dueDate   = inv.dueDate ? new Date(inv.dueDate) : null
            const isOverdue = dueDate && !isPaid && dueDate < new Date()

            return (
              <div key={inv.id} className={[styles.invoiceCard, isPaid ? styles.invoicePaid : isOverdue ? styles.invoiceOverdue : ''].join(' ')}>
                <div className={styles.invoiceTop}>
                  <div className={styles.invoiceLeft}>
                    <div className={styles.invoiceNum}>{inv.invoiceNumber ?? `#${inv.id.slice(0,6).toUpperCase()}`}</div>
                    <div className={styles.invoiceFrom}>From: <strong>{inv.schedulerName ?? 'Scheduler'}</strong></div>
                    {inv.groupName && <div className={styles.invoiceMeta}>Event: {inv.groupName}</div>}
                    {createdAt && <div className={styles.invoiceMeta}>Issued: {format(createdAt, 'MMM d, yyyy')}</div>}
                    {dueDate    && <div className={[styles.invoiceMeta, isOverdue ? styles.overdue : ''].join(' ')}>Due: {format(dueDate, 'MMM d, yyyy')}{isOverdue ? ' ⚠️ Overdue' : ''}</div>}
                    {inv.notes  && <div className={styles.invoiceNotes}>{inv.notes}</div>}
                  </div>
                  <div className={styles.invoiceRight}>
                    <div className={styles.invoiceAmount}>${(inv.amount ?? 0).toLocaleString()}</div>
                    <Badge variant={STATUS_COLORS[inv.status] ?? 'gray'}>{inv.status}</Badge>
                  </div>
                </div>

                {/* Breakdown if available */}
                {(inv.totalHours || inv.gameCount) && (
                  <div className={styles.invoiceBreakdown}>
                    {inv.totalHours && <span>⏱ {inv.totalHours}hrs @ ${inv.invoiceRate?.hourlyRate ?? '—'}/hr</span>}
                    {inv.gameCount  && <span>🏒 {inv.gameCount} games @ ${inv.invoiceRate?.perGameFee ?? '—'}/game</span>}
                  </div>
                )}

                {/* Payment actions */}
                {!isPaid && !isPending && (
                  <div className={styles.payActions}>
                    <div className={styles.payLabel}>Pay this invoice:</div>
                    <div className={styles.payButtons}>
                      <Button
                        variant="primary"
                        loading={payingId === inv.id + 'card'}
                        onClick={() => handlePay(inv, 'card')}
                      >
                        💳 Pay by Card
                      </Button>
                      <Button
                        variant="secondary"
                        loading={payingId === inv.id + 'us_bank_account'}
                        onClick={() => handlePay(inv, 'us_bank_account')}
                      >
                        🏦 Pay by ACH
                      </Button>
                      <Button
                        variant="ghost"
                        style={{ fontSize:12.5, color:'var(--color-muted)' }}
                        loading={payingId === inv.id + 'external'}
                        onClick={async () => {
                          const method = window.prompt('How are you paying? (e.g. Check, Cash, Venmo, Zelle)', 'Check')
                          if (method === null) return
                          setPayingId(inv.id + 'external')
                          try {
                            const { updateDoc, doc: fdoc, serverTimestamp: sts } = await import('firebase/firestore')
                            const { db: fdb } = await import('@/lib/firebase')
                            await updateDoc(fdoc(fdb, 'invoices', inv.id), {
                              status: 'paid',
                              paidMethod: method.trim() || 'External',
                              paidExternal: true,
                              paidAt: new Date().toISOString(),
                            })
                            toast.success(`Invoice marked as paid via ${method || 'external'}`)
                          } catch { toast.error('Failed to update') }
                          finally { setPayingId(null) }
                        }}
                      >
                        Mark Paid Externally
                      </Button>
                    </div>
                    <div className={styles.feeNote}>
                      Card: 2.9% + $0.30 · ACH: 0.8% (max $5) · External: no fee, tracked for records
                    </div>
                  </div>
                )}

                {isPending && (
                  <div className={styles.pendingNotice}>
                    ⏳ Payment processing — this usually takes a few minutes
                  </div>
                )}
                {isPaid && (
                  <div className={styles.paidNotice}>
                    ✅ Paid{inv.paidAt ? ` ${format(inv.paidAt.toDate?.() ?? new Date(inv.paidAt), 'MMM d, yyyy')}` : ''}
                    {inv.paidMethod ? ` · ${inv.paidMethod}` : inv.paidExternal ? '' : ' · via Stripe'}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
