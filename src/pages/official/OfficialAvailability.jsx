import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, isBefore, startOfDay
} from 'date-fns'
import styles from './OfficialAvailability.module.css'
import toast from 'react-hot-toast'

/**
 * Availability model — unavailable by default.
 * Each day stored under users/{uid}/availability/{yyyy-MM-dd}:
 * {
 *   status: 'available_all_day' | 'unavailable_all_day' | 'partial',
 *   windows: [{ start: 'HH:MM', end: 'HH:MM' }]  // only when partial
 * }
 * Absence of a record = unavailable_all_day
 */

const STATUS_META = {
  unavailable_all_day: { label: 'Unavailable all day', icon: '🚫', color: 'var(--orange)', bg: 'var(--orange-light)' },
  available_all_day:   { label: 'Available all day',   icon: '✅', color: 'var(--green)',  bg: 'var(--green-light)'  },
  partial:             { label: 'Partial availability', icon: '🕐', color: 'var(--blue)',   bg: 'var(--blue-light)'   },
}

const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const fromMins = (m) => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`

export function isAvailableForWindow(dayData, neededStart, neededEnd) {
  if (!dayData || dayData.status === 'unavailable_all_day') return false
  if (dayData.status === 'available_all_day') return true
  if (dayData.status === 'partial') {
    const ns = toMins(neededStart), ne = toMins(neededEnd)
    return (dayData.windows ?? []).some(w => toMins(w.start) <= ns && toMins(w.end) >= ne)
  }
  return false
}

export default function OfficialAvailability() {
  const { user } = useAuth()
  const [availability, setAvailability] = useState({}) // { 'yyyy-MM-dd': { status, windows } }
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [dayDraft, setDayDraft]   = useState(null) // draft edits for selected day
  const [windowForm, setWindowForm] = useState({ start: '09:00', end: '17:00' })

  const today    = startOfDay(new Date())
  const isPast   = (d) => isBefore(startOfDay(d), today)
  const calDays  = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }),
    end:   endOfWeek(endOfMonth(currentMonth),     { weekStartsOn: 0 }),
  })

  // Load availability from Firestore
  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid, 'availability', 'data'))
      .then(snap => {
        if (snap.exists()) setAvailability(snap.data())
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [user])

  const getDayData = (dateStr) => availability[dateStr] ?? { status: 'unavailable_all_day', windows: [] }
  const getDayStatus = (dateStr) => getDayData(dateStr).status

  const handleDayClick = (day) => {
    if (isPast(day)) return
    const dateStr = format(day, 'yyyy-MM-dd')
    setSelectedDate(day)
    setDayDraft({ ...getDayData(dateStr) })
  }

  const setDraftStatus = (status) => {
    setDayDraft(d => ({ ...d, status, windows: status === 'partial' ? (d.windows ?? []) : [] }))
  }

  const addWindow = () => {
    if (toMins(windowForm.start) >= toMins(windowForm.end)) {
      toast.error('End time must be after start time'); return
    }
    setDayDraft(d => ({
      ...d,
      windows: [...(d.windows ?? []), { start: windowForm.start, end: windowForm.end }]
        .sort((a, b) => toMins(a.start) - toMins(b.start))
    }))
    setWindowForm({ start: '09:00', end: '17:00' })
  }

  const removeWindow = (i) => setDayDraft(d => ({ ...d, windows: d.windows.filter((_, idx) => idx !== i) }))

  const handleSave = async () => {
    if (!selectedDate || !dayDraft) return
    if (dayDraft.status === 'partial' && (!dayDraft.windows || dayDraft.windows.length === 0)) {
      toast.error('Add at least one available time window, or choose "Unavailable all day"'); return
    }
    setSaving(true)
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd')
      const updated = { ...availability, [dateStr]: dayDraft }
      await setDoc(doc(db, 'users', user.uid, 'availability', 'data'), updated)
      setAvailability(updated)
      toast.success('Availability saved')
    } catch (err) { toast.error('Failed to save: ' + err.message) }
    finally { setSaving(false) }
  }

  const handleClearDay = async () => {
    if (!selectedDate) return
    const dateStr = format(selectedDate, 'yyyy-MM-dd')
    const updated = { ...availability }
    delete updated[dateStr]
    setSaving(true)
    try {
      await setDoc(doc(db, 'users', user.uid, 'availability', 'data'), updated)
      setAvailability(updated)
      setDayDraft({ status: 'unavailable_all_day', windows: [] })
      toast.success('Day reset to unavailable')
    } catch { toast.error('Failed to reset') }
    finally { setSaving(false) }
  }

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Availability</h1>
        <p className={styles.sub}>
          You are <strong>unavailable by default</strong>. Mark the days and times when you are available to work games.
        </p>
      </div>

      <div className={styles.layout}>
        {/* Calendar */}
        <Card>
          <CardHeader>
            <div className={styles.calNav}>
              <button className={styles.calNavBtn} onClick={() => setCurrentMonth(m => subMonths(m, 1))}>‹</button>
              <span className={styles.calMonth}>{format(currentMonth, 'MMMM yyyy')}</span>
              <button className={styles.calNavBtn} onClick={() => setCurrentMonth(m => addMonths(m, 1))}>›</button>
            </div>
          </CardHeader>
          <CardBody>
            <div className={styles.calDayLabels}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                <div key={d} className={styles.calDayLabel}>{d}</div>
              ))}
            </div>
            <div className={styles.calGrid}>
              {calDays.map(day => {
                const dateStr    = format(day, 'yyyy-MM-dd')
                const status     = getDayStatus(dateStr)
                const past       = isPast(day)
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const inMonth    = isSameMonth(day, currentMonth)
                const dotColor   = status === 'available_all_day' ? 'var(--green)'
                                 : status === 'partial'           ? 'var(--blue)'
                                 : null // unavailable = no dot (default = unavailable, no need to show)
                return (
                  <div key={dateStr}
                    className={[
                      styles.calCell,
                      !inMonth     ? styles.otherMonth : '',
                      past         ? styles.pastDay    : '',
                      isToday(day) ? styles.today      : '',
                      isSelected   ? styles.selected   : '',
                    ].join(' ')}
                    onClick={() => handleDayClick(day)}
                  >
                    <span className={styles.calCellDate}>{format(day, 'd')}</span>
                    {dotColor && !past && (
                      <span className={styles.calCellDot} style={{
                        background: isSelected || isToday(day) ? 'rgba(255,255,255,.9)' : dotColor
                      }} />
                    )}
                  </div>
                )
              })}
            </div>

            <div className={styles.legend}>
              <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: 'var(--color-border-strong)' }} /><span>Unavailable (default)</span></div>
              <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: 'var(--green)' }} /><span>Available all day</span></div>
              <div className={styles.legendItem}><div className={styles.legendDot} style={{ background: 'var(--blue)' }} /><span>Partial availability</span></div>
            </div>
          </CardBody>
        </Card>

        {/* Day detail panel */}
        <div className={styles.detailPanel}>
          {selectedDate && dayDraft ? (
            <Card>
              <CardHeader>
                <CardTitle>{format(selectedDate, 'EEEE, MMMM d')}</CardTitle>
              </CardHeader>
              <CardBody>
                {/* Status selector */}
                <div className={styles.statusLabel}>Day Status</div>
                <div className={styles.statusOptions}>
                  {Object.entries(STATUS_META).map(([key, meta]) => (
                    <div key={key}
                      className={[styles.statusOption, dayDraft.status === key ? styles.statusActive : ''].join(' ')}
                      style={dayDraft.status === key ? { background: meta.bg, borderColor: meta.color } : {}}
                      onClick={() => setDraftStatus(key)}
                    >
                      <div className={styles.statusRadio} style={dayDraft.status === key ? { background: meta.color, borderColor: meta.color } : {}}>
                        {dayDraft.status === key && <div className={styles.statusRadioDot} />}
                      </div>
                      <div>
                        <div className={styles.statusOptionLabel}>{meta.icon} {meta.label}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Partial — time windows */}
                {dayDraft.status === 'partial' && (
                  <div className={styles.windowsSection}>
                    <div className={styles.windowsLabel}>Available Time Windows</div>
                    <p className={styles.windowsHint}>Add one or more windows when you are available. Times outside these windows are unavailable.</p>

                    {(dayDraft.windows ?? []).length === 0 && (
                      <div className={styles.noWindows}>No windows added yet — add your available times below.</div>
                    )}

                    {(dayDraft.windows ?? []).map((w, i) => (
                      <div key={i} className={styles.windowRow}>
                        <span className={styles.windowTime}>✅ {w.start} – {w.end}</span>
                        <button className={styles.windowRemove} onClick={() => removeWindow(i)}>✕</button>
                      </div>
                    ))}

                    <div className={styles.windowForm}>
                      <div className={styles.windowFormRow}>
                        <div className={styles.windowFormField}>
                          <label className={styles.windowFormLabel}>From</label>
                          <input type="time" className={styles.timeInput} value={windowForm.start}
                            onChange={e => setWindowForm(f => ({ ...f, start: e.target.value }))} />
                        </div>
                        <div className={styles.windowFormField}>
                          <label className={styles.windowFormLabel}>To</label>
                          <input type="time" className={styles.timeInput} value={windowForm.end}
                            onChange={e => setWindowForm(f => ({ ...f, end: e.target.value }))} />
                        </div>
                        <Button variant="secondary" size="sm" onClick={addWindow} style={{ marginTop: 20 }}>+ Add</Button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save / reset */}
                <div className={styles.dayActions}>
                  <Button variant="primary" fullWidth loading={saving} onClick={handleSave}>
                    Save Availability
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleClearDay}>
                    Reset to Unavailable
                  </Button>
                </div>
              </CardBody>
            </Card>
          ) : (
            <Card><CardBody>
              <EmptyState icon="📅" title="Select a day"
                message="Click any future date on the calendar to set your availability." />
            </CardBody></Card>
          )}
        </div>
      </div>
    </div>
  )
}
