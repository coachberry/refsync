import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useGameGroups } from '@/hooks/useGameGroups'
import { useConnections } from '@/hooks/useConnections'
import { doc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { createGameGroup, createGame, updateGameGroup, sendConnectionRequest } from '@/services/firestore'
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
  const [showReqSched, setShowReqSched]       = useState(false)
  const [showEditGroup, setShowEditGroup]     = useState(false)
  const [selectedGroup, setSelectedGroup]     = useState(null)

  const handleDelete = async (group) => {
    if (!window.confirm(`Delete "${group.name}"? This cannot be undone.`)) return
    try {
      await deleteDoc(doc(db, 'gameGroups', group.id))
      toast.success('Event deleted')
    } catch { toast.error('Failed to delete event') }
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
              onRequestScheduler={() => { setSelectedGroup(group); setShowReqSched(true) }}
              onEdit={() => { setSelectedGroup(group); setShowEditGroup(true) }}
              onDelete={() => handleDelete(group)} />
          ))}
        </div>
      )}

      <CreateGroupModal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} userId={user?.uid} userProfile={profile} />
      {selectedGroup && <EditGroupModal open={showEditGroup} onClose={() => { setShowEditGroup(false); setSelectedGroup(null) }} group={selectedGroup} />}
      {selectedGroup && <AddGamesModal open={showAddGames} onClose={() => { setShowAddGames(false); setSelectedGroup(null) }} group={selectedGroup} />}
      {selectedGroup && <RequestSchedulerModal open={showReqSched} onClose={() => { setShowReqSched(false); setSelectedGroup(null) }} group={selectedGroup} userId={user?.uid} userName={profile?.displayName} userEmail={profile?.email} connectedSchedulers={connectedSchedulers} />}
    </div>
  )
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({ group, onAddGames, onRequestScheduler, onEdit, onDelete }) {
  const hasGames = (group.totalGames ?? 0) > 0
  const fillPct  = hasGames ? Math.round((group.filledGames / group.totalGames) * 100) : 0
  const needsType = group.officialsNeeded ?? 'both'

  const officialsLabel = {
    both:         '🏒📋 Referees & Scorekeepers',
    referees:     '🏒 Referees Only',
    scorekeepers: '📋 Scorekeepers Only',
  }[needsType] ?? '—'

  const divisionLabels = group.divisions?.map(d => d.label).join(', ') ?? '—'
  const venueLabels    = group.venues?.join(', ') ?? '—'

  const totalHours  = group.totalHours ?? 0
  const totalGames  = group.totalGames ?? 0
  const refRate     = group.refInvoiceRate ?? group.invoiceRate ?? null
  const skRate      = group.skInvoiceRate  ?? null

  // Show estimated invoice per type
  const refEst = refRate && totalHours > 0
    ? `Ref invoice est: $${(refRate.hourlyRate * totalHours + refRate.perGameFee * totalGames).toFixed(2)}`
    : null
  const skEst = skRate && totalHours > 0
    ? `SK invoice est: $${(skRate.hourlyRate * totalHours + skRate.perGameFee * totalGames).toFixed(2)}`
    : null

  // Scheduler assignment status
  const hasRefSched = !!group.refSchedulerId || !!group.schedulerId
  const hasSKSched  = !!group.skSchedulerId

  return (
    <div className={styles.groupCard}>
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
            <span className={styles.infoRow}>📍 {venueLabels}</span>
            {refEst && <span className={styles.infoRow}>💰 {refEst}</span>}
            {skEst  && <span className={styles.infoRow}>💰 {skEst}</span>}
          </div>
        </div>
        <Badge variant={statusBadge(group.status ?? 'draft')}>{group.status ?? 'draft'}</Badge>
      </div>

      {hasGames && (
        <div className={styles.fillRow}>
          <div className={styles.fillMeta}>
            <span>{group.filledGames ?? 0} / {group.totalGames} games filled</span>
            <span className={styles.fillPct}>{fillPct}%</span>
          </div>
          <div className={styles.fillBar}><div className={styles.fillProgress} style={{ width: `${fillPct}%` }} /></div>
        </div>
      )}

      {/* Scheduler status per type */}
      <div className={styles.schedulerStatus}>
        {(needsType === 'referees' || needsType === 'both') && (
          <div className={hasRefSched ? styles.schedAssigned : styles.schedNone}>
            {hasRefSched ? `🏒 Ref Scheduler: ${group.schedulerName ?? group.refSchedulerName ?? 'Assigned'}` : '🏒 No referee scheduler assigned'}
          </div>
        )}
        {(needsType === 'scorekeepers' || needsType === 'both') && (
          <div className={hasSKSched ? styles.schedAssigned : styles.schedNone}>
            {hasSKSched ? `📋 SK Scheduler: ${group.skSchedulerName ?? 'Assigned'}` : '📋 No scorekeeper scheduler assigned'}
          </div>
        )}
      </div>

      <div className={styles.groupActions}>
        <Button size="sm" variant="secondary" onClick={onAddGames}>+ Add Games</Button>
        <Button size="sm" variant="primary"   onClick={onRequestScheduler}>Request Scheduler</Button>
        <Button size="sm" variant="ghost">View Games</Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
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
  const [form, setForm]                   = useState({ name: '', sport: 'Ice Hockey', startDate: '', endDate: '', notes: '' })
  const [venues, setVenues]               = useState([''])
  const [divisions, setDivisions]         = useState([])
  const [divisionInput, setDivisionInput] = useState('')
  const [dateError, setDateError]         = useState('')
  const [officialsNeeded, setOfficialsNeeded] = useState('both')
  // Billing rates — separate for refs and SCs
  const [refHourly, setRefHourly]   = useState('75')
  const [refPerGame, setRefPerGame] = useState('10')
  const [skHourly, setSkHourly]     = useState('20')
  const [skPerGame, setSkPerGame]   = useState('5')

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
        // Store rates per type
        refInvoiceRate: (officialsNeeded === 'referees' || officialsNeeded === 'both')
          ? { hourlyRate: Number(refHourly) || 75, perGameFee: Number(refPerGame) || 10 } : null,
        skInvoiceRate: (officialsNeeded === 'scorekeepers' || officialsNeeded === 'both')
          ? { hourlyRate: Number(skHourly) || 20, perGameFee: Number(skPerGame) || 5 } : null,
        directorName: userProfile?.displayName,
        organization: userProfile?.directorProfile?.organization ?? '',
        status: 'draft',
      }, userId)
      toast.success('Event created!')
      setForm({ name: '', sport: 'Ice Hockey', startDate: '', endDate: '', notes: '' })
      setVenues(['']); setDivisions([]); setDivisionInput('')
      onClose()
    } catch { toast.error('Failed to create event') }
    finally { setSaving(false) }
  }

  const needsRef = officialsNeeded === 'referees'     || officialsNeeded === 'both'
  const needsSK  = officialsNeeded === 'scorekeepers' || officialsNeeded === 'both'

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

      {/* Billing rates — shown per type */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ ...labelSt, marginBottom: 8 }}>Scheduler Billing Rates</label>
        {needsRef && (
          <BillingRateBlock
            title="🏒 Referee Scheduler Rate"
            hourlyRate={refHourly} perGameFee={refPerGame}
            onHourlyChange={setRefHourly} onPerGameChange={setRefPerGame}
          />
        )}
        {needsSK && (
          <BillingRateBlock
            title="📋 Scorekeeper Scheduler Rate"
            hourlyRate={skHourly} perGameFee={skPerGame}
            onHourlyChange={setSkHourly} onPerGameChange={setSkPerGame}
          />
        )}
      </div>

      <Textarea label="Notes for Scheduler" placeholder="Parking info, dress code, special instructions..." value={form.notes} onChange={e => set('notes', e.target.value)} />
    </Modal>
  )
}

// ── Edit Group Modal ──────────────────────────────────────────────────────────
function EditGroupModal({ open, onClose, group }) {
  const [saving, setSaving]               = useState(false)
  const [form, setForm]                   = useState({ name: group?.name ?? '', sport: group?.sport ?? 'Ice Hockey', startDate: group?.startDate ?? '', endDate: group?.endDate ?? '', notes: group?.notes ?? '' })
  const [venues, setVenues]               = useState(group?.venues ?? [''])
  const [divisions, setDivisions]         = useState(group?.divisions ?? [])
  const [divisionInput, setDivisionInput] = useState('')
  const [dateError, setDateError]         = useState('')
  const [officialsNeeded, setOfficialsNeeded] = useState(group?.officialsNeeded ?? 'both')
  const [refHourly, setRefHourly]   = useState(String(group?.refInvoiceRate?.hourlyRate ?? group?.invoiceRate?.hourlyRate ?? 75))
  const [refPerGame, setRefPerGame] = useState(String(group?.refInvoiceRate?.perGameFee ?? group?.invoiceRate?.perGameFee ?? 10))
  const [skHourly, setSkHourly]     = useState(String(group?.skInvoiceRate?.hourlyRate ?? 20))
  const [skPerGame, setSkPerGame]   = useState(String(group?.skInvoiceRate?.perGameFee ?? 5))

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
      const needsRef = officialsNeeded === 'referees'     || officialsNeeded === 'both'
      const needsSK  = officialsNeeded === 'scorekeepers' || officialsNeeded === 'both'
      await updateGameGroup(group.id, {
        ...form, venues: filledVenues, divisions, officialsNeeded,
        refInvoiceRate: needsRef ? { hourlyRate: Number(refHourly) || 75, perGameFee: Number(refPerGame) || 10 } : null,
        skInvoiceRate:  needsSK  ? { hourlyRate: Number(skHourly)  || 20, perGameFee: Number(skPerGame)  || 5  } : null,
      })
      toast.success('Event updated!'); onClose()
    } catch { toast.error('Failed to update event') }
    finally { setSaving(false) }
  }

  const needsRef = officialsNeeded === 'referees'     || officialsNeeded === 'both'
  const needsSK  = officialsNeeded === 'scorekeepers' || officialsNeeded === 'both'

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

      {/* Officials needed */}
      <div style={{ marginBottom: 14 }}>
        <label style={{ ...labelSt, marginBottom: 8 }}>Officials Needed</label>
        <Select value={officialsNeeded} onChange={e => setOfficialsNeeded(e.target.value)}>
          {OFFICIALS_NEEDED_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </div>

      {needsRef && <BillingRateBlock title="🏒 Referee Scheduler Rate" hourlyRate={refHourly} perGameFee={refPerGame} onHourlyChange={setRefHourly} onPerGameChange={setRefPerGame} />}
      {needsSK  && <BillingRateBlock title="📋 Scorekeeper Scheduler Rate" hourlyRate={skHourly} perGameFee={skPerGame} onHourlyChange={setSkHourly} onPerGameChange={setSkPerGame} />}

      <Textarea label="Notes for Scheduler" value={form.notes} onChange={e => set('notes', e.target.value)} />
    </Modal>
  )
}

// ── Add Games Modal ───────────────────────────────────────────────────────────
function AddGamesModal({ open, onClose, group }) {
  const [saving, setSaving] = useState(false)
  const [games, setGames]   = useState([emptyGame(group)])

  function emptyGame(g) {
    const crew = DEFAULT_CREW[g?.officialsNeeded ?? 'both']
    return { homeTeam: '', awayTeam: '', gameDate: '', gameTime: '', venue: '', division: '', duration: 1.5, customDuration: '', ...crew }
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
        groupId: group.id, groupName: group.name,
        directorId: group.directorId,
        schedulerId: group.schedulerId ?? group.refSchedulerId ?? null,
        skSchedulerId: group.skSchedulerId ?? null,
        sport: group.sport ?? 'Ice Hockey',
        officialsNeeded: group.officialsNeeded ?? 'both',
        // Crew slots
        refs: needsRef ? (g.refs ?? 2) : 0,
        linesmen: needsRef ? (g.linesmen ?? 2) : 0,
        scorekeepers: needsSK ? (g.scorekeepers ?? 1) : 0,
        gameDate: new Date(`${g.gameDate}T${g.gameTime || '12:00'}`),
        venue: g.venue || group.venues?.[0] || '',
        // Pay rates per type
        refPayRate: needsRef ? refRate.hourlyRate * getDur(g) : 0,
        skPayRate:  needsSK  ? skRate.hourlyRate  * getDur(g) : 0,
        payRate:    needsSK  ? skRate.hourlyRate  * getDur(g) : refRate.hourlyRate * getDur(g),
        assignedOfficials: [], assignedUids: [], requests: [], status: 'open',
      })))
      await updateGameGroup(group.id, {
        totalGames: (group.totalGames ?? 0) + valid.length,
        totalHours: (group.totalHours ?? 0) + addedHours,
        status: 'active',
      })
      toast.success(`${valid.length} game${valid.length > 1 ? 's' : ''} added!`)
      setGames([emptyGame(group)]); onClose()
    } catch { toast.error('Failed to add games') }
    finally { setSaving(false) }
  }

  const venues    = group?.venues    ?? []
  const divisions = group?.divisions ?? []

  return (
    <Modal open={open} onClose={onClose} title={`Add Games — ${group?.name ?? ''}`} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="secondary" onClick={addRow}>+ Add Game</Button><Button variant="primary" loading={saving} onClick={handleSave}>Save {games.length} Game{games.length > 1 ? 's' : ''}</Button></>}
    >
      {/* Invoice preview */}
      <div className={styles.invoicePreview}>
        <div className={styles.invoicePreviewItem}>
          <span>Total hours</span><strong>{totalHours.toFixed(2)} hrs</strong>
        </div>
        {needsRef && (
          <div className={styles.invoicePreviewItem}>
            <span>🏒 Ref invoice</span>
            <strong className={styles.invoiceAmt}>${refInvoice.toFixed(2)}</strong>
          </div>
        )}
        {needsSK && (
          <div className={styles.invoicePreviewItem}>
            <span>📋 SK invoice</span>
            <strong className={styles.invoiceAmt}>${skInvoice.toFixed(2)}</strong>
          </div>
        )}
        {needsSK && (
          <div className={styles.invoicePreviewItem}>
            <span>SK payroll (est.)</span>
            <strong className={styles.payAmt}>${skPayTotal.toFixed(2)}</strong>
          </div>
        )}
        <div className={styles.invoicePreviewNote} style={{ gridColumn: 'span 4' }}>
          {needsRef && `Ref: $${refRate.hourlyRate}/hr + $${refRate.perGameFee}/game  `}
          {needsSK  && `SK: $${skRate.hourlyRate}/hr + $${skRate.perGameFee}/game`}
        </div>
      </div>

      <div className={styles.gameRows}>
        {games.map((g, i) => (
          <div key={i} className={styles.gameRow}>
            <div className={styles.gameRowHeader}>
              <span className={styles.gameRowNum}>Game {i + 1}</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                {needsRef && <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>🏒 ${(refRate.hourlyRate * getDur(g)).toFixed(2)}/ref</span>}
                {needsSK  && <span style={{ fontSize: 12, color: 'var(--color-muted)' }}>📋 ${(skRate.hourlyRate * getDur(g)).toFixed(2)}/SK</span>}
                {games.length > 1 && <button style={removeSt} type="button" onClick={() => removeRow(i)}>✕ Remove</button>}
              </div>
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

            {/* Crew slots — only show if both needed */}
            {group?.officialsNeeded === 'both' && (
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
            )}
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Request Scheduler Modal ───────────────────────────────────────────────────
function RequestSchedulerModal({ open, onClose, group, userId, userName, userEmail, connectedSchedulers }) {
  const [saving, setSaving]           = useState(false)
  const [refEmail, setRefEmail]       = useState('')
  const [skEmail, setSkEmail]         = useState('')
  const [note, setNote]               = useState('')
  const [activeTab, setActiveTab]     = useState('ref')

  const officialsNeeded = group?.officialsNeeded ?? 'both'
  const needsRef = officialsNeeded === 'referees'     || officialsNeeded === 'both'
  const needsSK  = officialsNeeded === 'scorekeepers' || officialsNeeded === 'both'

  const refRate = group?.refInvoiceRate ?? { hourlyRate: 75, perGameFee: 10 }
  const skRate  = group?.skInvoiceRate  ?? { hourlyRate: 20, perGameFee: 5 }
  const totalHours = group?.totalHours ?? 0
  const totalGames = group?.totalGames ?? 0

  const refInvoice = needsRef ? (refRate.hourlyRate * totalHours + refRate.perGameFee * totalGames).toFixed(2) : null
  const skInvoice  = needsSK  ? (skRate.hourlyRate  * totalHours + skRate.perGameFee  * totalGames).toFixed(2) : null

  const sendRequest = async (type, toUid, toEmail, toName) => {
    const rate       = type === 'ref' ? refRate : skRate
    const invoiceAmt = type === 'ref' ? refInvoice : skInvoice
    setSaving(true)
    try {
      await sendConnectionRequest(userId, toUid ?? '__invite__', 'director-scheduler', {
        groupId: group.id, groupName: group.name,
        gameCount: group.totalGames ?? 0,
        fromName: userName, fromEmail: userEmail,
        inviteEmail: toUid ? undefined : toEmail,
        toName,
        organization: group.name,
        schedulerType: type, // 'ref' | 'sk'
        officialsNeeded: group.officialsNeeded,
        invoiceRate: rate,
        totalHours,
        note: note + (invoiceAmt ? `\n\nEstimated invoice: $${invoiceAmt} (${totalGames} games · ${totalHours}hrs @ $${rate.hourlyRate}/hr + $${rate.perGameFee}/game)` : ''),
        status: toUid ? 'pending' : 'invited',
      })
      toast.success(`Request sent${toName ? ` to ${toName}` : ` to ${toEmail}`}`)
      type === 'ref' ? setRefEmail('') : setSkEmail('')
    } catch { toast.error('Failed to send request') }
    finally { setSaving(false) }
  }

  const alreadyConnected = connectedSchedulers.filter(c => c.type === 'director-scheduler')

  const InvoiceSummary = ({ type, rate, amount }) => amount && totalHours > 0 ? (
    <div className={styles.invoiceSummaryBox}>
      <div className={styles.invSumTitle}>{type === 'ref' ? '🏒 Referee' : '📋 Scorekeeper'} Scheduler Invoice</div>
      <div className={styles.invSumRow}><span>{totalGames} games</span><span>{totalHours?.toFixed(2)} hrs</span></div>
      <div className={styles.invSumRow}><span>Rate</span><span>${rate.hourlyRate}/hr + ${rate.perGameFee}/game</span></div>
      <div className={styles.invSumTotal}><span>Estimated Invoice</span><strong>${amount}</strong></div>
    </div>
  ) : null

  const RequestSection = ({ type, email, onEmailChange, rate, invoiceAmt }) => (
    <div>
      <InvoiceSummary type={type} rate={rate} amount={invoiceAmt} />
      {alreadyConnected.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>Connected Schedulers</div>
          {alreadyConnected.map(conn => (
            <div key={conn.id} className={styles.schedOption}>
              <div className={styles.schedOptionInfo}>
                <div className={styles.schedOptionName}>{conn.toName ?? conn.fromName ?? 'Scheduler'}</div>
              </div>
              <Button size="sm" variant="primary" loading={saving} onClick={() => sendRequest(type, conn.toUid ?? conn.fromUid, null, conn.toName ?? 'Scheduler')}>Request</Button>
            </div>
          ))}
          <hr className={styles.divider} />
        </div>
      )}
      <div className={styles.section}>
        <div className={styles.sectionLabel}>Invite by Email</div>
        <Input label="Scheduler's Email" placeholder="scheduler@example.com" value={email} onChange={e => onEmailChange(e.target.value)} />
        <Button variant="primary" fullWidth loading={saving} onClick={() => sendRequest(type, null, email, null)}>Send Request</Button>
      </div>
    </div>
  )

  // If only one type needed, show directly without tabs
  if (!needsRef || !needsSK) {
    const type = needsRef ? 'ref' : 'sk'
    const rate = needsRef ? refRate : skRate
    const amt  = needsRef ? refInvoice : skInvoice
    const email = needsRef ? refEmail : skEmail
    const setEmail = needsRef ? setRefEmail : setSkEmail

    return (
      <Modal open={open} onClose={onClose} title={`Request ${needsRef ? 'Referee' : 'Scorekeeper'} Scheduler — ${group?.name ?? ''}`} size="md"
        footer={<><Textarea label="Note (optional)" placeholder="Any special instructions…" value={note} onChange={e => setNote(e.target.value)} rows={2} /><Button variant="ghost" onClick={onClose}>Close</Button></>}
      >
        <RequestSection type={type} email={email} onEmailChange={setEmail} rate={rate} invoiceAmt={amt} />
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={`Request Schedulers — ${group?.name ?? ''}`} size="md"
      footer={<Button variant="ghost" onClick={onClose}>Close</Button>}
    >
      <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        This event needs both referees and scorekeepers. You can request a different scheduler for each, or the same scheduler for both.
      </p>

      {/* Tabs */}
      <div className={styles.reqTabs}>
        <button className={[styles.reqTab, activeTab === 'ref' ? styles.reqTabActive : ''].join(' ')} onClick={() => setActiveTab('ref')}>
          🏒 Referee Scheduler
        </button>
        <button className={[styles.reqTab, activeTab === 'sk' ? styles.reqTabActive : ''].join(' ')} onClick={() => setActiveTab('sk')}>
          📋 Scorekeeper Scheduler
        </button>
      </div>

      {activeTab === 'ref' && <RequestSection type="ref" email={refEmail} onEmailChange={setRefEmail} rate={refRate} invoiceAmt={refInvoice} />}
      {activeTab === 'sk'  && <RequestSection type="sk"  email={skEmail}  onEmailChange={setSkEmail}  rate={skRate}  invoiceAmt={skInvoice} />}

      <div className={styles.section} style={{ marginTop: 8 }}>
        <Textarea label="Note (optional)" placeholder="Any special instructions for the scheduler…" value={note} onChange={e => setNote(e.target.value)} rows={2} />
      </div>
    </Modal>
  )
}

// ── Shared inline styles ──────────────────────────────────────────────────────
const labelSt   = { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }
const inputSt   = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--color-border)', background: 'var(--color-surface)', fontSize: 13, fontFamily: 'var(--font-body)', outline: 'none' }
const removeSt  = { background: 'var(--red-light)', color: 'var(--red)', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }
const addLinkSt = { background: 'none', border: 'none', color: 'var(--blue)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: 0 }
