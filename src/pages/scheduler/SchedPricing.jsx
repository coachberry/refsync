import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Select } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import toast from 'react-hot-toast'
import styles from './SchedPricing.module.css'

/**
 * Pricing Sheet — scheduler-only, never visible to officials or directors.
 * Stored at: users/{uid}/pricingSheet/data
 * Structure:
 * {
 *   defaultPay: 25,           // flat rate fallback
 *   roles: ['Scorekeeper'] | ['Referee', 'Linesman'],
 *   rules: [
 *     { division: '12U', agGroup: 'Mites', role: 'Scorekeeper', pay: 20 },
 *     ...
 *   ]
 * }
 */

const COMMON_DIVISIONS = [
  '8U','10U','12U','14U','16U','18U','Adult','Open',
  'Bantam','Peewee','Squirt','Mite','Midget','Junior','Senior',
]

export default function SchedPricing() {
  const { user } = useAuth()
  const [sheet, setSheet]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm]       = useState({ division: '', role: 'Scorekeeper', pay: '' })
  const [editingDefault, setEditingDefault] = useState(false)
  const [defaultDraft, setDefaultDraft]     = useState('')

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid, 'pricingSheet', 'data'))
      .then(snap => {
        setSheet(snap.exists() ? snap.data() : { defaultPay: 0, rules: [] })
        setLoading(false)
      })
      .catch(() => { setSheet({ defaultPay: 0, rules: [] }); setLoading(false) })
  }, [user])

  const save = async (updated) => {
    setSaving(true)
    try {
      await setDoc(doc(db, 'users', user.uid, 'pricingSheet', 'data'), {
        ...updated, updatedAt: serverTimestamp(),
      })
      setSheet(updated)
      toast.success('Pricing sheet saved')
    } catch { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const handleSaveDefault = async () => {
    const val = Number(defaultDraft)
    if (isNaN(val) || val < 0) { toast.error('Enter a valid amount'); return }
    await save({ ...sheet, defaultPay: val })
    setEditingDefault(false)
  }

  const handleAddRule = async () => {
    if (!form.division.trim()) { toast.error('Enter a division'); return }
    if (!form.pay || isNaN(Number(form.pay))) { toast.error('Enter a valid pay amount'); return }
    const newRule = { division: form.division.trim(), role: form.role, pay: Number(form.pay) }
    // Replace if same division+role exists
    const rules = (sheet?.rules ?? []).filter(r => !(r.division === newRule.division && r.role === newRule.role))
    await save({ ...sheet, rules: [...rules, newRule].sort((a,b) => a.division.localeCompare(b.division)) })
    setForm({ division: '', role: 'Scorekeeper', pay: '' })
    setShowAdd(false)
  }

  const handleRemoveRule = async (i) => {
    const rules = (sheet?.rules ?? []).filter((_, idx) => idx !== i)
    await save({ ...sheet, rules })
  }

  // Lookup pay for a division+role — used by assign page
  const lookupPay = (division, role) => {
    const rule = (sheet?.rules ?? []).find(r =>
      r.division?.toLowerCase() === division?.toLowerCase() && r.role === role
    )
    return rule?.pay ?? sheet?.defaultPay ?? 0
  }

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Pay Rates</h1>
          <p className={styles.sub}>Set official pay rates per division and role. Only visible to you.</p>
        </div>
        <Button variant="primary" onClick={() => setShowAdd(true)}>+ Add Rule</Button>
      </div>

      {/* Default / flat rate */}
      <Card>
        <CardHeader>
          <CardTitle>Default Pay Rate</CardTitle>
          <Badge variant="gray">Fallback</Badge>
        </CardHeader>
        <CardBody>
          <p className={styles.defaultDesc}>
            Used when no specific rule matches a game's division. Set this as your flat rate across the board.
          </p>
          {editingDefault ? (
            <div className={styles.defaultEdit}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 20, fontWeight: 700 }}>$</span>
                <input
                  type="number" step="0.01" min="0"
                  className={styles.defaultInput}
                  value={defaultDraft}
                  onChange={e => setDefaultDraft(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveDefault()}
                  placeholder="0.00"
                />
                <span style={{ fontSize: 14, color: 'var(--color-muted)' }}>per game</span>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <Button variant="primary" size="sm" loading={saving} onClick={handleSaveDefault}>Save</Button>
                <Button variant="ghost"   size="sm" onClick={() => setEditingDefault(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <div className={styles.defaultDisplay}>
              <span className={styles.defaultAmount}>${(sheet?.defaultPay ?? 0).toFixed(2)}</span>
              <span className={styles.defaultPer}>per game</span>
              <Button variant="ghost" size="sm" onClick={() => { setDefaultDraft(String(sheet?.defaultPay ?? 0)); setEditingDefault(true) }}>
                Edit
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Division rules table */}
      <Card>
        <CardHeader>
          <CardTitle>Division / Age Group Rates</CardTitle>
          <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {(sheet?.rules ?? []).length} rule{(sheet?.rules ?? []).length !== 1 ? 's' : ''}
          </span>
        </CardHeader>
        <CardBody noPadding>
          {(sheet?.rules ?? []).length === 0 ? (
            <div style={{ padding: 24 }}>
              <EmptyState icon="💰" title="No rules yet"
                message="Add rules to automatically set pay based on division. Falls back to the default rate if no rule matches." />
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Division / Age Group</th>
                  <th>Role</th>
                  <th>Pay per Game</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(sheet?.rules ?? []).map((rule, i) => (
                  <tr key={i}>
                    <td className={styles.tdDiv}>{rule.division}</td>
                    <td>{rule.role}</td>
                    <td className={styles.tdPay}>${rule.pay.toFixed(2)}</td>
                    <td>
                      <button className={styles.removeBtn} onClick={() => handleRemoveRule(i)}>✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      {/* Add rule modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Pricing Rule" size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={handleAddRule}>Add Rule</Button>
          </>
        }
      >
        <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 16, lineHeight: 1.5 }}>
          Set a specific pay rate for a division and role. This overrides the default rate when a game matches.
        </p>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Division / Age Group</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              list="divisions" className={styles.formInput}
              placeholder="e.g. 14U, Bantam, Adult..."
              value={form.division}
              onChange={e => setForm(f => ({ ...f, division: e.target.value }))}
            />
            <datalist id="divisions">
              {COMMON_DIVISIONS.map(d => <option key={d} value={d} />)}
            </datalist>
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Role</label>
          <select className={styles.formInput} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
            <option>Scorekeeper</option>
            <option>Referee</option>
            <option>Linesman</option>
          </select>
        </div>

        <div style={{ marginBottom: 4 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Pay per Game ($)</label>
          <input
            type="number" step="0.01" min="0" placeholder="25.00"
            className={styles.formInput}
            value={form.pay}
            onChange={e => setForm(f => ({ ...f, pay: e.target.value }))}
          />
        </div>
      </Modal>
    </div>
  )
}

// Export lookup function for use in assign page
export { }
