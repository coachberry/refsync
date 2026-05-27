import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGameGroups } from '@/hooks/useGameGroups'
import { useRoster } from '@/hooks/useRoster'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Textarea, Select, FormRow } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { Avatar } from '@/components/ui/Avatar'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './SchedFinance.module.css'

const STATUS_COLORS = {
  draft: 'gray', sent: 'blue', paid: 'green',
  partial: 'amber', overdue: 'red', pending: 'amber',
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SchedFinance() {
  const { user, profile } = useAuth()
  const { groups } = useGameGroups()
  const { roster } = useRoster()
  const [tab, setTab]             = useState('overview')
  const [invoices, setInvoices]   = useState([])
  const [payments, setPayments]   = useState([])
  const [expenses, setExpenses]   = useState([])
  const [acceptedRfqs, setAcceptedRfqs] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showInvoice, setShowInvoice] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [prefillRfq, setPrefillRfq]   = useState(null)

  useEffect(() => {
    if (!user) return
    fetchFinance()
    getDocs(query(collection(db, 'rfqs'),
      where('schedulerUid', '==', user.uid),
      where('status', '==', 'accepted')
    )).then(snap => setAcceptedRfqs(snap.docs.map(d => ({ id: d.id, ...d.data() })))).catch(() => {})
  }, [user])

  const fetchFinance = async () => {
    setLoading(true)
    try {
      const [invSnap, paySnap, expSnap] = await Promise.all([
        getDocs(query(collection(db, 'invoices'), where('schedulerId', '==', user.uid))),
        getDocs(query(collection(db, 'payments'), where('schedulerId', '==', user.uid))),
        getDocs(query(collection(db, 'expenses'), where('schedulerId', '==', user.uid))),
      ])
      setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setExpenses(expSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { toast.error('Failed to load finance data') }
    finally { setLoading(false) }
  }

  const totalAR       = invoices.reduce((s, i) => s + (i.status !== 'paid' ? (i.amount ?? 0) : 0), 0)
  const totalReceived = invoices.reduce((s, i) => s + (i.status === 'paid' ? (i.amount ?? 0) : 0), 0)
  const totalPaidOut  = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const totalOwed     = payments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount ?? 0), 0)
  const pendingExpenses = expenses.filter(e => e.status === 'pending').length

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'invoices', label: `Invoices (${invoices.length})` },
    { id: 'payroll',  label: `Payroll (${payments.length})` },
    { id: 'expenses', label: `Expenses${pendingExpenses > 0 ? ` (${pendingExpenses})` : ''}` },
  ]

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Finance</h1>
          <p className={styles.sub}>Accounts receivable from directors · Payroll for officials</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="secondary" onClick={() => setShowPayment(true)}>+ Pay Official</Button>
          <Button variant="primary"   onClick={() => setShowInvoice(true)}>+ Create Invoice</Button>
        </div>
      </div>

      {acceptedRfqs.filter(r => !invoices.find(i => i.rfqId === r.id)).map(rfq => (
        <div key={rfq.id} style={{
          background: 'rgba(0,184,153,.08)', border: '1.5px solid rgba(0,184,153,.3)',
          borderRadius: 'var(--radius-md)', padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 22 }}>✅</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Quote accepted — "{rfq.groupName}"</div>
            <div style={{ fontSize: 13, color: 'var(--color-muted)', marginTop: 2 }}>
              {rfq.directorName} accepted your quote of <strong>${rfq.quoteAmount?.toFixed(2)}</strong>. Send them an invoice to get paid.
            </div>
          </div>
          <Button variant="teal" onClick={() => { setPrefillRfq(rfq); setShowInvoice(true) }}>
            📄 Create Invoice
          </Button>
        </div>
      ))}

      <div className={styles.statsGrid}>
        <StatCard icon="📥" label="Outstanding AR"     value={`$${totalAR.toLocaleString()}`}       color="var(--blue)" />
        <StatCard icon="✅" label="Received (All Time)" value={`$${totalReceived.toLocaleString()}`}  color="var(--teal)" />
        <StatCard icon="📤" label="Paid to Officials"   value={`$${totalPaidOut.toLocaleString()}`}   color="var(--teal)" />
        <StatCard icon="⏳" label="Owed to Officials"   value={`$${totalOwed.toLocaleString()}`}      color="var(--amber)" />
      </div>

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t.id}
            className={[styles.tab, tab === t.id ? styles.tabActive : ''].join(' ')}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.center}><Spinner size="lg" /></div>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab invoices={invoices} payments={payments} roster={roster} />}
          {tab === 'invoices' && <InvoicesTab invoices={invoices} onRefresh={fetchFinance} schedulerId={user?.uid} />}
          {tab === 'payroll'  && <PayrollTab  payments={payments} roster={roster} onRefresh={fetchFinance} schedulerId={user?.uid} />}
          {tab === 'expenses' && <ExpensesTab expenses={expenses} onRefresh={fetchFinance} />}
        </>
      )}

      <CreateInvoiceModal
        open={showInvoice}
        onClose={() => { setShowInvoice(false); setPrefillRfq(null) }}
        groups={groups}
        schedulerId={user?.uid}
        schedulerName={profile?.displayName}
        prefillRfq={prefillRfq}
        onSaved={fetchFinance}
      />
      <PayOfficialModal
        open={showPayment}
        onClose={() => setShowPayment(false)}
        roster={roster}
        schedulerId={user?.uid}
        onSaved={fetchFinance}
      />
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

// ── Overview tab ──────────────────────────────────────────────────────────────
function OverviewTab({ invoices, payments, roster }) {
  const recentInvoices  = [...invoices].sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)).slice(0, 5)
  const pendingPayments = payments.filter(p => p.status === 'pending').slice(0, 5)
  return (
    <div className={styles.overviewGrid}>
      <Card>
        <CardHeader><CardTitle>Recent Invoices</CardTitle></CardHeader>
        <CardBody noPadding>
          {recentInvoices.length === 0 ? (
            <EmptyState icon="📄" title="No invoices yet" />
          ) : recentInvoices.map(inv => (
            <div key={inv.id} className={styles.listRow}>
              <div>
                <div className={styles.listName}>{inv.directorName ?? 'Director'}</div>
                <div className={styles.listSub}>{inv.groupName ?? '—'} · {inv.invoiceNumber}</div>
              </div>
              <div className={styles.listRight}>
                <span className={styles.listAmount}>${(inv.amount ?? 0).toLocaleString()}</span>
                <Badge variant={STATUS_COLORS[inv.status] ?? 'gray'}>{inv.status}</Badge>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader><CardTitle>Pending Payroll</CardTitle></CardHeader>
        <CardBody noPadding>
          {pendingPayments.length === 0 ? (
            <EmptyState icon="💰" title="No pending payroll" message="Officials will appear here once games complete." />
          ) : pendingPayments.map(pay => (
            <div key={pay.id} className={styles.listRow}>
              <div className={styles.listRowLeft}>
                <Avatar name={pay.officialName} size="sm" />
                <div>
                  <div className={styles.listName}>{pay.officialName}</div>
                  <div className={styles.listSub}>{pay.description ?? pay.groupName ?? '—'}</div>
                </div>
              </div>
              <div className={styles.listRight}>
                <span className={styles.listAmount}>${(pay.amount ?? 0).toLocaleString()}</span>
                <Badge variant="amber">Pending</Badge>
              </div>
            </div>
          ))}
        </CardBody>
      </Card>
    </div>
  )
}

// ── Invoices tab ──────────────────────────────────────────────────────────────
function InvoicesTab({ invoices, onRefresh }) {
  const [updatingId, setUpdatingId] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const markUnpaid = async (inv) => {
    if (!window.confirm('Mark as unpaid? Use only to correct a mistake.')) return
    setUpdatingId(inv.id)
    try {
      await updateDoc(doc(db, 'invoices', inv.id), { status: 'sent', paidAt: null, paidMethod: null, paidExternal: false })
      toast.success('Invoice marked as unpaid')
      onRefresh()
    } catch { toast.error('Failed to update') }
    finally { setUpdatingId(null) }
  }

  const markPaidExternal = async (inv) => {
    const method = window.prompt('How was this paid? (e.g. Check, Cash, Venmo, Zelle)', 'Check')
    if (method === null) return
    setUpdatingId(inv.id)
    try {
      await updateDoc(doc(db, 'invoices', inv.id), {
        status: 'paid',
        paidMethod: method.trim() || 'External',
        paidExternal: true,
        paidAt: new Date().toISOString(),
      })
      toast.success(`Marked as paid via ${method || 'external'}`)
      onRefresh()
    } catch { toast.error('Failed to update') }
    finally { setUpdatingId(null) }
  }

  const deleteInvoice = async (inv) => {
    if (!window.confirm(`Delete invoice ${inv.invoiceNumber ?? '#' + inv.id.slice(0, 6).toUpperCase()}?`)) return
    setDeletingId(inv.id)
    try {
      await deleteDoc(doc(db, 'invoices', inv.id))
      if (inv.groupId) updateDoc(doc(db, 'gameGroups', inv.groupId), { hasUnpaidInvoice: false }).catch(() => {})
      toast.success('Invoice deleted')
      onRefresh()
    } catch (err) { toast.error('Failed to delete: ' + err.message) }
    finally { setDeletingId(null) }
  }

  const stripePaid   = invoices.filter(i => i.status === 'paid' && !i.paidExternal)
  const externalPaid = invoices.filter(i => i.status === 'paid' &&  i.paidExternal)
  const pending      = invoices.filter(i => i.status !== 'paid')
  const stripeTotal   = stripePaid.reduce((s, i)  => s + (i.amount ?? 0), 0)
  const externalTotal = externalPaid.reduce((s, i) => s + (i.amount ?? 0), 0)
  const pendingTotal  = pending.reduce((s, i)      => s + (i.amount ?? 0), 0)

  if (invoices.length === 0) return (
    <Card><CardBody><EmptyState icon="📄" title="No invoices yet" message="Create an invoice to bill a game director for your scheduling services." /></CardBody></Card>
  )

  return (
    <Card>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderBottom:'1px solid var(--color-border)' }}>
        {[
          { label:'Pending',          value: pendingTotal,  color:'var(--orange)' },
          { label:'Paid via Stripe',  value: stripeTotal,   color:'var(--green)' },
          { label:'Paid Externally',  value: externalTotal, color:'var(--blue)' },
        ].map((s, i) => (
          <div key={s.label} style={{ padding:'12px 16px', borderRight: i < 2 ? '1px solid var(--color-border)' : 'none' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color:'var(--color-muted)', marginBottom:3 }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:800, fontFamily:'var(--font-display)', color:s.color }}>${s.value.toFixed(2)}</div>
          </div>
        ))}
      </div>
      <div style={{ padding:'10px 16px', background:'var(--ice)', borderBottom:'1px solid var(--color-border)', fontSize:12.5, color:'#1a6a9e' }}>
        💳 Stripe payments update automatically. Use "Mark Paid Externally" for checks, cash, Venmo, etc.
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Invoice #</th><th>Director</th><th>Group</th>
              <th>Amount</th><th>Due Date</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => {
              const dueDate = inv.dueDate ? format(new Date(inv.dueDate), 'MMM d, yyyy') : '—'
              return (
                <tr key={inv.id}>
                  <td className={styles.invoiceNum}>{inv.invoiceNumber ?? `#${inv.id.slice(0,6).toUpperCase()}`}</td>
                  <td>{inv.directorName ?? '—'}</td>
                  <td className={styles.muted}>{inv.groupName ?? '—'}</td>
                  <td className={styles.amount}>${(inv.amount ?? 0).toLocaleString()}</td>
                  <td className={styles.muted}>{dueDate}</td>
                  <td>
                    <Badge variant={inv.status === 'paid' ? 'green' : STATUS_COLORS[inv.status] ?? 'gray'}>
                      {inv.status === 'sent' ? 'Awaiting Payment' : inv.status === 'payment_pending' ? 'Processing' : inv.status}
                    </Badge>
                    {inv.paidExternal && inv.paidMethod && (
                      <div style={{ fontSize:10.5, color:'var(--color-muted)', marginTop:2 }}>via {inv.paidMethod}</div>
                    )}
                    {inv.status === 'paid' && !inv.paidExternal && (
                      <div style={{ fontSize:10.5, color:'var(--color-muted)', marginTop:2 }}>via Stripe</div>
                    )}
                  </td>
                  <td>
                    <div className={styles.rowActions}>
                      {inv.status !== 'paid' && (
                        <Button size="sm" variant="ghost" loading={updatingId === inv.id}
                          onClick={() => markPaidExternal(inv)}
                          style={{ fontSize:11.5, color:'var(--color-muted)' }}>
                          Mark Paid Externally
                        </Button>
                      )}
                      {inv.status === 'paid' && (
                        <Button size="sm" variant="ghost" loading={updatingId === inv.id} onClick={() => markUnpaid(inv)}>
                          Mark Unpaid
                        </Button>
                      )}
                      <Button size="sm" variant="danger" loading={deletingId === inv.id} onClick={() => deleteInvoice(inv)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

// ── Payroll tab ───────────────────────────────────────────────────────────────
function PayrollTab({ payments, roster, onRefresh, schedulerId }) {
  const [payingId, setPayingId]     = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const handlePayAll = async (uid, name, records) => {
    const pending = records.filter(r => r.status === 'pending')
    if (!pending.length) return
    const total = pending.reduce((s, r) => s + (r.amount ?? 0), 0)
    if (!window.confirm(`Pay ${name} $${total.toFixed(2)} via Stripe?`)) return
    setPayingId(uid)
    try {
      const { payOfficial } = await import('@/services/stripe')
      await payOfficial(pending[0].id, schedulerId, uid, total, `${pending.length} games — ${name}`)
      await Promise.all(pending.map(r =>
        updateDoc(doc(db, 'payments', r.id), { status: 'paid', paidAt: new Date().toISOString() })
      ))
      toast.success(`$${total.toFixed(2)} sent to ${name}!`)
      onRefresh()
    } catch (err) { toast.error('Payment failed: ' + (err.message ?? err)) }
    finally { setPayingId(null) }
  }

  const handleMarkPaidExternal = async (uid, name, records) => {
    const method = window.prompt(`How did you pay ${name}?`, 'Check')
    if (method === null) return
    setPayingId(uid + '_ext')
    try {
      await Promise.all(records.filter(r => r.status === 'pending').map(r =>
        updateDoc(doc(db, 'payments', r.id), {
          status: 'paid',
          paidMethod: method.trim() || 'External',
          paidExternal: true,
          paidAt: new Date().toISOString(),
        })
      ))
      toast.success(`${name} marked as paid via ${method || 'external'}`)
      onRefresh()
    } catch { toast.error('Failed to update') }
    finally { setPayingId(null) }
  }

  const deletePayment = async (payment) => {
    if (!window.confirm(`Delete payroll record for ${payment.officialName}?`)) return
    setDeletingId(payment.id)
    try {
      await deleteDoc(doc(db, 'payments', payment.id))
      toast.success('Record deleted')
      onRefresh()
    } catch { toast.error('Failed to delete') }
    finally { setDeletingId(null) }
  }

  const pending      = payments.filter(p => p.status === 'pending')
  const stripePaid   = payments.filter(p => p.status === 'paid' && !p.paidExternal)
  const externalPaid = payments.filter(p => p.status === 'paid' &&  p.paidExternal)
  const totalOwed       = pending.reduce((s, p)      => s + (p.amount ?? 0), 0)
  const totalStripePaid = stripePaid.reduce((s, p)   => s + (p.amount ?? 0), 0)
  const totalExtPaid    = externalPaid.reduce((s, p) => s + (p.amount ?? 0), 0)

  const byOfficial = {}
  pending.forEach(p => {
    if (!byOfficial[p.officialId]) byOfficial[p.officialId] = { name: p.officialName, records: [], total: 0 }
    byOfficial[p.officialId].records.push(p)
    byOfficial[p.officialId].total += p.amount ?? 0
  })

  return (
    <Card>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', borderBottom:'1px solid var(--color-border)' }}>
        {[
          { label:'Pending',          value: totalOwed,       color:'var(--orange)', sub: `${pending.length} game${pending.length !== 1 ? 's' : ''} · ${Object.keys(byOfficial).length} official${Object.keys(byOfficial).length !== 1 ? 's' : ''}` },
          { label:'Paid via Stripe',  value: totalStripePaid, color:'var(--green)',  sub: `${stripePaid.length} game${stripePaid.length !== 1 ? 's' : ''}` },
          { label:'Paid Externally',  value: totalExtPaid,    color:'var(--blue)',   sub: `${externalPaid.length} game${externalPaid.length !== 1 ? 's' : ''}` },
        ].map((s, i) => (
          <div key={s.label} style={{ padding:'14px 18px', borderRight: i < 2 ? '1px solid var(--color-border)' : 'none' }}>
            <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--color-muted)', marginBottom:4 }}>{s.label}</div>
            <div style={{ fontSize:22, fontWeight:800, fontFamily:'var(--font-display)', color:s.color }}>${s.value.toFixed(2)}</div>
            <div style={{ fontSize:12, color:'var(--color-muted)' }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ padding:'10px 16px', background:'var(--ice)', borderBottom:'1px solid var(--color-border)', fontSize:12.5, color:'#1a6a9e' }}>
        💳 Pay via Stripe or mark as paid externally (check, cash, Venmo, etc).
      </div>

      {pending.length === 0 ? (
        <CardBody>
          <EmptyState icon="✅" title="No pending payroll" message="Payroll records appear automatically when games complete." />
        </CardBody>
      ) : (
        <CardBody noPadding>
          {Object.entries(byOfficial).map(([uid, data]) => (
            <div key={uid} style={{ borderBottom:'1px solid var(--color-border)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--color-surface-2)' }}>
                <Avatar name={data.name} size="sm" />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700 }}>{data.name}</div>
                  <div style={{ fontSize:12, color:'var(--color-muted)' }}>
                    {data.records.length} game{data.records.length !== 1 ? 's' : ''} · <strong style={{ color:'var(--orange)' }}>${data.total.toFixed(2)} owed</strong>
                  </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                  <Button size="sm" variant="ghost"
                    style={{ fontSize:11.5, color:'var(--color-muted)' }}
                    loading={payingId === uid + '_ext'}
                    onClick={() => handleMarkPaidExternal(uid, data.name, data.records)}>
                    Mark Paid Externally
                  </Button>
                  <Button size="sm" variant="teal" loading={payingId === uid}
                    onClick={() => handlePayAll(uid, data.name, data.records)}>
                    Pay ${data.total.toFixed(2)} via Stripe
                  </Button>
                </div>
              </div>
              {data.records.map(rec => {
                const gd = rec.gameDate?.toDate?.() ?? (rec.gameDate ? new Date(rec.gameDate) : null)
                return (
                  <div key={rec.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 16px 9px 44px', borderTop:'1px solid var(--color-border)' }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{rec.homeTeam} vs {rec.awayTeam}</div>
                      <div style={{ fontSize:12, color:'var(--color-muted)' }}>
                        {gd ? format(gd, 'MMM d, yyyy · h:mm a') : '—'}
                        {rec.division ? ` · ${rec.division}` : ''}
                        {rec.role ? ` · ${rec.role}` : ''}
                      </div>
                    </div>
                    <div style={{ fontSize:15, fontWeight:700, fontFamily:'var(--font-display)', color:'var(--orange)' }}>${(rec.amount ?? 0).toFixed(2)}</div>
                    <button style={{ background:'none', border:'none', color:'var(--color-muted)', cursor:'pointer', fontSize:13, padding:'2px 6px' }}
                      onClick={() => deletePayment(rec)}>✕</button>
                  </div>
                )
              })}
            </div>
          ))}
        </CardBody>
      )}

      {(stripePaid.length > 0 || externalPaid.length > 0) && (
        <>
          <div style={{ padding:'10px 16px', background:'var(--color-surface-2)', borderTop:'1px solid var(--color-border)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--color-muted)' }}>
            Payment History
          </div>
          <CardBody noPadding>
            <table className={styles.table}>
              <thead>
                <tr><th>Official</th><th>Game</th><th>Role</th><th>Date</th><th>Amount</th><th>Method</th></tr>
              </thead>
              <tbody>
                {[...stripePaid, ...externalPaid].map(pay => {
                  const gd = pay.gameDate?.toDate?.() ?? (pay.gameDate ? new Date(pay.gameDate) : null)
                  return (
                    <tr key={pay.id}>
                      <td>{pay.officialName ?? '—'}</td>
                      <td className={styles.muted}>{pay.homeTeam} vs {pay.awayTeam}</td>
                      <td className={styles.muted}>{pay.role}</td>
                      <td className={styles.muted}>{gd ? format(gd, 'MMM d') : '—'}</td>
                      <td className={styles.amount}>${(pay.amount ?? 0).toFixed(2)}</td>
                      <td>
                        {pay.paidExternal
                          ? <Badge variant="blue">{pay.paidMethod ?? 'External'}</Badge>
                          : <Badge variant="green">Stripe</Badge>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </CardBody>
        </>
      )}
    </Card>
  )
}

// ── Expenses tab ──────────────────────────────────────────────────────────────
function ExpensesTab({ expenses, onRefresh }) {
  const [updatingId, setUpdatingId] = useState(null)

  const handleReview = async (expense, status, note = '') => {
    setUpdatingId(expense.id)
    try {
      await updateDoc(doc(db, 'expenses', expense.id), { status, reviewNote: note, reviewedAt: serverTimestamp() })
      await addDoc(collection(db, 'notifications'), {
        uid: expense.officialId, type: 'expense',
        title:   status === 'approved' ? '✅ Expense Approved' : '❌ Expense Rejected',
        message: `Your $${expense.amount?.toFixed(2)} ${expense.type} expense has been ${status}.${note ? ` Note: ${note}` : ''}`,
        read: false, link: '/official/expenses', createdAt: serverTimestamp(),
      })
      toast.success(`Expense ${status}`)
      onRefresh()
    } catch { toast.error('Failed to update') }
    finally { setUpdatingId(null) }
  }

  const pending  = expenses.filter(e => e.status === 'pending')
  const reviewed = expenses.filter(e => e.status !== 'pending')

  return (
    <Card>
      <div style={{ padding:'10px 16px', background:'var(--ice)', borderBottom:'1px solid var(--color-border)', fontSize:12.5, color:'#1a6a9e' }}>
        🧾 Officials submit expenses for your review. Approve to add to payroll, or reject with a note.
      </div>
      {expenses.length === 0 ? (
        <CardBody><EmptyState icon="🧾" title="No expenses submitted" message="Officials will submit expenses here for your review." /></CardBody>
      ) : (
        <CardBody noPadding>
          {pending.length > 0 && (
            <>
              <div style={{ padding:'10px 16px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--color-muted)', background:'var(--color-surface-2)', borderBottom:'1px solid var(--color-border)' }}>
                Pending Review ({pending.length})
              </div>
              {pending.map(exp => (
                <div key={exp.id} style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px', borderBottom:'1px solid var(--color-border)' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{exp.officialName} — {exp.type}</div>
                    <div style={{ fontSize:13, color:'var(--color-text-2)', margin:'3px 0' }}>{exp.description}</div>
                    <div style={{ fontSize:12, color:'var(--color-muted)' }}>
                      {exp.gameLabel ? `${exp.gameLabel} · ` : ''}
                      {exp.miles ? `${exp.miles} miles · ` : ''}
                      {exp.createdAt?.toDate ? format(exp.createdAt.toDate(), 'MMM d, yyyy') : ''}
                    </div>
                    {exp.receiptUrl && (
                      <a href={exp.receiptUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize:12, color:'var(--blue)', textDecoration:'none', marginTop:4, display:'inline-block' }}>
                        📎 Receipt
                      </a>
                    )}
                  </div>
                  <div style={{ fontSize:18, fontWeight:800, fontFamily:'var(--font-display)', color:'var(--orange)', flexShrink:0 }}>
                    ${(exp.amount ?? 0).toFixed(2)}
                  </div>
                  <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                    <Button size="sm" variant="teal" loading={updatingId === exp.id}
                      onClick={() => handleReview(exp, 'approved')}>✓ Approve</Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => { const note = prompt('Reason (optional):') ?? ''; handleReview(exp, 'rejected', note) }}>
                      ✗ Reject
                    </Button>
                  </div>
                </div>
              ))}
            </>
          )}
          {reviewed.length > 0 && (
            <>
              <div style={{ padding:'10px 16px', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--color-muted)', background:'var(--color-surface-2)', borderBottom:'1px solid var(--color-border)' }}>
                Reviewed
              </div>
              {reviewed.map(exp => (
                <div key={exp.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom:'1px solid var(--color-border)' }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13.5, fontWeight:600 }}>{exp.officialName} — {exp.type}</div>
                    <div style={{ fontSize:12, color:'var(--color-muted)' }}>{exp.description}</div>
                  </div>
                  <div style={{ fontSize:15, fontWeight:700, fontFamily:'var(--font-display)' }}>${(exp.amount ?? 0).toFixed(2)}</div>
                  <Badge variant={exp.status === 'approved' ? 'green' : 'red'}>{exp.status}</Badge>
                </div>
              ))}
            </>
          )}
        </CardBody>
      )}
    </Card>
  )
}

// ── Create Invoice Modal ──────────────────────────────────────────────────────
function CreateInvoiceModal({ open, onClose, groups, schedulerId, schedulerName, onSaved, prefillRfq }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    groupId: '', directorName: '', directorId: '', amount: '', dueDate: '',
    notes: '', invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  useEffect(() => {
    if (!open) return
    if (prefillRfq) {
      setForm({
        groupId:      prefillRfq.groupId ?? '',
        directorName: prefillRfq.directorName ?? '',
        directorId:   prefillRfq.directorUid ?? '',
        amount:       prefillRfq.quoteAmount?.toString() ?? '',
        dueDate:      '',
        notes:        prefillRfq.quoteBreakdown ?? '',
        invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
      })
    } else {
      setForm({ groupId: '', directorName: '', directorId: '', amount: '', dueDate: '', notes: '', invoiceNumber: `INV-${Date.now().toString().slice(-6)}` })
    }
  }, [open, prefillRfq])

  const selectedGroup = groups.find(g => g.id === form.groupId)

  const handleSave = async () => {
    if (!form.amount || !form.directorName) { toast.error('Director name and amount are required'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'invoices'), {
        schedulerId, schedulerName,
        groupId:      form.groupId || prefillRfq?.groupId || null,
        groupName:    selectedGroup?.name ?? prefillRfq?.groupName ?? '',
        directorId:   form.directorId || selectedGroup?.directorId || null,
        directorName: form.directorName,
        amount:       Number(form.amount),
        dueDate:      form.dueDate || null,
        notes:        form.notes,
        invoiceNumber: form.invoiceNumber,
        rfqId:        prefillRfq?.id ?? null,
        status:       'sent',
        createdAt:    serverTimestamp(),
      })
      const groupId = form.groupId || prefillRfq?.groupId
      if (groupId) updateDoc(doc(db, 'gameGroups', groupId), { hasUnpaidInvoice: true }).catch(() => {})
      if (form.directorId) addDoc(collection(db, 'notifications'), {
        uid: form.directorId, type: 'invoice', title: '🧾 Invoice Ready to Pay',
        message: `${schedulerName} sent you an invoice of $${Number(form.amount).toFixed(2)}`,
        read: false, link: '/director/invoices', createdAt: serverTimestamp(),
      }).catch(() => {})
      toast.success('Invoice sent to director!')
      onSaved(); onClose()
    } catch (err) {
      toast.error(`Failed to create invoice: ${err.message ?? err}`)
    } finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Invoice"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>Send Invoice</Button></>}
    >
      <Input label="Invoice Number" value={form.invoiceNumber} onChange={e => set('invoiceNumber', e.target.value)} />
      {prefillRfq ? (
        <div style={{ background:'var(--color-surface-2)', border:'1px solid var(--color-border)', borderRadius:'var(--radius)', padding:'12px 14px', marginBottom:14 }}>
          <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'.6px', color:'var(--color-muted)', marginBottom:8 }}>Event</div>
          <div style={{ fontSize:14, fontWeight:600 }}>{prefillRfq.groupName}</div>
          <div style={{ fontSize:13, color:'var(--color-muted)', marginTop:2 }}>Director: {prefillRfq.directorName}</div>
        </div>
      ) : (
        <Select label="Game Group (optional)" value={form.groupId} onChange={e => {
          const g = groups.find(x => x.id === e.target.value)
          set('groupId', e.target.value)
          if (g?.directorName) set('directorName', g.directorName)
        }}>
          <option value="">Select a group…</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
      )}
      <Input label="Director Name *" value={form.directorName} onChange={e => set('directorName', e.target.value)} placeholder="Lisa Ortega" />
      <FormRow>
        <Input label="Amount ($) *" type="number" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
        <Input label="Due Date" type="date" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
      </FormRow>
      <Textarea label="Notes" rows={3} placeholder="Services rendered, breakdown of fees…" value={form.notes} onChange={e => set('notes', e.target.value)} />
    </Modal>
  )
}

// ── Pay Official Modal ────────────────────────────────────────────────────────
function PayOfficialModal({ open, onClose, roster, schedulerId, onSaved }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ officialId: '', amount: '', description: '', gameCount: '' })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const selectedOfficial = roster.find(o => (o.uid ?? o.id) === form.officialId)

  const handleSave = async () => {
    if (!form.officialId || !form.amount) { toast.error('Official and amount are required'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'payments'), {
        schedulerId,
        officialId:   form.officialId,
        officialName: selectedOfficial?.displayName ?? '',
        amount:       Number(form.amount),
        description:  form.description,
        gameCount:    form.gameCount ? Number(form.gameCount) : null,
        status:       'pending',
        createdAt:    serverTimestamp(),
      })
      toast.success(`Payment recorded for ${selectedOfficial?.displayName}`)
      onSaved(); onClose()
    } catch { toast.error('Failed to record payment') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Pay Official"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>Record Payment</Button></>}
    >
      <Select label="Official *" value={form.officialId} onChange={e => set('officialId', e.target.value)}>
        <option value="">Select official…</option>
        {roster.map(o => <option key={o.uid ?? o.id} value={o.uid ?? o.id}>{o.displayName}</option>)}
      </Select>
      <FormRow>
        <Input label="Amount ($) *" type="number" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} />
        <Input label="# of Games" type="number" placeholder="0" value={form.gameCount} onChange={e => set('gameCount', e.target.value)} />
      </FormRow>
      <Textarea label="Description" rows={2} placeholder="Games refereed May 1–15…" value={form.description} onChange={e => set('description', e.target.value)} />
    </Modal>
  )
}
