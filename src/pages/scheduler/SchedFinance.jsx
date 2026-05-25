import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGameGroups } from '@/hooks/useGameGroups'
import { useRoster } from '@/hooks/useRoster'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Textarea, Select, FormRow } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { Avatar } from '@/components/ui/Avatar'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './SchedFinance.module.css'

const STATUS_COLORS = {
  draft:   'gray', sent: 'blue', paid: 'green',
  partial: 'amber', overdue: 'red', pending: 'amber',
}

export default function SchedFinance() {
  const { user, profile } = useAuth()
  const { groups } = useGameGroups()
  const { roster } = useRoster()
  const [tab, setTab]             = useState('overview')
  const [invoices, setInvoices]   = useState([])
  const [payments, setPayments]   = useState([])
  const [acceptedRfqs, setAcceptedRfqs] = useState([])
  const [loading, setLoading]     = useState(true)
  const [showInvoice, setShowInvoice] = useState(false)
  const [showPayment, setShowPayment] = useState(false)
  const [prefillRfq, setPrefillRfq]   = useState(null)

  useEffect(() => {
    if (!user) return
    fetchFinance()
    // Load accepted RFQs that don't yet have an invoice
    getDocs(query(collection(db, 'rfqs'),
      where('schedulerUid', '==', user.uid),
      where('status', '==', 'accepted')
    )).then(snap => {
      setAcceptedRfqs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }).catch(() => {})
  }, [user])

  const fetchFinance = async () => {
    setLoading(true)
    try {
      const [invSnap, paySnap] = await Promise.all([
        getDocs(query(collection(db, 'invoices'), where('schedulerId', '==', user.uid))),
        getDocs(query(collection(db, 'payments'), where('schedulerId', '==', user.uid))),
      ])
      setInvoices(invSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch { toast.error('Failed to load finance data') }
    finally { setLoading(false) }
  }

  // Summary stats
  const totalAR       = invoices.reduce((s, i) => s + (i.status !== 'paid' ? (i.amount ?? 0) : 0), 0)
  const totalReceived = invoices.reduce((s, i) => s + (i.status === 'paid' ? (i.amount ?? 0) : 0), 0)
  const totalPaidOut  = payments.reduce((s, p) => s + (p.amount ?? 0), 0)
  const totalOwed     = payments.filter(p => p.status === 'pending').reduce((s, p) => s + (p.amount ?? 0), 0)

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'invoices', label: `Invoices (${invoices.length})` },
    { id: 'payroll',  label: `Payroll (${payments.length})` },
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

      {/* Accepted quotes — prompt scheduler to invoice */}
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
              {rfq.directorName} accepted your quote of <strong>${rfq.quoteAmount?.toFixed(2)}</strong>. Send them an invoice to receive payment.
            </div>
          </div>
          <Button variant="teal" onClick={() => { setPrefillRfq(rfq); setShowInvoice(true) }}>
            📄 Create Invoice
          </Button>
        </div>
      ))}

      {/* Summary stats */}
      <div className={styles.statsGrid}>
        <StatCard icon="📥" label="Outstanding AR"     value={`$${totalAR.toLocaleString()}`}       color="var(--blue)"  />
        <StatCard icon="✅" label="Received (All Time)" value={`$${totalReceived.toLocaleString()}`} color="var(--teal)"  />
        <StatCard icon="📤" label="Paid to Officials"   value={`$${totalPaidOut.toLocaleString()}`}  color="var(--teal)"  />
        <StatCard icon="⏳" label="Owed to Officials"   value={`$${totalOwed.toLocaleString()}`}     color="var(--amber)" />
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
          {tab === 'overview' && <OverviewTab invoices={invoices} payments={payments} roster={roster} />}
          {tab === 'invoices' && <InvoicesTab invoices={invoices} onRefresh={fetchFinance} schedulerId={user?.uid} />}
          {tab === 'payroll'  && <PayrollTab  payments={payments} roster={roster} onRefresh={fetchFinance} />}
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
  const recentInvoices = [...invoices].sort((a,b) => (b.createdAt?.seconds??0)-(a.createdAt?.seconds??0)).slice(0,5)
  const pendingPayments = payments.filter(p => p.status === 'pending').slice(0,5)

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
                <div className={styles.listSub}>{inv.groupName ?? '—'} · {inv.invoiceNumber ?? ''}</div>
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
            <EmptyState icon="✅" title="All officials paid" />
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
function InvoicesTab({ invoices, onRefresh, schedulerId }) {
  const [updatingId, setUpdatingId] = useState(null)

  const markPaid = async (invoice) => {
    setUpdatingId(invoice.id)
    try {
      await updateDoc(doc(db, 'invoices', invoice.id), { status: 'paid', paidAt: serverTimestamp() })
      toast.success('Invoice marked as paid')
      onRefresh()
    } catch { toast.error('Failed to update invoice') }
    finally { setUpdatingId(null) }
  }

  if (invoices.length === 0) return (
    <Card><CardBody><EmptyState icon="📄" title="No invoices yet" message="Create an invoice to bill a game director for your scheduling services." /></CardBody></Card>
  )

  return (
    <Card>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Invoice #</th><th>Director</th><th>Group</th>
              <th>Amount</th><th>Due Date</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id}>
                <td className={styles.invoiceNum}>{inv.invoiceNumber ?? `#${inv.id.slice(0,6).toUpperCase()}`}</td>
                <td>{inv.directorName ?? '—'}</td>
                <td className={styles.muted}>{inv.groupName ?? '—'}</td>
                <td className={styles.amount}>${(inv.amount ?? 0).toLocaleString()}</td>
                <td className={styles.muted}>{inv.dueDate ? format(new Date(inv.dueDate), 'MMM d, yyyy') : '—'}</td>
                <td><Badge variant={STATUS_COLORS[inv.status] ?? 'gray'}>{inv.status}</Badge></td>
                <td>
                  <div className={styles.rowActions}>
                    {inv.status !== 'paid' && (
                      <Button size="sm" variant="teal" loading={updatingId === inv.id} onClick={() => markPaid(inv)}>
                        Mark Paid
                      </Button>
                    )}
                    <Button size="sm" variant="ghost">View</Button>
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

// ── Payroll tab ───────────────────────────────────────────────────────────────
function PayrollTab({ payments, roster, onRefresh }) {
  const [updatingId, setUpdatingId] = useState(null)

  const markPaid = async (payment) => {
    setUpdatingId(payment.id)
    try {
      await updateDoc(doc(db, 'payments', payment.id), { status: 'paid', paidAt: serverTimestamp() })
      toast.success(`Payment to ${payment.officialName} marked as paid`)
      onRefresh()
    } catch { toast.error('Failed to update payment') }
    finally { setUpdatingId(null) }
  }

  if (payments.length === 0) return (
    <Card><CardBody><EmptyState icon="💰" title="No payroll records yet" message="Use '+ Pay Official' to record payments to officials on your roster." /></CardBody></Card>
  )

  return (
    <Card>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Official</th><th>Description</th><th>Games</th>
              <th>Amount</th><th>Date</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
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
                  <div className={styles.rowActions}>
                    {pay.status === 'pending' && (
                      <Button size="sm" variant="teal" loading={updatingId === pay.id} onClick={() => markPaid(pay)}>
                        Mark Paid
                      </Button>
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

// ── Create Invoice Modal ──────────────────────────────────────────────────────
function CreateInvoiceModal({ open, onClose, groups, schedulerId, schedulerName, onSaved, prefillRfq }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    groupId: '', directorName: '', directorId: '', amount: '', dueDate: '',
    notes: '', invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Pre-fill from accepted RFQ
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
      const invoiceRef = await addDoc(collection(db, 'invoices'), {
        schedulerId,
        schedulerName,
        groupId:      form.groupId || null,
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
      // Mark group as having an unpaid invoice
      const groupId = form.groupId || prefillRfq?.groupId
      if (groupId) {
        await updateDoc(doc(db, 'gameGroups', groupId), { hasUnpaidInvoice: true })
      }
      // Notify the director that the invoice is ready
      if (form.directorId) {
        await addDoc(collection(db, 'notifications'), {
          uid:       form.directorId,
          type:      'invoice',
          title:     '🧾 Invoice Ready to Pay',
          message:   `${schedulerName} sent you an invoice of $${Number(form.amount).toFixed(2)} for "${selectedGroup?.name ?? prefillRfq?.groupName ?? 'your event'}"`,
          read:      false,
          link:      '/director/invoices',
          createdAt: serverTimestamp(),
        })
      }
      toast.success('Invoice sent to director!')
      onSaved()
      onClose()
    } catch (err) { console.error(err); toast.error('Failed to create invoice') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Invoice"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>Send Invoice</Button></>}
    >
      <Input label="Invoice Number" value={form.invoiceNumber} onChange={e => set('invoiceNumber', e.target.value)} />
      <Select label="Game Group (optional)" value={form.groupId} onChange={e => {
        const g = groups.find(x => x.id === e.target.value)
        set('groupId', e.target.value)
        if (g?.directorName) set('directorName', g.directorName)
      }}>
        <option value="">Select a group…</option>
        {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
      </Select>
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
  const [form, setForm] = useState({ officialId: '', amount: '', description: '', gameCount: '', groupId: '' })
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
      onSaved()
      onClose()
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
