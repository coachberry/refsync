import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGameGroups } from '@/hooks/useGameGroups'
import { useConnections } from '@/hooks/useConnections'
import { doc, deleteDoc, collection, query, where, onSnapshot, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { createGameGroup, createGame, updateGameGroup, sendRFQ, sendRFQByEmail, updateRFQ, subscribeRFQsForGroup } from '@/services/firestore'
import { Avatar } from '@/components/ui/Avatar'
import { Card, CardBody, Badge, statusBadge, EmptyState, Modal } from '@/components/ui'
import { Input, Select, Textarea, FormRow } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import styles from './DirEvents.module.css'

// ── Constants ─────────────────────────────────────────────────────────────────
const DURATION_OPTIONS = [
  { value: 1,    label: '1 hour' },
  { value: 1.25, label: '1 hr 15 min' },
  { value: 1.5,  label: '1 hr 30 min' },
  { value: 1.75, label: '1 hr 45 min' },
  { value: 2,    label: '2 hours' },
  { value: 0,    label: 'Custom…' },
]

const OFFICIALS_NEEDED_OPTIONS = [
  { value: 'both',        label: '🏒📋 Referees & Scorekeepers', desc: 'Need both referees and scorekeepers for your games' },
  { value: 'referees',    label: '🏒 Referees Only',             desc: 'Only need referees — no scorekeepers' },
  { value: 'scorekeepers',label: '📋 Scorekeepers Only',         desc: 'Only need scorekeepers — no referees' },
]

// Default crew configs per officials needed type
const DEFAULT_CREW = {
  both:         { refs: 2, linesmen: 2, scorekeepers: 1 },
  referees:     { refs: 2, linesmen: 2, scorekeepers: 0 },
  scorekeepers: { refs: 0, linesmen: 0, scorekeepers: 1 },
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DirEvents() {
  const { user, profile } = useAuth()
  const { groups, loading } = useGameGroups()
  const { accepted: connectedSchedulers } = useConnections()
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showAddGames, setShowAddGames]       = useState(false)
  const [showNotify, setShowNotify]           = useState(false)
  const [showQuotes, setShowQuotes]           = useState(false)
  const [showGames, setShowGames]             = useState(false)
  const [showEditGroup, setShowEditGroup]     = useState(false)
  const [selectedGroup, setSelectedGroup]     = useState(null)

  const handleDelete = async (group) => {
    if (!window.confirm(`Delete "${group.name}"?\n\nThis will permanently remove:\n• All games in this event\n• All quote requests sent to schedulers\n• All notifications related to this event\n\nThis cannot be undone.`)) return
    try {
      const { getDocs, query, collection, where, writeBatch, deleteDoc, doc: firestoreDoc } = await import('firebase/firestore')
      const batch = writeBatch(db)

      // 1. Delete all games in this group
      const gamesSnap = await getDocs(query(collection(db, 'games'), where('groupId', '==', group.id)))
      gamesSnap.docs.forEach(d => batch.delete(d.ref))

      // 1b. Delete all assignments for those games
      const gameIds = gamesSnap.docs.map(d => d.id)
      if (gameIds.length > 0) {
        const chunks = []
        for (let i = 0; i < gameIds.length; i += 30) chunks.push(gameIds.slice(i, i + 30))
        for (const chunk of chunks) {
          const assSnap = await getDocs(query(collection(db, 'assignments'), where('gameId', 'in', chunk)))
          assSnap.docs.forEach(d => batch.delete(d.ref))
        }
      }

      // 2. Delete all RFQs for this group
      const rfqsSnap = await getDocs(query(collection(db, 'rfqs'), where('groupId', '==', group.id)))
      rfqsSnap.docs.forEach(d => batch.delete(d.ref))

      // 3. Delete all quotes for this group
      const quotesSnap = await getDocs(query(collection(db, 'quotes'), where('groupId', '==', group.id)))
      quotesSnap.docs.forEach(d => batch.delete(d.ref))

      // 4. Delete all invoices for this group
      const invoicesSnap = await getDocs(query(collection(db, 'invoices'), where('groupId', '==', group.id)))
      invoicesSnap.docs.forEach(d => batch.delete(d.ref))

      // 5. Delete notifications related to this group
      const notifsSnap = await getDocs(query(collection(db, 'notifications'), where('groupId', '==', group.id)))
      notifsSnap.docs.forEach(d => batch.delete(d.ref))

      // 6. Delete the group itself
      batch.delete(firestoreDoc(db, 'gameGroups', group.id))

      await batch.commit()
      toast.success(`"${group.name}" and all related data deleted`)
    } catch (err) {
      console.error('Delete failed:', err)
      toast.error('Failed to delete event: ' + (err.message ?? err))
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>My Events & Leagues</h1>
          <p className={styles.sub}>{groups.length} event{groups.length !== 1 ? 's' : ''} total</p>
        </div>
        <Button variant="primary" onClick={() => setShowCreateGroup(true)}>+ Create Event / League</Button>
      </div>

      {loading ? (
        <div className={styles.center}><Spinner size="lg" /></div>
      ) : groups.length === 0 ? (
        <Card><CardBody>
          <EmptyState icon="🏆" title="No events yet"
            message="Create your first tournament or league to start posting games and requesting schedulers."
            action={{ label: '+ Create Event', onClick: () => setShowCreateGroup(true) }} />
        </CardBody></Card>
      ) : (
        <div className={styles.groupList}>
          {groups.map(group => (
            <GroupCard key={group.id} group={group}
              onAddGames={() => { setSelectedGroup(group); setShowAddGames(true) }}
              onNotify={() => { setSelectedGroup(group); setShowNotify(true) }}
              onViewQuotes={() => { setSelectedGroup(group); setShowQuotes(true) }}
              onViewGames={() => { setSelectedGroup(group); setShowGames(true) }}
              onEdit={() => { setSelectedGroup(group); setShowEditGroup(true) }}
              onDelete={() => handleDelete(group)} />
          ))}
        </div>
      )}

      <CreateGroupModal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} userId={user?.uid} userProfile={profile} />
      {selectedGroup && <EditGroupModal open={showEditGroup} onClose={() => { setShowEditGroup(false); setSelectedGroup(null) }} group={selectedGroup} />}
      {selectedGroup && <AddGamesModal open={showAddGames} onClose={() => { setShowAddGames(false); setSelectedGroup(null) }} group={selectedGroup} />}
      {selectedGroup && <NotifySchedulersModal open={showNotify} onClose={() => { setShowNotify(false); setSelectedGroup(null) }} group={selectedGroup} userId={user?.uid} userName={profile?.displayName} connectedSchedulers={connectedSchedulers} />}
      {selectedGroup && <QuotesModal open={showQuotes} onClose={() => { setShowQuotes(false); setSelectedGroup(null) }} group={selectedGroup} directorUid={user?.uid} />}
      {selectedGroup && <ViewGamesModal open={showGames} onClose={() => { setShowGames(false); setSelectedGroup(null) }} group={selectedGroup} />}
    </div>
  )
}

// ── Event status pipeline ─────────────────────────────────────────────────────
const EVENT_STATUSES = {
  draft:           { label: 'Draft',            icon: '📝', color: '#6b7280', variant: 'gray',  desc: 'Event created — add games to get started' },
  open:            { label: 'Games Added',       icon: '🏒', color: '#2563eb', variant: 'blue',  desc: 'Games added — notify schedulers to get quotes' },
  pending_quotes:  { label: 'Awaiting Quotes',   icon: '📬', color: '#d97706', variant: 'amber', desc: 'Schedulers notified — waiting for their quotes' },
  quotes_received: { label: 'Quotes Received',   icon: '💬', color: '#7c3aed', variant: 'blue',  desc: 'Quotes in — review and accept one to proceed' },
  scheduled:       { label: 'Scheduled',         icon: '✅', color: '#059669', variant: 'green', desc: 'Quote accepted — waiting for invoice from scheduler' },
  invoice_pending: { label: 'Invoice Pending',   icon: '🧾', color: '#dc2626', variant: 'red',   desc: 'Invoice received — go to Invoices to pay' },
  active:          { label: 'Active',            icon: '🟢', color: '#059669', variant: 'green', desc: 'Paid — officials are being scheduled for games' },
  completed:       { label: 'Completed',         icon: '🏆', color: '#6b7280', variant: 'gray',  desc: 'All games completed' },
}

// Derive the current event status from its data
function deriveEventStatus(group) {
  if (group.status === 'completed') return 'completed'
  if (group.status === 'active' || group.invoicePaid) return 'active'
  if (group.hasUnpaidInvoice) return 'invoice_pending'
  if (group.quoteAccepted) return 'scheduled'
  if (group.hasQuotes) return 'quotes_received'
  if (group.rfqSent) return 'pending_quotes'
  if ((group.totalGames ?? 0) > 0) return 'open'
  return 'draft'
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({ group, onAddGames, onNotify, onViewQuotes, onViewGames, onEdit, onDelete }) {
  const hasGames   = (group.totalGames ?? 0) > 0
  const fillPct    = hasGames ? Math.round(((group.filledGames ?? 0) / group.totalGames) * 100) : 0
  const needsType  = group.officialsNeeded ?? 'both'
  const statusKey  = deriveEventStatus(group)
  const statusMeta = EVENT_STATUSES[statusKey] ?? EVENT_STATUSES.draft

  const officialsLabel = {
    both:         '🏒📋 Referees & Scorekeepers',
    referees:     '🏒 Referees Only',
    scorekeepers: '📋 Scorekeepers Only',
  }[needsType] ?? '—'

  const divisionLabels = group.divisions?.map(d => d.label).join(', ') ?? '—'
  const venueLabels    = group.venues?.slice(0, 2).join(', ') ?? '—'

  return (
    <div className={styles.groupCard}>
      {/* Header */}
      <div className={styles.groupCardHeader}>
        <div className={styles.groupCardLeft}>
          <div className={styles.groupName}>{group.name}</div>
          <div className={styles.groupMeta}>
            <span>{group.sport ?? 'Hockey'}</span>
            {group.startDate && (
              <span>{format(new Date(group.startDate), 'MMM d')}{group.endDate ? ` – ${format(new Date(group.endDate), 'MMM d, yyyy')}` : ''}</span>
            )}
            <span className={styles.officialsTag}>{officialsLabel}</span>
          </div>
          <div className={styles.groupInfo}>
            <span className={styles.infoRow}>🎯 {divisionLabels}</span>
            <span className={styles.infoRow}>📍 {venueLabels}{(group.venues?.length ?? 0) > 2 ? ` +${group.venues.length - 2} more` : ''}</span>
            {group.budget && <span className={styles.infoRow}>💰 Budget: <strong>${Number(group.budget).toLocaleString()}</strong></span>}
          </div>
        </div>

        {/* Status badge */}
        <div className={styles.statusColumn}>
          <div className={styles.statusBadge} style={{ background: `${statusMeta.color}15`, color: statusMeta.color, borderColor: `${statusMeta.color}30` }}>
            <span>{statusMeta.icon}</span>
            <span>{statusMeta.label}</span>
          </div>
          {hasGames && (
            <div className={styles.gameCount}>{group.totalGames} games</div>
          )}
        </div>
      </div>

      {/* Status progress pipeline */}
      <div className={styles.statusPipeline}>
        {Object.entries(EVENT_STATUSES).map(([key, meta], i, arr) => {
          const isDone    = Object.keys(EVENT_STATUSES).indexOf(key) < Object.keys(EVENT_STATUSES).indexOf(statusKey)
          const isCurrent = key === statusKey
          return (
            <div key={key} className={styles.pipelineStep}>
              <div className={[
                styles.pipelineDot,
                isDone    ? styles.pipelineDone    : '',
                isCurrent ? styles.pipelineCurrent : '',
              ].join(' ')} title={meta.label}>
                {isDone ? '✓' : isCurrent ? meta.icon : ''}
              </div>
              {i < arr.length - 1 && <div className={[styles.pipelineLine, isDone ? styles.pipelineLineDone : ''].join(' ')} />}
            </div>
          )
        })}
      </div>

      {/* Current status description */}
      <div className={styles.statusDesc}>
        <span style={{ color: statusMeta.color, fontWeight: 600 }}>{statusMeta.icon} {statusMeta.label}:</span>
        {' '}{statusMeta.desc}
      </div>

      {/* Fill progress bar — only show when active */}
      {hasGames && (statusKey === 'active' || statusKey === 'completed') && (
        <div className={styles.fillRow}>
          <div className={styles.fillMeta}>
            <span>{group.filledGames ?? 0} / {group.totalGames} positions filled</span>
            <span className={styles.fillPct}>{fillPct}%</span>
          </div>
          <div className={styles.fillBar}><div className={styles.fillProgress} style={{ width: `${fillPct}%` }} /></div>
        </div>
      )}

      {/* Actions */}
      <div className={styles.groupActions}>
        <Button size="sm" variant="secondary" onClick={onAddGames}>+ Add Games</Button>
        <Button size="sm" variant="primary"   onClick={onNotify}>📢 Notify Schedulers</Button>
        <Button size="sm" variant="teal"      onClick={onViewQuotes}>💬 View Quotes</Button>
        <Button size="sm" variant="ghost"     onClick={onViewGames}>View Games</Button>
        <Button size="sm" variant="ghost"     onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="danger"    onClick={onDelete}>Delete</Button>
      </div>
    </div>
  )
}

// ── Shared field subcomponents ────────────────────────────────────────────────
function VenueFields({ venues, onUpdate, onAdd, onRemove }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelSt}>Venue(s) *</label>
      {venues.map((v, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 7, alignItems: 'center' }}>
          <input style={inputSt} placeholder={`Venue ${i + 1}`} value={v} onChange={e => onUpdate(i, e.target.value)} />
          {venues.length > 1 && <button style={removeSt} type="button" onClick={() => onRemove(i)}>✕</button>}
        </div>
      ))}
      <button style={addLinkSt} type="button" onClick={onAdd}>+ Add another venue</button>
    </div>
  )
}

function DivisionFields({ divisions, input, onInputChange, onAdd, onRemove }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelSt}>Age &amp; Skill Levels *</label>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input style={{ ...inputSt, flex: 1 }} placeholder="e.g. 14UAA, 12UA1, Adult B/C"
          value={input} onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAdd()} />
        <Button size="sm" variant="secondary" onClick={onAdd}>Add</Button>
      </div>
      {divisions.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {divisions.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-bg)', borderRadius: 8, padding: '8px 12px' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
              <button style={removeSt} type="button" onClick={() => onRemove(i)}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Billing rate block ────────────────────────────────────────────────────────
function BillingRateBlock({ title, hourlyRate, perGameFee, onHourlyChange, onPerGameChange }) {
  return (
    <div style={{ background: 'var(--color-surface-2)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 10, border: '1px solid var(--color-border)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: 'var(--color-muted)', marginBottom: 10 }}>{title}</div>
      <FormRow>
        <Input label="Hourly Rate ($/hr)" type="number" value={hourlyRate} onChange={e => onHourlyChange(e.target.value)} hint={`Scheduler charges $${hourlyRate}/hr`} />
        <Input label="Per-Game Fee ($)"   type="number" value={perGameFee}  onChange={e => onPerGameChange(e.target.value)} hint={`+ $${perGameFee} per game`} />
      </FormRow>
      <div style={{ fontSize: 12, color: 'var(--color-muted)', fontStyle: 'italic' }}>
        Invoice = (${hourlyRate}/hr × total hours) + (${perGameFee} × # games)
      </div>
    </div>
  )
}

// ── Create Group Modal ────────────────────────────────────────────────────────
function CreateGroupModal({ open, onClose, userId, userProfile }) {
  const [saving, setSaving]               = useState(false)
  const [form, setForm]                   = useState({ name: '', sport: 'Ice Hockey', startDate: '', endDate: '', notes: '', budget: '' })
  const [venues, setVenues]               = useState([''])
  const [divisions, setDivisions]         = useState([])
  const [divisionInput, setDivisionInput] = useState('')
  const [dateError, setDateError]         = useState('')
  const [officialsNeeded, setOfficialsNeeded] = useState('both')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const handleEndDate = (v) => { setDateError(form.startDate && v && v < form.startDate ? 'End date cannot be before start date' : ''); set('endDate', v) }
  const updateVenue   = (i, v) => setVenues(vs => vs.map((x, idx) => idx === i ? v : x))
  const addVenue      = () => setVenues(vs => [...vs, ''])
  const removeVenue   = (i) => setVenues(vs => vs.filter((_, idx) => idx !== i))
  const addDivision   = () => { if (!divisionInput.trim()) return; setDivisions(ds => [...ds, { label: divisionInput.trim() }]); setDivisionInput('') }
  const removeDivision = (i) => setDivisions(ds => ds.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!form.name || !form.startDate)  { toast.error('Name and start date are required'); return }
    if (dateError)                       { toast.error(dateError); return }
    const filledVenues = venues.filter(Boolean)
    if (!filledVenues.length)            { toast.error('At least one venue is required'); return }
    if (!divisions.length)               { toast.error('Add at least one age group / skill level'); return }
    setSaving(true)
    try {
      await createGameGroup({
        ...form,
        venues: filledVenues,
        divisions,
        officialsNeeded,
        totalGames: 0,
        filledGames: 0,
        totalHours: 0,
        budget: form.budget ? Number(form.budget) : null,
        directorName: userProfile?.displayName,
        organization: userProfile?.directorProfile?.organization ?? '',
        status: 'draft',
      }, userId)
      toast.success('Event created!')
      setForm({ name: '', sport: 'Ice Hockey', startDate: '', endDate: '', notes: '', budget: '' })
      setVenues(['']); setDivisions([]); setDivisionInput('')
      onClose()
    } catch { toast.error('Failed to create event') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Create Event / League" size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>Create Event</Button></>}
    >
      <Input label="Event / League Name *" placeholder="NSHL Spring Playoffs 2026" value={form.name} onChange={e => set('name', e.target.value)} />
      <Select label="Sport" value={form.sport} onChange={e => set('sport', e.target.value)}>
        <option>Ice Hockey</option><option>Roller Hockey</option><option>Ball Hockey</option>
      </Select>
      <FormRow>
        <Input label="Start Date *" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        <Input label="End Date" type="date" value={form.endDate} error={dateError} min={form.startDate} onChange={e => handleEndDate(e.target.value)} />
      </FormRow>

      <VenueFields venues={venues} onUpdate={updateVenue} onAdd={addVenue} onRemove={removeVenue} />
      <DivisionFields divisions={divisions} input={divisionInput} onInputChange={setDivisionInput} onAdd={addDivision} onRemove={removeDivision} />

      {/* Officials needed selector */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ ...labelSt, marginBottom: 10 }}>Officials Needed *</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OFFICIALS_NEEDED_OPTIONS.map(opt => (
            <div key={opt.value}
              onClick={() => setOfficialsNeeded(opt.value)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '11px 14px', borderRadius: 'var(--radius)',
                border: `2px solid ${officialsNeeded === opt.value ? 'var(--blue)' : 'var(--color-border)'}`,
                background: officialsNeeded === opt.value ? 'rgba(37,99,235,.05)' : 'var(--color-surface)',
                cursor: 'pointer', transition: 'all .13s',
              }}
            >
              <div style={{
                width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                border: `2px solid ${officialsNeeded === opt.value ? 'var(--blue)' : 'var(--color-border)'}`,
                background: officialsNeeded === opt.value ? 'var(--blue)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {officialsNeeded === opt.value && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />}
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700 }}>{opt.label}</div>
                <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 1 }}>{opt.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <Input label="Budget (optional)" type="number" placeholder="e.g. 2500" value={form.budget} onChange={e => set('budget', e.target.value)} hint="Your total budget for scheduling — shared with schedulers as guidance when they quote" />
      <Textarea label="Notes for Scheduler" placeholder="Parking info, dress code, special instructions..." value={form.notes} onChange={e => set('notes', e.target.value)} />
    </Modal>
  )
}

// ── Edit Group Modal ──────────────────────────────────────────────────────────
function EditGroupModal({ open, onClose, group }) {
  const [saving, setSaving]               = useState(false)
  const [form, setForm]                   = useState({ name: group?.name ?? '', sport: group?.sport ?? 'Ice Hockey', startDate: group?.startDate ?? '', endDate: group?.endDate ?? '', notes: group?.notes ?? '', budget: group?.budget ? String(group.budget) : '' })
  const [venues, setVenues]               = useState(group?.venues ?? [''])
  const [divisions, setDivisions]         = useState(group?.divisions ?? [])
  const [divisionInput, setDivisionInput] = useState('')
  const [dateError, setDateError]         = useState('')
  const [officialsNeeded, setOfficialsNeeded] = useState(group?.officialsNeeded ?? 'both')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))
  const handleEndDate = (v) => { setDateError(form.startDate && v && v < form.startDate ? 'End date cannot be before start date' : ''); set('endDate', v) }
  const updateVenue   = (i, v) => setVenues(vs => vs.map((x, idx) => idx === i ? v : x))
  const addVenue      = () => setVenues(vs => [...vs, ''])
  const removeVenue   = (i) => setVenues(vs => vs.filter((_, idx) => idx !== i))
  const addDivision   = () => { if (!divisionInput.trim()) return; setDivisions(ds => [...ds, { label: divisionInput.trim() }]); setDivisionInput('') }
  const removeDivision = (i) => setDivisions(ds => ds.filter((_, idx) => idx !== i))

  const handleSave = async () => {
    if (!form.name || !form.startDate) { toast.error('Name and start date are required'); return }
    if (dateError)                      { toast.error(dateError); return }
    const filledVenues = venues.filter(Boolean)
    if (!filledVenues.length)           { toast.error('At least one venue is required'); return }
    if (!divisions.length)              { toast.error('Add at least one age group / skill level'); return }
    setSaving(true)
    try {
      await updateGameGroup(group.id, {
        ...form, venues: filledVenues, divisions, officialsNeeded,
        budget: form.budget ? Number(form.budget) : null,
      })
      toast.success('Event updated!'); onClose()
    } catch { toast.error('Failed to update event') }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Edit — ${group?.name ?? ''}`} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSave}>Save Changes</Button></>}
    >
      <Input label="Event / League Name *" value={form.name} onChange={e => set('name', e.target.value)} />
      <Select label="Sport" value={form.sport} onChange={e => set('sport', e.target.value)}>
        <option>Ice Hockey</option><option>Roller Hockey</option><option>Ball Hockey</option>
      </Select>
      <FormRow>
        <Input label="Start Date *" type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        <Input label="End Date" type="date" value={form.endDate} error={dateError} min={form.startDate} onChange={e => handleEndDate(e.target.value)} />
      </FormRow>
      <VenueFields venues={venues} onUpdate={updateVenue} onAdd={addVenue} onRemove={removeVenue} />
      <DivisionFields divisions={divisions} input={divisionInput} onInputChange={setDivisionInput} onAdd={addDivision} onRemove={removeDivision} />

      <div style={{ marginBottom: 14 }}>
        <label style={{ ...labelSt, marginBottom: 8 }}>Officials Needed</label>
        <Select value={officialsNeeded} onChange={e => setOfficialsNeeded(e.target.value)}>
          {OFFICIALS_NEEDED_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      <Input label="Budget (optional)" type="number" placeholder="e.g. 2500" value={form.budget} onChange={e => set('budget', e.target.value)} hint="Your total budget for scheduling" />
      <Textarea label="Notes for Scheduler" value={form.notes} onChange={e => set('notes', e.target.value)} />
    </Modal>
  )
}

// ── CSV Template columns and download ────────────────────────────────────────
const CSV_HEADERS = ['home_team', 'away_team', 'game_date', 'game_time', 'venue', 'division', 'duration_hours', 'referees', 'linesmen', 'scorekeepers']
const CSV_NOTES   = ['Team name', 'Team name', 'MM-DD-YYYY', 'HH:MM (24hr)', 'Venue name', 'Division/age group', '1 / 1.25 / 1.5 / 1.75 / 2', '# of refs needed', '# of linesmen needed', '# of scorekeepers needed']
const CSV_EXAMPLE = ['Nashville Predators', 'Chicago Blackhawks', '07-15-2026', '18:00', 'Ford Ice Center - Antioch', '14UAA', '1.5', '2', '2', '1']

const downloadCSVTemplate = () => {
  const rows = [CSV_HEADERS, CSV_NOTES, CSV_EXAMPLE]
  const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'refsync_games_template.csv'; a.click()
  URL.revokeObjectURL(url)
}

// ── Add Games Modal ───────────────────────────────────────────────────────────
function AddGamesModal({ open, onClose, group }) {
  const [saving, setSaving]     = useState(false)
  const [games, setGames]       = useState([emptyGame(group)])
  const [csvError, setCsvError] = useState('')
  const csvInputRef             = useRef(null)

  function emptyGame(g) {
    const crew = DEFAULT_CREW[g?.officialsNeeded ?? 'both']
    return { homeTeam: '', awayTeam: '', gameDate: '', gameTime: '', venue: '', division: '', duration: 1.5, customDuration: '', ...crew }
  }

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCsvError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const text  = ev.target.result
        const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean)
        if (lines.length < 2) { setCsvError('CSV must have a header row and at least one data row'); return }

        // Parse header row — handle quoted values
        const parseRow = (line) => line.split(',').map(v => v.trim().replace(/^"|"$/g, '').trim())
        const headers  = parseRow(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'))

        const idx = {
          homeTeam:     headers.findIndex(h => h.includes('home')),
          awayTeam:     headers.findIndex(h => h.includes('away')),
          gameDate:     headers.findIndex(h => h.includes('date')),
          gameTime:     headers.findIndex(h => h.includes('time')),
          venue:        headers.findIndex(h => h.includes('venue')),
          division:     headers.findIndex(h => h.includes('division')),
          duration:     headers.findIndex(h => h.includes('duration') || h.includes('hour')),
          refs:         headers.findIndex(h => h === 'referees' || h === 'refs'),
          linesmen:     headers.findIndex(h => h.includes('linesman') || h.includes('linesmen')),
          scorekeepers: headers.findIndex(h => h.includes('scorekeeper')),
        }

        if (idx.homeTeam < 0 || idx.awayTeam < 0 || idx.gameDate < 0) {
          setCsvError('CSV must have home_team, away_team, and game_date columns'); return
        }

        const parsed = []
        const errors = []

        // Skip the notes/instructions row (row 2) if it doesn't look like a real game
        const dataLines = lines.slice(1).filter(line => {
          const cols = parseRow(line)
          const firstCol = cols[0]?.toLowerCase() ?? ''
          // Skip if it looks like instructions (contains 'name', 'format', 'team', '#')
          return !['team name', 'team', 'format', '#', 'mm-dd', 'hh:mm'].some(skip => firstCol.includes(skip))
        })

        dataLines.forEach((line, i) => {
          const cols = parseRow(line)
          if (cols.every(c => !c)) return // skip empty rows

          const homeTeam = cols[idx.homeTeam] ?? ''
          const awayTeam = cols[idx.awayTeam] ?? ''
          const rawDate  = cols[idx.gameDate] ?? ''
          const gameTime = idx.gameTime >= 0 ? (cols[idx.gameTime] ?? '') : ''
          const venue    = idx.venue    >= 0 ? (cols[idx.venue]    ?? '') : ''
          const division = idx.division >= 0 ? (cols[idx.division] ?? '') : ''
          const durRaw   = idx.duration >= 0 ? (cols[idx.duration] ?? '') : ''
          const duration = parseFloat(durRaw) || 1.5
          // Crew slots from CSV — fall back to event defaults
          const csvRefs  = idx.refs         >= 0 ? Number(cols[idx.refs])         || 0 : null
          const csvLines = idx.linesmen     >= 0 ? Number(cols[idx.linesmen])     || 0 : null
          const csvSKs   = idx.scorekeepers >= 0 ? Number(cols[idx.scorekeepers]) || 0 : null

          if (!homeTeam || !awayTeam) { errors.push(`Row ${i + 2}: missing home or away team`); return }

          // Parse date — accept M-D-YY, M-D-YYYY, MM-DD-YYYY, YYYY-MM-DD
          let gameDate = rawDate.trim()
          const yyyymmdd = gameDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
          const mdyy     = gameDate.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/)
          if (yyyymmdd) {
            // Already YYYY-MM-DD — just pad
            gameDate = `${yyyymmdd[1]}-${yyyymmdd[2].padStart(2,'0')}-${yyyymmdd[3].padStart(2,'0')}`
          } else if (mdyy) {
            const [, m, d, y] = mdyy
            const year = y.length === 2 ? `20${y}` : y
            gameDate = `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
          } else {
            errors.push(`Row ${i + 2}: unrecognized date format "${rawDate}" — use MM-DD-YYYY`); return
          }

          // Parse time — accept 12hr (6:00 PM, 6:00pm, 6pm) or 24hr (18:00)
          let parsedTime = '12:00'
          if (gameTime) {
            const t = gameTime.trim()
            const hr24 = t.match(/^(\d{1,2}):(\d{2})$/)
            const hr12 = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i)
            if (hr24) {
              parsedTime = `${hr24[1].padStart(2,'0')}:${hr24[2]}`
            } else if (hr12) {
              let h = parseInt(hr12[1])
              const mins = hr12[2] ?? '00'
              const ampm = hr12[3].toLowerCase()
              if (ampm === 'pm' && h !== 12) h += 12
              if (ampm === 'am' && h === 12) h = 0
              parsedTime = `${String(h).padStart(2,'0')}:${mins.padStart(2,'0')}`
            }
          }
          const defaultCrew = DEFAULT_CREW[group?.officialsNeeded ?? 'both']
          parsed.push({
            homeTeam, awayTeam, gameDate,
            gameTime:    parsedTime,
            venue:       venue || group?.venues?.[0] || '',
            division:    division || '',
            duration:    [1, 1.25, 1.5, 1.75, 2].includes(duration) ? duration : 0,
            customDuration: [1, 1.25, 1.5, 1.75, 2].includes(duration) ? '' : String(duration),
            refs:        csvRefs  ?? defaultCrew.refs,
            linesmen:    csvLines ?? defaultCrew.linesmen,
            scorekeepers:csvSKs   ?? defaultCrew.scorekeepers,
          })
        })

        if (errors.length > 0) { setCsvError(errors.slice(0, 3).join('\n') + (errors.length > 3 ? `\n…and ${errors.length - 3} more` : '')); return }
        if (!parsed.length)    { setCsvError('No valid game rows found in CSV'); return }

        setGames(parsed)
        toast.success(`${parsed.length} game${parsed.length > 1 ? 's' : ''} imported from CSV`)
      } catch (err) {
        setCsvError('Failed to parse CSV — make sure it matches the template format')
      }
    }
    reader.readAsText(file)
    e.target.value = '' // reset so same file can be re-uploaded
  }

  const updateGame = (i, k, v) => setGames(gs => gs.map((g, idx) => idx === i ? { ...g, [k]: v } : g))
  const addRow     = () => setGames(gs => [...gs, emptyGame(group)])
  const removeRow  = (i) => setGames(gs => gs.filter((_, idx) => idx !== i))
  const getDur     = (g) => g.duration === 0 ? (Number(g.customDuration) || 1) : g.duration

  const needsRef = group?.officialsNeeded === 'referees'     || group?.officialsNeeded === 'both' || !group?.officialsNeeded
  const needsSK  = group?.officialsNeeded === 'scorekeepers' || group?.officialsNeeded === 'both' || !group?.officialsNeeded

  const refRate = group?.refInvoiceRate ?? group?.invoiceRate ?? { hourlyRate: 75, perGameFee: 10 }
  const skRate  = group?.skInvoiceRate  ?? { hourlyRate: 20, perGameFee: 5 }

  const totalHours  = games.reduce((s, g) => s + getDur(g), 0)
  const refInvoice  = needsRef ? (refRate.hourlyRate * totalHours + refRate.perGameFee * games.length) : 0
  const skInvoice   = needsSK  ? (skRate.hourlyRate  * totalHours + skRate.perGameFee  * games.length) : 0
  const skPayTotal  = needsSK  ? (skRate.hourlyRate  * totalHours) : 0

  const handleSave = async () => {
    const valid = games.filter(g => g.homeTeam && g.awayTeam && g.gameDate)
    if (!valid.length) { toast.error('Fill in at least one complete game'); return }
    setSaving(true)
    try {
      const addedHours = valid.reduce((s, g) => s + getDur(g), 0)
      await Promise.all(valid.map(g => createGame({
        ...g,
        duration: getDur(g),
        groupId:   group.id,
        groupName: group.name,
        directorId:   group.directorId ?? group.createdBy ?? null,
        schedulerId:  group.schedulerId ?? group.refSchedulerId ?? null,
        skSchedulerId: group.skSchedulerId ?? null,
        sport: group.sport ?? 'Ice Hockey',
        officialsNeeded: group.officialsNeeded ?? 'both',
        refs:         needsRef ? (Number(g.refs)         ?? 2) : 0,
        linesmen:     needsRef ? (Number(g.linesmen)     ?? 2) : 0,
        scorekeepers: needsSK  ? (Number(g.scorekeepers) ?? 1) : 0,
        gameDate: new Date(`${g.gameDate}T${g.gameTime || '12:00'}`),
        venue: g.venue || group.venues?.[0] || '',
        assignedOfficials: [],
        assignedUids:      [],
        requests:          [],
        status: 'open',
      })))
      await updateGameGroup(group.id, {
        totalGames: (group.totalGames ?? 0) + valid.length,
        totalHours: (group.totalHours ?? 0) + addedHours,
        status: 'active',
      })
      toast.success(`${valid.length} game${valid.length > 1 ? 's' : ''} added!`)
      setGames([emptyGame(group)]); onClose()
    } catch (err) {
      console.error('Failed to add games:', err)
      toast.error(`Failed to add games: ${err.message ?? err}`)
    } finally { setSaving(false) }
  }

  const venues    = group?.venues    ?? []
  const divisions = group?.divisions ?? []

  return (
    <Modal open={open} onClose={onClose} title={`Add Games — ${group?.name ?? ''}`} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="secondary" onClick={addRow}>+ Add Game</Button><Button variant="primary" loading={saving} onClick={handleSave}>Save {games.length} Game{games.length > 1 ? 's' : ''}</Button></>}
    >
      {/* CSV import toolbar */}
      <div className={styles.csvToolbar}>
        <div className={styles.csvToolbarLeft}>
          <span className={styles.csvLabel}>Import from CSV:</span>
          <button className={styles.csvBtn} onClick={downloadCSVTemplate}>
            ⬇ Download Template
          </button>
          <button className={styles.csvBtn} style={{ color: 'var(--blue)' }} onClick={() => csvInputRef.current?.click()}>
            ⬆ Upload CSV
          </button>
          <input ref={csvInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleCSVUpload} />
        </div>
        <span className={styles.csvHint}>{games.length} game{games.length !== 1 ? 's' : ''} ready</span>
      </div>
      {csvError && (
        <div className={styles.csvError}>
          ⚠️ {csvError}
        </div>
      )}

      <div className={styles.gameRows}>
        {games.map((g, i) => (
          <div key={i} className={styles.gameRow}>
            <div className={styles.gameRowHeader}>
              <span className={styles.gameRowNum}>Game {i + 1}</span>
              {games.length > 1 && <button style={removeSt} type="button" onClick={() => removeRow(i)}>✕ Remove</button>}
            </div>

            {/* Line 1 */}
            <div className={styles.gameLine1}>
              <div><label style={labelSt}>Home Team</label><input style={inputSt} placeholder="Home team" value={g.homeTeam} onChange={e => updateGame(i, 'homeTeam', e.target.value)} /></div>
              <div><label style={labelSt}>Away Team</label><input style={inputSt} placeholder="Away team" value={g.awayTeam} onChange={e => updateGame(i, 'awayTeam', e.target.value)} /></div>
              <div><label style={labelSt}>Date</label><input style={inputSt} type="date" value={g.gameDate} onChange={e => updateGame(i, 'gameDate', e.target.value)} /></div>
              <div><label style={labelSt}>Time</label><input style={inputSt} type="time" value={g.gameTime} onChange={e => updateGame(i, 'gameTime', e.target.value)} /></div>
            </div>

            {/* Line 2 */}
            <div className={styles.gameLine2}>
              <div>
                <label style={labelSt}>Venue</label>
                <select style={inputSt} value={g.venue} onChange={e => updateGame(i, 'venue', e.target.value)}>
                  <option value="">Select venue</option>
                  {venues.map((v, vi) => <option key={vi} value={v}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Division</label>
                <select style={inputSt} value={g.division} onChange={e => updateGame(i, 'division', e.target.value)}>
                  <option value="">Select division</option>
                  {divisions.map((d, di) => <option key={di} value={d.label}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label style={labelSt}>Duration</label>
                <select style={inputSt} value={g.duration} onChange={e => updateGame(i, 'duration', Number(e.target.value))}>
                  {DURATION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {g.duration === 0 && (
                  <input style={{ ...inputSt, marginTop: 4 }} type="number" step="0.25" placeholder="e.g. 1.75" value={g.customDuration} onChange={e => updateGame(i, 'customDuration', e.target.value)} />
                )}
              </div>
            </div>

            {/* Crew slots — always show based on what's needed */}
            <div className={styles.crewSlots}>
              <div className={styles.crewSlotsLabel}>Crew Slots per Game</div>
              <div className={styles.crewSlotsRow}>
                {needsRef && (
                  <>
                    <div className={styles.crewSlot}>
                      <label style={labelSt}>🏒 Referees</label>
                      <input style={{ ...inputSt, width: 70 }} type="number" min="0" max="4" value={g.refs ?? 2} onChange={e => updateGame(i, 'refs', Number(e.target.value))} />
                    </div>
                    <div className={styles.crewSlot}>
                      <label style={labelSt}>Linesmen</label>
                      <input style={{ ...inputSt, width: 70 }} type="number" min="0" max="4" value={g.linesmen ?? 2} onChange={e => updateGame(i, 'linesmen', Number(e.target.value))} />
                    </div>
                  </>
                )}
                {needsSK && (
                  <div className={styles.crewSlot}>
                    <label style={labelSt}>📋 Scorekeepers</label>
                    <input style={{ ...inputSt, width: 70 }} type="number" min="0" max="2" value={g.scorekeepers ?? 1} onChange={e => updateGame(i, 'scorekeepers', Number(e.target.value))} />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Notify Schedulers Modal ───────────────────────────────────────────────────
function NotifySchedulersModal({ open, onClose, group, userId, userName, connectedSchedulers }) {
  const [saving, setSaving]           = useState(false)
  const [schedulerProfiles, setSchedulerProfiles] = useState([])
  const [refSchedulerUid, setRefSchedulerUid]     = useState(null)
  const [skSchedulerUid, setSkSchedulerUid]       = useState(null)
  const [refInviteEmail, setRefInviteEmail]       = useState('')
  const [skInviteEmail, setSkInviteEmail]         = useState('')
  const [note, setNote]               = useState('')

  const officialsNeeded = group?.officialsNeeded ?? 'both'
  const needsBoth = officialsNeeded === 'both'
  const needsRef  = officialsNeeded === 'referees'     || needsBoth
  const needsSK   = officialsNeeded === 'scorekeepers' || needsBoth

  const totalHours = group?.totalHours ?? 0
  const totalGames = group?.totalGames ?? 0

  // Load scheduler profiles to get their subRoles
  useEffect(() => {
    if (!open) return
    const conns = connectedSchedulers.filter(c => c.type === 'director-scheduler')
    if (!conns.length) { setSchedulerProfiles([]); return }
    Promise.all(conns.map(async conn => {
      const uid = conn.toUid ?? conn.fromUid
      if (!uid || uid === '__invite__') return null
      try {
        const snap = await import('firebase/firestore').then(({ getDoc, doc }) =>
          getDoc(doc(db, 'users', uid))
        )
        if (!snap.exists()) return null
        const data = snap.data()
        return {
          uid,
          name:     data.displayName ?? conn.toName ?? 'Scheduler',
          email:    data.email ?? '',
          subRoles: data.subRoles ?? [],
          isRefSched: (data.subRoles ?? []).includes('ref_scheduler'),
          isSKSched:  (data.subRoles ?? []).includes('sk_scheduler'),
        }
      } catch { return null }
    })).then(profiles => setSchedulerProfiles(profiles.filter(Boolean)))
  }, [open, connectedSchedulers.length])

  const refSchedulers = schedulerProfiles.filter(s => s.isRefSched)
  const skSchedulers  = schedulerProfiles.filter(s => s.isSKSched)
  const allSchedulers = schedulerProfiles // for single-type events

  const handleSend = async () => {
    if (!(group.totalGames > 0)) {
      toast.error('Add games to this event before notifying schedulers'); return
    }

    // Validation — must pick someone for each needed type
    if (needsRef && !refSchedulerUid && !refInviteEmail.trim()) {
      toast.error('Select or invite a Referee Scheduler'); return
    }
    if (needsSK && !skSchedulerUid && !skInviteEmail.trim()) {
      toast.error('Select or invite a Scorekeeper Scheduler'); return
    }

    setSaving(true)
    try {
      const sends = []

      // Ref RFQ
      if (needsRef) {
        const rfqData = { ...group, officialsNeeded: 'referees', rfqType: 'referees' }
        if (refSchedulerUid) {
          sends.push(sendRFQ(group.id, rfqData, [refSchedulerUid], userId, userName))
        } else if (refInviteEmail.trim()) {
          sends.push(sendRFQByEmail(group.id, rfqData, refInviteEmail.trim(), userId, userName))
        }
      }

      // SK RFQ
      if (needsSK) {
        const rfqData = { ...group, officialsNeeded: 'scorekeepers', rfqType: 'scorekeepers' }
        if (skSchedulerUid) {
          sends.push(sendRFQ(group.id, rfqData, [skSchedulerUid], userId, userName))
        } else if (skInviteEmail.trim()) {
          sends.push(sendRFQByEmail(group.id, rfqData, skInviteEmail.trim(), userId, userName))
        }
      }

      await Promise.all(sends)

      const sentCount = sends.length
      toast.success(`${sentCount} quote request${sentCount > 1 ? 's' : ''} sent!`)
      setRefSchedulerUid(null); setSkSchedulerUid(null)
      setRefInviteEmail(''); setSkInviteEmail(''); setNote('')
      onClose()
    } catch (err) {
      toast.error('Failed to notify schedulers')
      console.error(err)
    } finally { setSaving(false) }
  }

  const SchedulerPicker = ({ type, label, icon, schedulers, selectedUid, onSelect, inviteEmail, onInviteEmail }) => {
    const hasConnected = schedulers.length > 0
    return (
      <div className={styles.schedPickerSection}>
        <div className={styles.schedPickerLabel}>{icon} {label}</div>
        {hasConnected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
            {schedulers.map(s => {
              const isPicked = selectedUid === s.uid
              return (
                <div key={s.uid}
                  onClick={() => onSelect(isPicked ? null : s.uid)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 13px', borderRadius: 'var(--radius)',
                    border: `2px solid ${isPicked ? 'var(--blue)' : 'var(--color-border)'}`,
                    background: isPicked ? 'rgba(37,99,235,.05)' : 'var(--color-surface)',
                    cursor: 'pointer', transition: 'all .13s',
                  }}
                >
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${isPicked ? 'var(--blue)' : 'var(--color-border)'}`,
                    background: isPicked ? 'var(--blue)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isPicked && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{s.email}</div>
                  </div>
                  {isPicked && <span style={{ fontSize: 12, color: 'var(--blue)', fontWeight: 700 }}>Selected</span>}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 8, fontStyle: 'italic' }}>
            No connected {type} schedulers — invite by email below
          </div>
        )}
        {!selectedUid && (
          <input
            style={{ ...inviteInputSt }}
            placeholder={`Or invite a ${type} scheduler by email…`}
            value={inviteEmail}
            onChange={e => onInviteEmail(e.target.value)}
          />
        )}
      </div>
    )
  }

  // For single-type events, show all schedulers
  const SinglePicker = ({ label, icon, selectedUid, onSelect, inviteEmail, onInviteEmail }) => (
    <div className={styles.schedPickerSection}>
      <div className={styles.schedPickerLabel}>{icon} {label}</div>
      {allSchedulers.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 10 }}>
          {allSchedulers.map(s => {
            const isPicked = selectedUid === s.uid
            return (
              <div key={s.uid}
                onClick={() => onSelect(isPicked ? null : s.uid)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 13px', borderRadius: 'var(--radius)',
                  border: `2px solid ${isPicked ? 'var(--blue)' : 'var(--color-border)'}`,
                  background: isPicked ? 'rgba(37,99,235,.05)' : 'var(--color-surface)',
                  cursor: 'pointer', transition: 'all .13s',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${isPicked ? 'var(--blue)' : 'var(--color-border)'}`,
                  background: isPicked ? 'var(--blue)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isPicked && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{s.email}</div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 8, fontStyle: 'italic' }}>
          No connected schedulers — invite by email below
        </div>
      )}
      {!selectedUid && (
        <input style={{ ...inviteInputSt }} placeholder="Or invite by email…" value={inviteEmail} onChange={e => onInviteEmail(e.target.value)} />
      )}
    </div>
  )

  const canSend = needsBoth
    ? (refSchedulerUid || refInviteEmail.trim()) && (skSchedulerUid || skInviteEmail.trim())
    : needsRef ? (refSchedulerUid || refInviteEmail.trim()) : (skSchedulerUid || skInviteEmail.trim())

  return (
    <Modal open={open} onClose={onClose}
      title={`Notify Schedulers — ${group?.name ?? ''}`} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={saving} onClick={handleSend} disabled={!canSend}>Send Quote Request{needsBoth ? 's' : ''}</Button></>}
    >
      {/* Game summary */}
      <div className={styles.rfqSummary}>
        <div className={styles.rfqSummaryTitle}>📋 Game Group Summary</div>
        <div className={styles.rfqSummaryGrid}>
          <div><span>Games</span><strong>{totalGames}</strong></div>
          <div><span>Total Hours</span><strong>{totalHours.toFixed(1)}hrs</strong></div>
          <div><span>Officials Needed</span><strong>{{both:'Refs & Scorekeepers', referees:'Referees Only', scorekeepers:'Scorekeepers Only'}[officialsNeeded] ?? '—'}</strong></div>
          <div><span>Venues</span><strong>{group?.venues?.slice(0,2).join(', ') ?? '—'}{(group?.venues?.length ?? 0) > 2 ? ` +${group.venues.length - 2}` : ''}</strong></div>
        </div>
      </div>

      {/* Split pickers for "both" */}
      {needsBoth && (
        <div>
          <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 14, lineHeight: 1.5 }}>
            This event needs both referees and scorekeepers. Choose a scheduler for each — they'll each receive a separate quote request and submit their price independently.
          </p>
          <SchedulerPicker
            type="referee" label="Referee Scheduler" icon="🏒"
            schedulers={refSchedulers.length > 0 ? refSchedulers : allSchedulers}
            selectedUid={refSchedulerUid} onSelect={setRefSchedulerUid}
            inviteEmail={refInviteEmail} onInviteEmail={setRefInviteEmail}
          />
          <div style={{ height: 12 }} />
          <SchedulerPicker
            type="scorekeeper" label="Scorekeeper Scheduler" icon="📋"
            schedulers={skSchedulers.length > 0 ? skSchedulers : allSchedulers}
            selectedUid={skSchedulerUid} onSelect={setSkSchedulerUid}
            inviteEmail={skInviteEmail} onInviteEmail={setSkInviteEmail}
          />
        </div>
      )}

      {/* Single picker for ref-only or SK-only */}
      {!needsBoth && needsRef && (
        <SinglePicker
          label="Referee Scheduler" icon="🏒"
          selectedUid={refSchedulerUid} onSelect={setRefSchedulerUid}
          inviteEmail={refInviteEmail} onInviteEmail={setRefInviteEmail}
        />
      )}
      {!needsBoth && needsSK && (
        <SinglePicker
          label="Scorekeeper Scheduler" icon="📋"
          selectedUid={skSchedulerUid} onSelect={setSkSchedulerUid}
          inviteEmail={skInviteEmail} onInviteEmail={setSkInviteEmail}
        />
      )}

      <Textarea label="Note (optional)" placeholder="Any specific requirements…" value={note} onChange={e => setNote(e.target.value)} rows={2} style={{ marginTop: 12 }} />
    </Modal>
  )
}

const inviteInputSt = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1.5px dashed var(--color-border)', background: 'var(--color-surface-2)',
  fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none', boxSizing: 'border-box',
  color: 'var(--color-muted)',
}

// ── Quotes Modal ──────────────────────────────────────────────────────────────
function QuotesModal({ open, onClose, group, directorUid }) {
  const [rfqs, setRfqs]       = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [accepting, setAccepting] = useState(null)
  const [declining, setDeclining] = useState(null)

  useEffect(() => {
    if (!open || !group?.id || !directorUid) return
    setLoading(true)
    setError('')
    setRfqs([])

    // Use getDocs (one-time fetch) — more reliable with security rules
    import('firebase/firestore').then(({ getDocs, query, collection, where }) =>
      getDocs(query(
        collection(db, 'rfqs'),
        where('directorUid', '==', directorUid)
      ))
    ).then(snap => {
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const forGroup = all.filter(r => r.groupId === group.id)
      setRfqs(forGroup)
      setLoading(false)
    }).catch(err => {
      console.error('QuotesModal error:', err)
      setError(err.message ?? 'Failed to load quotes')
      setLoading(false)
    })
  }, [open, group?.id, directorUid])

  const handleAccept = async (rfq) => {
    if (!window.confirm(`Accept ${rfq.schedulerName ?? 'this scheduler'}'s quote for $${rfq.quoteAmount?.toFixed(2)}?\n\nThey will be notified and can send you an invoice to pay.`)) return
    setAccepting(rfq.id)
    try {
      // Mark RFQ accepted
      await import('firebase/firestore').then(({ updateDoc, doc: fdoc, addDoc, collection, serverTimestamp }) =>
        Promise.all([
          // Update RFQ status
          updateDoc(fdoc(db, 'rfqs', rfq.id), {
            status:     'accepted',
            acceptedAt: new Date().toISOString(),
          }),
          // Mark group as having an accepted quote
          updateDoc(fdoc(db, 'gameGroups', group.id), {
            quoteAccepted: true,
            rfqSent: true,
          }),
          // Notify the scheduler their quote was accepted
          addDoc(collection(db, 'notifications'), {
            uid:       rfq.schedulerUid,
            type:      'rfq',
            title:     '✅ Quote Accepted!',
            message:   `${rfq.directorName ?? 'The director'} accepted your quote of $${rfq.quoteAmount?.toFixed(2)} for "${rfq.groupName}". Please send them an invoice to receive payment.`,
            read:      false,
            link:      '/scheduler/finance',
            groupId:   rfq.groupId,
            rfqId:     rfq.id,
            createdAt: serverTimestamp(),
          }),
        ])
      )
      // Mark other quotes for same group as not selected
      const others = rfqs.filter(r => r.id !== rfq.id && r.status === 'quoted')
      if (others.length > 0) {
        await Promise.all(others.map(r =>
          import('firebase/firestore').then(({ updateDoc, doc: fdoc }) =>
            updateDoc(fdoc(db, 'rfqs', r.id), { status: 'not_selected' })
          )
        ))
      }
      toast.success(`Quote accepted! ${rfq.schedulerName ?? 'The scheduler'} has been notified and will send you an invoice.`)
      // Refresh quotes
      setRfqs(prev => prev.map(r =>
        r.id === rfq.id ? { ...r, status: 'accepted' }
        : others.find(o => o.id === r.id) ? { ...r, status: 'not_selected' }
        : r
      ))
    } catch (err) {
      toast.error('Failed to accept quote')
      console.error(err)
    } finally {
      setAccepting(null)
    }
  }

  const handleDecline = async (rfq) => {
    setDeclining(rfq.id)
    try {
      await updateRFQ(rfq.id, { status: 'declined', declinedAt: new Date().toISOString() })
      toast.success('Quote declined')
    } catch { toast.error('Failed to decline') }
    finally { setDeclining(null) }
  }

  const STATUS_META = {
    open:         { label: 'Notified',     color: 'var(--blue)',  variant: 'blue'  },
    quoted:       { label: 'Quote Received', color: 'var(--teal)', variant: 'green' },
    accepted:     { label: 'Accepted',     color: 'var(--teal)',  variant: 'green' },
    declined:     { label: 'Declined',     color: 'var(--red)',   variant: 'red'   },
    not_selected: { label: 'Not Selected', color: 'var(--color-muted)', variant: 'gray' },
  }

  return (
    <Modal open={open} onClose={onClose} title={`Quotes — ${group?.name ?? ''}`} size="md"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      {loading ? (
        <div className={styles.center}><Spinner /></div>
      ) : error ? (
        <div style={{ padding: 20, color: 'var(--red)', fontSize: 13 }}>⚠️ {error}</div>
      ) : rfqs.length === 0 ? (
        <EmptyState icon="💬" title="No quotes yet" message="Schedulers you notified will submit their quote here. You'll see a notification when one arrives." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rfqs.map(rfq => {
            const meta = STATUS_META[rfq.status] ?? STATUS_META.open
            const hasQuote = rfq.status === 'quoted' && rfq.quoteAmount
            return (
              <div key={rfq.id} className={styles.quoteCard}>
                <div className={styles.quoteCardTop}>
                  <div className={styles.quoteInfo}>
                    <div className={styles.quoteName}>{rfq.schedulerName ?? 'Scheduler'}</div>
                    <Badge variant={meta.variant}>{meta.label}</Badge>
                  </div>
                  {hasQuote && (
                    <div className={styles.quoteAmount}>${rfq.quoteAmount.toFixed(2)}</div>
                  )}
                </div>

                {hasQuote && (
                  <>
                    {rfq.quoteBreakdown && (
                      <div className={styles.quoteBreakdown}>{rfq.quoteBreakdown}</div>
                    )}
                    {rfq.quoteNote && (
                      <div className={styles.quoteNote}>"{rfq.quoteNote}"</div>
                    )}
                    <div className={styles.quoteActions}>
                      <Button variant="primary" size="sm" loading={accepting === rfq.id} onClick={() => handleAccept(rfq)}>
                        ✓ Accept
                      </Button>
                      <Button variant="ghost" size="sm" loading={declining === rfq.id} onClick={() => handleDecline(rfq)}>
                        ✗ Decline
                      </Button>
                    </div>
                  </>
                )}

                {rfq.status === 'open' && (
                  <div className={styles.quotePending}>Waiting for scheduler to submit their quote…</div>
                )}
                {rfq.status === 'accepted' && (
                  <div className={styles.quoteAccepted}>✅ Accepted — waiting for scheduler to send invoice</div>
                )}
                {rfq.status === 'declined' && (
                  <div className={styles.quoteDeclined}>✗ You declined this quote</div>
                )}
                {rfq.status === 'not_selected' && (
                  <div className={styles.quoteDeclined}>Another quote was selected</div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}

// ── View Games Modal ──────────────────────────────────────────────────────────
function ViewGamesModal({ open, onClose, group }) {
  const [games, setGames]     = useState([])
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState('gameDate')

  useEffect(() => {
    if (!open || !group?.id) return
    setLoading(true)
    import('firebase/firestore').then(({ getDocs, query, collection, where }) =>
      getDocs(query(collection(db, 'games'), where('groupId', '==', group.id)))
    ).then(snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      data.sort((a, b) => {
        const da = a.gameDate?.toDate?.() ?? new Date(a.gameDate)
        const db_ = b.gameDate?.toDate?.() ?? new Date(b.gameDate)
        return da - db_
      })
      setGames(data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [open, group?.id])

  const open_   = games.filter(g => g.status === 'open').length
  const filled  = games.filter(g => g.status !== 'open').length

  return (
    <Modal open={open} onClose={onClose} title={`Games — ${group?.name ?? ''}`} size="lg"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
          <span style={{ fontSize: 12.5, color: 'var(--color-muted)' }}>
            {games.length} games · {open_} open · {filled} filled
          </span>
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      }
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <Spinner size="lg" />
        </div>
      ) : games.length === 0 ? (
        <EmptyState icon="🏒" title="No games added yet"
          message="Use the + Add Games button on the event card to add games." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)' }}>
                {['Date', 'Time', 'Home Team', 'Away Team', 'Venue', 'Division', 'Duration', 'Refs', 'Lines', 'SKs', 'Status'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--color-muted)', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {games.map(g => {
                const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
                const statusColors = { open: '#dc2626', assigned: '#2563eb', completed: '#16a34a' }
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid var(--color-border)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--color-surface-2)'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', fontWeight: 600 }}>{format(gd, 'MMM d, yyyy')}</td>
                    <td style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: 'var(--color-muted)' }}>{format(gd, 'h:mm a')}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 600 }}>{g.homeTeam}</td>
                    <td style={{ padding: '9px 10px', fontWeight: 600 }}>{g.awayTeam}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--color-muted)' }}>{g.venue || '—'}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--color-muted)' }}>{g.division || '—'}</td>
                    <td style={{ padding: '9px 10px', color: 'var(--color-muted)', textAlign: 'center' }}>{g.duration ? `${g.duration}hr` : '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center' }}>{g.refs ?? '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center' }}>{g.linesmen ?? '—'}</td>
                    <td style={{ padding: '9px 10px', textAlign: 'center' }}>{g.scorekeepers ?? '—'}</td>
                    <td style={{ padding: '9px 10px' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                        background: `${statusColors[g.status] ?? '#6b7280'}18`,
                        color: statusColors[g.status] ?? '#6b7280',
                        textTransform: 'capitalize',
                      }}>{g.status}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

// ── Shared inline styles ──────────────────────────────────────────────────────
const labelSt   = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }
const inputSt   = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }
const removeSt  = { background: 'var(--red-light)', color: 'var(--red)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
const addLinkSt = { background: 'none', border: 'none', color: 'var(--blue)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }
