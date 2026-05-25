import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import {
  collection, query, where, onSnapshot,
  addDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Select, Textarea, FormRow } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './OfficialExpenses.module.css'

const EXPENSE_TYPES = [
  { value: 'mileage',  label: '🚗 Mileage',        unit: 'miles' },
  { value: 'food',     label: '🍔 Food & Meals',    unit: '$' },
  { value: 'lodging',  label: '🏨 Lodging',         unit: '$' },
  { value: 'gear',     label: '🏒 Equipment/Gear',  unit: '$' },
  { value: 'other',    label: '📦 Other',            unit: '$' },
]

const MILEAGE_RATE = 0.67 // IRS 2024 rate per mile

export default function OfficialExpenses() {
  const { user } = useAuth()
  const [expenses, setExpenses]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [showAdd, setShowAdd]     = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [filter, setFilter]       = useState('all')
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString())

  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'expenses'), where('uid', '==', user.uid))
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      setExpenses(data)
      setLoading(false)
    })
    return unsub
  }, [user])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return
    setDeletingId(id)
    try {
      await deleteDoc(doc(db, 'expenses', id))
      toast.success('Expense deleted')
    } catch { toast.error('Failed to delete') }
    finally { setDeletingId(null) }
  }

  const filtered = expenses.filter(e => {
    const matchType = filter === 'all' || e.type === filter
    const matchYear = !yearFilter || (e.date ?? '').startsWith(yearFilter)
    return matchType && matchYear
  })

  // Totals
  const totalMileage  = filtered.filter(e => e.type === 'mileage').reduce((s, e) => s + (Number(e.miles) || 0), 0)
  const mileageValue  = totalMileage * MILEAGE_RATE
  const totalOther    = filtered.filter(e => e.type !== 'mileage').reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const totalDeduction = mileageValue + totalOther

  const years = [...new Set(expenses.map(e => (e.date ?? '').slice(0, 4)))].filter(Boolean).sort().reverse()

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Expenses & Mileage</h1>
          <p className={styles.sub}>Track deductible expenses for tax season</p>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>+ Add Expense</Button>
      </div>

      {/* Summary cards */}
      <div className={styles.summaryGrid}>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>🚗</div>
          <div className={styles.summaryVal}>{totalMileage.toLocaleString()} mi</div>
          <div className={styles.summaryLabel}>Total Miles</div>
          <div className={styles.summaryNote}>${mileageValue.toFixed(2)} deduction @ $0.67/mi</div>
        </div>
        <div className={styles.summaryCard}>
          <div className={styles.summaryIcon}>💸</div>
          <div className={styles.summaryVal}>${totalOther.toFixed(2)}</div>
          <div className={styles.summaryLabel}>Other Expenses</div>
          <div className={styles.summaryNote}>Food, gear, lodging, other</div>
        </div>
        <div className={styles.summaryCard} style={{ borderColor: 'var(--teal)', background: 'rgba(0,184,153,.04)' }}>
          <div className={styles.summaryIcon}>🧾</div>
          <div className={styles.summaryVal} style={{ color: 'var(--teal)' }}>${totalDeduction.toFixed(2)}</div>
          <div className={styles.summaryLabel}>Total Deductions</div>
          <div className={styles.summaryNote}>Estimated tax deductible amount</div>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <button className={[styles.filterBtn, filter === 'all' ? styles.filterActive : ''].join(' ')} onClick={() => setFilter('all')}>All</button>
          {EXPENSE_TYPES.map(t => (
            <button key={t.value} className={[styles.filterBtn, filter === t.value ? styles.filterActive : ''].join(' ')} onClick={() => setFilter(t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <select className={styles.yearSelect} value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
          <option value="">All years</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
          {!years.includes(new Date().getFullYear().toString()) && (
            <option value={new Date().getFullYear().toString()}>{new Date().getFullYear()}</option>
          )}
        </select>
      </div>

      {loading ? (
        <div className={styles.center}><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon="🧾"
              title="No expenses yet"
              message="Track your mileage and expenses to maximize your tax deductions at year end."
              action={{ label: '+ Add Expense', onClick: () => setShowAdd(true) }}
            />
          </CardBody>
        </Card>
      ) : (
        <Card>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th><th>Type</th><th>Description</th>
                  <th>Amount/Miles</th><th>Deduction</th><th>Game</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(exp => {
                  const typeMeta = EXPENSE_TYPES.find(t => t.value === exp.type)
                  const isMileage = exp.type === 'mileage'
                  const deduction = isMileage
                    ? (Number(exp.miles) * MILEAGE_RATE).toFixed(2)
                    : Number(exp.amount).toFixed(2)
                  return (
                    <tr key={exp.id}>
                      <td className={styles.date}>{exp.date ? format(new Date(exp.date), 'MMM d, yyyy') : '—'}</td>
                      <td><span className={styles.typeTag}>{typeMeta?.label ?? exp.type}</span></td>
                      <td>{exp.description || '—'}</td>
                      <td className={styles.amount}>
                        {isMileage ? `${exp.miles} mi` : `$${Number(exp.amount).toFixed(2)}`}
                      </td>
                      <td className={styles.deduction}>${deduction}</td>
                      <td className={styles.muted}>{exp.gameName ?? '—'}</td>
                      <td>
                        <button
                          className={styles.deleteBtn}
                          onClick={() => handleDelete(exp.id)}
                          disabled={deletingId === exp.id}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan="4" className={styles.totalLabel}>Total Deductions ({filtered.length} entries)</td>
                  <td className={styles.totalAmount}>${totalDeduction.toFixed(2)}</td>
                  <td colSpan="2"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      <AddExpenseModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        userId={user?.uid}
      />
    </div>
  )
}

// ── Add Expense Modal ─────────────────────────────────────────────────────────
function AddExpenseModal({ open, onClose, userId }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    type: 'mileage', date: format(new Date(), 'yyyy-MM-dd'),
    miles: '', amount: '', description: '', gameName: '',
    startLocation: '', endLocation: '',
  })

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const isMileage = form.type === 'mileage'

  const handleSave = async () => {
    if (!form.date) { toast.error('Date is required'); return }
    if (isMileage && !form.miles) { toast.error('Miles are required'); return }
    if (!isMileage && !form.amount) { toast.error('Amount is required'); return }
    setSaving(true)
    try {
      await addDoc(collection(db, 'expenses'), {
        uid: userId, ...form,
        miles:  isMileage ? Number(form.miles) : null,
        amount: !isMileage ? Number(form.amount) : null,
        deduction: isMileage
          ? (Number(form.miles) * MILEAGE_RATE)
          : Number(form.amount),
        createdAt: serverTimestamp(),
      })
      toast.success('Expense added!')
      setForm({ type: 'mileage', date: format(new Date(), 'yyyy-MM-dd'), miles: '', amount: '', description: '', gameName: '', startLocation: '', endLocation: '' })
      onClose()
    } catch { toast.error('Failed to add expense') }
    finally { setSaving(false) }
  }

  const estDeduction = isMileage
    ? `$${(Number(form.miles || 0) * MILEAGE_RATE).toFixed(2)} deduction`
    : form.amount ? `$${Number(form.amount).toFixed(2)} deduction` : ''

  return (
    <Modal open={open} onClose={onClose} title="Add Expense" size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>Save Expense</Button></>}
    >
      <Select label="Expense Type" value={form.type} onChange={e => set('type', e.target.value)}>
        {EXPENSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </Select>

      <FormRow>
        <Input label="Date *" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        {isMileage
          ? <Input label="Miles *" type="number" step="0.1" placeholder="e.g. 24.5" value={form.miles} onChange={e => set('miles', e.target.value)} hint={estDeduction} />
          : <Input label="Amount ($) *" type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} hint={estDeduction} />
        }
      </FormRow>

      {isMileage && (
        <FormRow>
          <Input label="From" placeholder="Starting address" value={form.startLocation} onChange={e => set('startLocation', e.target.value)} />
          <Input label="To"   placeholder="Destination" value={form.endLocation} onChange={e => set('endLocation', e.target.value)} />
        </FormRow>
      )}

      <Input label="Game / Event" placeholder="e.g. Preds vs Coyotes" value={form.gameName} onChange={e => set('gameName', e.target.value)} />
      <Input label="Description" placeholder="Optional notes" value={form.description} onChange={e => set('description', e.target.value)} />

      {estDeduction && (
        <div style={{ background: 'rgba(0,184,153,.08)', border: '1px solid rgba(0,184,153,.2)', borderRadius: 'var(--radius)', padding: '10px 14px', fontSize: 13, color: '#007a65', fontWeight: 600 }}>
          ✅ Estimated deduction: {estDeduction}
          {isMileage && ` (IRS rate: $0.67/mile)`}
        </div>
      )}
    </Modal>
  )
}
