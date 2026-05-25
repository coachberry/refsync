import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { connectBankAccount, getStripeDashboardLink, createInvoicePayment, payOfficial } from '@/services/stripe'
import { getStripe } from '@/services/stripe'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Select, Textarea, FormRow } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './ProfileFinances.module.css'

const STATUS_COLORS = {
  draft: 'gray', sent: 'blue', paid: 'green',
  payment_pending: 'amber', failed: 'red', pending: 'amber',
}

export default function ProfileFinances() {
  const { user, profile, refreshProfile } = useAuth()
  const { isReferee, isScorekeeper, isRefScheduler, isSKScheduler, isAnyScheduler } = useSubRoles()
  const [tab, setTab]           = useState('overview')
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [loading, setLoading]   = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [showPayModal, setShowPayModal]         = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [payingId, setPayingId] = useState(null)

  const roles = profile?.roles ?? []
  const isOfficial  = roles.includes('official')
  const isScheduler = roles.includes('scheduler')
  const isDirector  = roles.includes('director')
  const stripeConnected = !!profile?.stripeAccountId && profile?.stripeOnboarded

  useEffect(() => {
    if (!user) return
    const queries = []

    // Invoices — as scheduler (sent) or director (received)
    if (isScheduler) {
      queries.push(onSnapshot(
        query(collection(db, 'invoices'), where('schedulerId', '==', user.uid)),
        snap => setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      ))
    } else if (isDirector) {
      queries.push(onSnapshot(
        query(collection(db, 'invoices'), where('directorId', '==', user.uid)),
        snap => setInvoices(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      ))
    }

    // Payments — as scheduler (sent) or official (received)
    if (isScheduler) {
      queries.push(onSnapshot(
        query(collection(db, 'payments'), where('schedulerId', '==', user.uid)),
        snap => setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      ))
    } else if (isOfficial) {
      queries.push(onSnapshot(
        query(collection(db, 'payments'), where('officialId', '==', user.uid)),
        snap => { setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) }
      ))
    }

    setLoading(false)
    return () => queries.forEach(u => u())
  }, [user, isScheduler, isDirector, isOfficial])

  // Handle Stripe return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('stripe') === 'success') {
      refreshProfile()
      toast.success('Bank account connected successfully!')
      window.history.replaceState({}, '', '/profile/finances')
    }
  }, [])

  const handleConnectBank = async () => {
    setConnecting(true)
    try {
      const { url } = await connectBankAccount(user.uid, profile.email, profile.displayName)
      window.location.href = url
    } catch (err) {
      toast.error(err.message)
      setConnecting(false)
    }
  }

  const handleStripeDashboard = async () => {
    try {
      const { url } = await getStripeDashboardLink(user.uid)
      window.open(url, '_blank')
    } catch (err) {
      toast.error('Could not open Stripe dashboard')
    }
  }

  const handlePayInvoice = async (invoice, method) => {
    setPayingId(invoice.id)
    try {
      const result = await createInvoicePayment(
        invoice.id, user.uid, invoice.schedulerId,
        invoice.amount, method
      )
      // Confirm payment with Stripe.js
      const stripe = await getStripe()
      const { error } = await stripe.confirmPayment({
        clientSecret: result.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/profile/finances?stripe=paid`,
        },
      })
      if (error) throw new Error(error.message)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPayingId(null)
    }
  }

  const handlePayOfficial = async (payment) => {
    setPayingId(payment.id)
    try {
      await payOfficial(
        payment.id, user.uid, payment.officialId,
        payment.amount, payment.description
      )
      toast.success(`$${payment.amount} sent to ${payment.officialName}`)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setPayingId(null)
    }
  }

  // Summary stats
  const totalAR      = invoices.filter(i => i.status !== 'paid').reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalPaid    = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount ?? 0), 0)
  const totalOwed    = payments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount ?? 0), 0)
  const totalEarned  = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount ?? 0), 0)

  const TABS = [
    { id: 'overview', label: 'Overview' },
    isScheduler && { id: 'invoices', label: `Invoices (${invoices.length})` },
    isScheduler && { id: 'payroll',  label: `Payroll (${payments.length})` },
    isDirector  && { id: 'invoices', label: `My Invoices (${invoices.length})` },
    isOfficial  && { id: 'earnings', label: `My Earnings (${payments.length})` },
  ].filter(Boolean).filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Finances</h1>
          <p className={styles.sub}>
            {isScheduler && 'Invoices · Payroll · Payments'}
            {isOfficial && !isScheduler && 'Your earnings and payment history'}
            {isDirector && !isScheduler && 'Invoice payments to schedulers'}
          </p>
        </div>
        <div className={styles.headerActions}>
          {isScheduler && <Button variant="secondary" onClick={() => setShowPayModal(true)}>+ Pay Official</Button>}
          {isScheduler && <Button variant="primary" onClick={() => setShowInvoiceModal(true)}>+ Create Invoice</Button>}
        </div>
      </div>

      {/* Stripe connect banner */}
      {(isScheduler || isOfficial) && (
        <div className={[styles.stripeBanner, stripeConnected ? styles.stripeBannerConnected : styles.stripeBannerPending].join(' ')}>
          {stripeConnected ? (
            <>
              <div className={styles.stripeBannerLeft}>
                <span className={styles.stripeBannerIcon}>✅</span>
                <div>
                  <div className={styles.stripeBannerTitle}>Bank Account Connected</div>
                  <div className={styles.stripeBannerSub}>You can send and receive payments through RefSync</div>
                </div>
              </div>
              <Button variant="secondary" size="sm" onClick={handleStripeDashboard}>
                View Stripe Dashboard ↗
              </Button>
            </>
          ) : (
            <>
              <div className={styles.stripeBannerLeft}>
                <span className={styles.stripeBannerIcon}>🏦</span>
                <div>
                  <div className={styles.stripeBannerTitle}>Connect Your Bank Account</div>
                  <div className={styles.stripeBannerSub}>Required to {isScheduler ? 'receive invoice payments and pay officials' : 'receive game payments'}</div>
                </div>
              </div>
              <Button variant="primary" loading={connecting} onClick={handleConnectBank}>
                Connect Bank Account
              </Button>
            </>
          )}
        </div>
      )}

      {/* Stats */}
      <div className={styles.statsGrid}>
        {isScheduler && <>
          <StatCard icon="📥" label="Outstanding Invoices" value={`$${totalAR.toLocaleString()}`}   color="var(--blue)" />
          <StatCard icon="✅" label="Invoices Paid"        value={`$${totalPaid.toLocaleString()}`} color="var(--teal)" />
          <StatCard icon="⏳" label="Owed to Officials"    value={`$${totalOwed.toLocaleString()}`}  color="var(--amber)" />
          <StatCard icon="📤" label="Paid to Officials"    value={`$${totalEarned.toLocaleString()}`} color="var(--teal)" />
        </>}
        {isOfficial && !isScheduler && <>
          <StatCard icon="💰" label="Total Earned"   value={`$${totalEarned.toLocaleString()}`} color="var(--teal)" />
          <StatCard icon="⏳" label="Pending Payment" value={`$${totalOwed.toLocaleString()}`}  color="var(--amber)" />
        </>}
        {isDirector && !isScheduler && <>
          <StatCard icon="📄" label="Unpaid Invoices" value={`$${totalAR.toLocaleString()}`}   color="var(--red)" />
          <StatCard icon="✅" label="Total Paid"      value={`$${totalPaid.toLocaleString()}`} color="var(--teal)" />
        </>}
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id} className={[styles.tab, tab === t.id ? styles.tabActive : ''].join(' ')} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.center}><Spinner size="lg" /></div>
      ) : (
        <>
          {tab === 'overview' && (
            <div className={styles.overviewGrid}>
              {/* Recent invoices */}
              {(isScheduler || isDirector) && (
                <Card>
                  <CardHeader><CardTitle>{isScheduler ? 'Recent Invoices Sent' : 'Recent Invoices Received'}</CardTitle></CardHeader>
                  <CardBody noPadding>
                    {invoices.length === 0 ? <EmptyState icon="📄" title="No invoices yet" /> :
                      invoices.slice(0, 5).map(inv => (
                        <div key={inv.id} className={styles.listRow}>
                          <div>
                            <div className={styles.listName}>{isScheduler ? inv.directorName : inv.schedulerName ?? 'Scheduler'}</div>
                            <div className={styles.listSub}>{inv.groupName ?? '—'} · {inv.invoiceNumber ?? ''}</div>
                          </div>
                          <div className={styles.listRight}>
                            <span className={styles.listAmount}>${(inv.amount ?? 0).toLocaleString()}</span>
                            <Badge variant={STATUS_COLORS[inv.status] ?? 'gray'}>{inv.status}</Badge>
                            {isDirector && inv.status !== 'paid' && (
                              <Button size="sm" variant="primary" loading={payingId === inv.id}
                                onClick={() => handlePayInvoice(inv, 'card')}>Pay Now</Button>
                            )}
                          </div>
                        </div>
                      ))
                    }
                  </CardBody>
                </Card>
              )}

              {/* Recent payments */}
              <Card>
                <CardHeader><CardTitle>{isScheduler ? 'Recent Payroll' : 'Recent Payments'}</CardTitle></CardHeader>
                <CardBody noPadding>
                  {payments.length === 0 ? <EmptyState icon="💰" title="No payments yet" /> :
                    payments.slice(0, 5).map(pay => (
                      <div key={pay.id} className={styles.listRow}>
                        <div className={styles.listRowLeft}>
                          <Avatar name={isScheduler ? pay.officialName : pay.schedulerName ?? 'Scheduler'} size="sm" />
                          <div>
                            <div className={styles.listName}>{isScheduler ? pay.officialName : pay.schedulerName ?? 'Scheduler'}</div>
                            <div className={styles.listSub}>{pay.description ?? '—'}</div>
                          </div>
                        </div>
                        <div className={styles.listRight}>
                          <span className={styles.listAmount}>${(pay.amount ?? 0).toLocaleString()}</span>
                          <Badge variant={STATUS_COLORS[pay.status] ?? 'gray'}>{pay.status}</Badge>
                          {isScheduler && pay.status === 'pending' && stripeConnected && (
                            <Button size="sm" variant="teal" loading={payingId === pay.id}
                              onClick={() => handlePayOfficial(pay)}>Pay</Button>
                          )}
                        </div>
                      </div>
                    ))
                  }
                </CardBody>
              </Card>
            </div>
          )}

          {tab === 'invoices' && (
            <InvoicesTable
              invoices={invoices}
              isDirector={isDirector}
              isScheduler={isScheduler}
              payingId={payingId}
              onPay={handlePayInvoice}
            />
          )}

          {tab === 'payroll' && (
            <PayrollTable
              payments={payments}
              isScheduler={isScheduler}
              stripeConnected={stripeConnected}
              payingId={payingId}
              onPay={handlePayOfficial}
            />
          )}

          {tab === 'earnings' && (
            <EarningsTable payments={payments} />
          )}
        </>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, color }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statIcon} style={{ color }}>{icon}</div>
      <div className={styles.statValue} style={{ color }}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}

// ── Invoices table ────────────────────────────────────────────────────────────
function InvoicesTable({ invoices, isDirector, isScheduler, payingId, onPay }) {
  if (!invoices.length) return <Card><CardBody><EmptyState icon="📄" title="No invoices yet" /></CardBody></Card>
  return (
    <Card>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th>Invoice #</th>
            <th>{isDirector ? 'Scheduler' : 'Director'}</th>
            <th>Group</th>
            <th>Amount</th>
            <th>Due Date</th>
            <th>Status</th>
            <th>Actions</th>
          </tr></thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className={styles.invoiceNum}>{inv.invoiceNumber ?? `#${inv.id.slice(0,6).toUpperCase()}`}</td>
                <td>{isDirector ? (inv.schedulerName ?? '—') : (inv.directorName ?? '—')}</td>
                <td className={styles.muted}>{inv.groupName ?? '—'}</td>
                <td className={styles.amount}>${(inv.amount ?? 0).toLocaleString()}</td>
                <td className={styles.muted}>{inv.dueDate ? format(new Date(inv.dueDate), 'MMM d, yyyy') : '—'}</td>
                <td><Badge variant={STATUS_COLORS[inv.status] ?? 'gray'}>{inv.status}</Badge></td>
                <td>
                  <div className={styles.rowActions}>
                    {isDirector && inv.status !== 'paid' && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button size="sm" variant="primary" loading={payingId === inv.id} onClick={() => onPay(inv, 'card')}>
                          💳 Card
                        </Button>
                        <Button size="sm" variant="secondary" loading={payingId === inv.id} onClick={() => onPay(inv, 'us_bank_account')}>
                          🏦 ACH
                        </Button>
                      </div>
                    )}
                    {isScheduler && inv.status === 'paid' && (
                      <Badge variant="green">Received</Badge>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── Payroll table ─────────────────────────────────────────────────────────────
function PayrollTable({ payments, isScheduler, stripeConnected, payingId, onPay }) {
  if (!payments.length) return <Card><CardBody><EmptyState icon="💰" title="No payroll records yet" /></CardBody></Card>
  return (
    <Card>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th>Official</th><th>Description</th><th>Games</th>
            <th>Amount</th><th>Date</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            {payments.map(pay => (
              <tr key={pay.id}>
                <td>
                  <div className={styles.officialCell}>
                    <Avatar name={pay.officialName} size="xs" />
                    <span>{pay.officialName}</span>
                  </div>
                </td>
                <td className={styles.muted}>{pay.description ?? '—'}</td>
                <td className={styles.muted}>{pay.gameCount ?? '—'}</td>
                <td className={styles.amount}>${(pay.amount ?? 0).toLocaleString()}</td>
                <td className={styles.muted}>{pay.createdAt ? format(pay.createdAt.toDate?.() ?? new Date(pay.createdAt), 'MMM d') : '—'}</td>
                <td><Badge variant={STATUS_COLORS[pay.status] ?? 'gray'}>{pay.status}</Badge></td>
                <td>
                  {pay.status === 'pending' && stripeConnected && (
                    <Button size="sm" variant="teal" loading={payingId === pay.id} onClick={() => onPay(pay)}>
                      Pay Now
                    </Button>
                  )}
                  {pay.status === 'pending' && !stripeConnected && (
                    <span className={styles.muted} style={{ fontSize: 12 }}>Connect bank first</span>
                  )}
                  {pay.status === 'paid' && <Badge variant="green">Paid ✓</Badge>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── Earnings table (officials) ────────────────────────────────────────────────
function EarningsTable({ payments }) {
  const earned  = payments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.amount ?? 0), 0)
  const pending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount ?? 0), 0)

  if (!payments.length) return <Card><CardBody><EmptyState icon="💰" title="No earnings yet" message="Game pay will appear here once a scheduler sends payment." /></CardBody></Card>
  return (
    <Card>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead><tr>
            <th>From</th><th>Description</th><th>Amount</th><th>Date</th><th>Status</th>
          </tr></thead>
          <tbody>
            {payments.map(pay => (
              <tr key={pay.id}>
                <td>{pay.schedulerName ?? '—'}</td>
                <td className={styles.muted}>{pay.description ?? '—'}</td>
                <td className={styles.amount}>${(pay.amount ?? 0).toLocaleString()}</td>
                <td className={styles.muted}>{pay.createdAt ? format(pay.createdAt.toDate?.() ?? new Date(pay.createdAt), 'MMM d') : '—'}</td>
                <td><Badge variant={STATUS_COLORS[pay.status] ?? 'gray'}>{pay.status === 'paid' ? '✅ Paid' : '⏳ Pending'}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
