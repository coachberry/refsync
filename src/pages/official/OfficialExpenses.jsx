import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, updateDoc, doc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import styles from './OfficialExpenses.module.css'

const EXPENSE_TYPES = [
  'Mileage', 'Hotel/Lodging', 'Meals', 'Equipment', 'Uniform',
  'Parking', 'Tolls', 'Airfare', 'Rental Car', 'Other',
]

const STATUS_COLORS = {
  pending:  'amber',
  approved: 'green',
  rejected: 'red',
  paid:     'green',
}

export default function OfficialExpenses() {
  const { user, profile } = useAuth()
  const [expenses, setExpenses]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showForm, setShowForm]   = useState(false)
  const [totalPending, setTotalPending] = useState(0)
  const [totalApproved, setTotalApproved] = useState(0)

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'expenses'), where('officialId', '==', user.uid))
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toDate?.() ?? 0) - (a.createdAt?.toDate?.() ?? 0))
      setExpenses(data)
      setTotalPending(data.filter(e => e.status === 'pending').reduce((s, e) => s + (e.amount ?? 0), 0))
      setTotalApproved(data.filter(e => e.status === 'approved').reduce((s, e) => s + (e.amount ?? 0), 0))
      setLoading(false)
    })
    return unsub
  }, [user?.uid])

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Expenses</h1>
          <p className={styles.sub}>Submit expenses to your scheduler for reimbursement.</p>
        </div>
        <Button variant="primary" onClick={() => setShowForm(true)}>+ Submit Expense</Button>
      </div>

      {/* Summary */}
      <div className={styles.summaryRow}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryAmount} style={{ color:'var(--orange)' }}>${totalPending.toFixed(2)}</div>
          <div className={styles.summaryLabel}>Pending Review</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryAmount} style={{ color:'var(--green)' }}>${totalApproved.toFixed(2)}</div>
          <div className={styles.summaryLabel}>Approved for Payment</div>
        </div>
      </div>

      {/* Expense list */}
      <Card>
        <CardHeader><CardTitle>My Expenses</CardTitle></CardHeader>
        <CardBody noPadding>
          {expenses.length === 0 ? (
            <div style={{ padding:24 }}>
              <EmptyState icon="🧾" title="No expenses submitted yet"
                message="Submit expenses like mileage, lodging, or meals to your scheduler for reimbursement." />
            </div>
          ) : (
            expenses.map(exp => {
              const dt = exp.createdAt?.toDate?.() ?? (exp.createdAt ? new Date(exp.createdAt) : null)
              return (
                <div key={exp.id} className={styles.expenseRow}>
                  <div className={styles.expenseInfo}>
                    <div className={styles.expenseType}>{exp.type}</div>
                    <div className={styles.expenseDesc}>{exp.description}</div>
                    <div className={styles.expenseMeta}>
                      {dt ? format(dt, 'MMM d, yyyy') : '—'}
                      {exp.gameLabel ? ` · ${exp.gameLabel}` : ''}
                      {exp.schedulerName ? ` · Submitted to ${exp.schedulerName}` : ''}
                    </div>
                    {exp.receiptUrl && (
                      <a href={exp.receiptUrl} target="_blank" rel="noreferrer" className={styles.receiptLink}>📎 View Receipt</a>
                    )}
                    {exp.reviewNote && (
                      <div className={styles.reviewNote}>{exp.status === 'rejected' ? '❌' : '✅'} {exp.reviewNote}</div>
                    )}
                  </div>
                  <div className={styles.expenseRight}>
                    <div className={styles.expenseAmount}>${(exp.amount ?? 0).toFixed(2)}</div>
                    <Badge variant={STATUS_COLORS[exp.status] ?? 'gray'}>{exp.status}</Badge>
                  </div>
                </div>
              )
            })
          )}
        </CardBody>
      </Card>

      {showForm && (
        <ExpenseFormModal
          open={showForm}
          onClose={() => setShowForm(false)}
          user={user}
          profile={profile}
        />
      )}
    </div>
  )
}

function ExpenseFormModal({ open, onClose, user, profile }) {
  const [saving, setSaving]   = useState(false)
  const [uploading, setUploading] = useState(false)
  const [receiptUrl, setReceiptUrl] = useState('')
  const [schedulers, setSchedulers] = useState([])
  const [form, setForm] = useState({
    type: 'Mileage', description: '', amount: '',
    schedulerId: '', schedulerName: '',
    gameLabel: '', miles: '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Load connected schedulers
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'connections'),
      where('toUid', '==', user.uid),
      where('type', '==', 'scheduler-official'),
      where('status', '==', 'accepted')
    )
    onSnapshot(q, async snap => {
      const scheds = await Promise.all(snap.docs.map(async d => {
        const { getDoc, doc: fdoc } = await import('firebase/firestore')
        const s = await getDoc(fdoc(db, 'users', d.data().fromUid))
        return s.exists() ? { uid: d.data().fromUid, ...s.data() } : null
      }))
      setSchedulers(scheds.filter(Boolean))
    })
  }, [user?.uid])

  // Auto-calculate mileage amount
  useEffect(() => {
    if (form.type === 'Mileage' && form.miles) {
      const IRS_RATE = 0.67
      set('amount', (Number(form.miles) * IRS_RATE).toFixed(2))
    }
  }, [form.miles, form.type])

  const handleReceipt = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const storageRef = ref(storage, `receipts/${user.uid}/${Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      setReceiptUrl(url)
      toast.success('Receipt uploaded')
    } catch { toast.error('Failed to upload receipt') }
    finally { setUploading(false) }
  }

  const handleSubmit = async () => {
    if (!form.type)          { toast.error('Select expense type'); return }
    if (!form.amount || isNaN(Number(form.amount))) { toast.error('Enter a valid amount'); return }
    if (!form.schedulerId)   { toast.error('Select a scheduler to submit to'); return }
    if (!form.description.trim()) { toast.error('Add a description'); return }
    setSaving(true)
    try {
      const sched = schedulers.find(s => s.uid === form.schedulerId)
      await addDoc(collection(db, 'expenses'), {
        officialId:    user.uid,
        officialName:  profile?.displayName,
        schedulerId:   form.schedulerId,
        schedulerName: sched?.displayName ?? '',
        type:          form.type,
        description:   form.description,
        amount:        Number(form.amount),
        miles:         form.miles ? Number(form.miles) : null,
        gameLabel:     form.gameLabel,
        receiptUrl:    receiptUrl || null,
        status:        'pending',
        createdAt:     serverTimestamp(),
      })
      // Notify scheduler
      await addDoc(collection(db, 'notifications'), {
        uid:     form.schedulerId,
        type:    'expense',
        title:   '🧾 Expense Submitted',
        message: `${profile?.displayName} submitted a $${Number(form.amount).toFixed(2)} ${form.type} expense for review`,
        read:    false,
        link:    '/scheduler/finance',
        createdAt: serverTimestamp(),
      })
      toast.success('Expense submitted!')
      onClose()
    } catch (err) { toast.error('Failed to submit: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Submit Expense" size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSubmit}>Submit</Button>
        </>
      }
    >
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div>
          <label className={styles.label}>Expense Type</label>
          <select className={styles.input} value={form.type} onChange={e => set('type', e.target.value)}>
            {EXPENSE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>

        {form.type === 'Mileage' && (
          <div>
            <label className={styles.label}>Miles Driven</label>
            <input type="number" step="0.1" min="0" className={styles.input}
              placeholder="e.g. 72.5"
              value={form.miles} onChange={e => set('miles', e.target.value)} />
            <div style={{ fontSize:11.5, color:'var(--color-muted)', marginTop:4 }}>
              Reimbursed at IRS rate ($0.67/mile) for trips 50+ miles from home. Amount auto-calculated.
            </div>
          </div>
        )}

        <div>
          <label className={styles.label}>Amount ($)</label>
          <input type="number" step="0.01" min="0" className={styles.input}
            placeholder="25.00"
            value={form.amount} onChange={e => set('amount', e.target.value)} />
        </div>

        <div>
          <label className={styles.label}>Description</label>
          <input className={styles.input} placeholder="Brief description of the expense"
            value={form.description} onChange={e => set('description', e.target.value)} />
        </div>

        <div>
          <label className={styles.label}>Related Game (optional)</label>
          <input className={styles.input} placeholder="e.g. Nashville vs Chicago, Jun 14"
            value={form.gameLabel} onChange={e => set('gameLabel', e.target.value)} />
        </div>

        <div>
          <label className={styles.label}>Submit To (Scheduler)</label>
          <select className={styles.input} value={form.schedulerId} onChange={e => set('schedulerId', e.target.value)}>
            <option value="">Select scheduler…</option>
            {schedulers.map(s => <option key={s.uid} value={s.uid}>{s.displayName}</option>)}
          </select>
        </div>

        <div>
          <label className={styles.label}>Receipt (optional)</label>
          <input type="file" accept="image/*,.pdf" onChange={handleReceipt}
            style={{ fontSize:13, color:'var(--color-muted)' }} />
          {uploading && <div style={{ fontSize:12, color:'var(--color-muted)', marginTop:4 }}>Uploading…</div>}
          {receiptUrl && <div style={{ fontSize:12, color:'var(--green)', marginTop:4 }}>✓ Receipt uploaded</div>}
        </div>
      </div>
    </Modal>
  )
}
