import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { Spinner } from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, isBefore, startOfDay
} from 'date-fns'
import styles from './OfficialAvailability.module.css'
import toast from 'react-hot-toast'

const HOUR_HEIGHT = 56 // px per hour
const HOURS = Array.from({ length: 24 }, (_, i) => i)

const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }
const minsToTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
const formatHour = (h) => h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`

// Given a list of available windows, compute unavailable gaps between midnight and midnight
const invertWindows = (windows, dayStatus) => {
  if (dayStatus === 'available_all_day') return []
  if (dayStatus === 'unavailable_all_day') return [{ start: 0, end: 1440 }]
  // partial: fill gaps
  const sorted = [...windows].sort((a, b) => toMins(a.start) - toMins(b.start))
  const unavail = []
  let cursor = 0
  for (const w of sorted) {
    const ws = toMins(w.start), we = toMins(w.end)
    if (ws > cursor) unavail.push({ start: cursor, end: ws })
    cursor = Math.max(cursor, we)
  }
  if (cursor < 1440) unavail.push({ start: cursor, end: 1440 })
  return unavail
}

export default function OfficialAvailability() {
  const { user } = useAuth()
  const [availability, setAvailability] = useState({})
  const [loading, setLoading]     = useState(true)
  const [saving, setSaving]       = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [dayDraft, setDayDraft]   = useState(null)
  const [dragging, setDragging]   = useState(null) // { startMin, endMin, mode }
  const timelineRef = useRef(null)

  const today  = startOfDay(new Date())
  const isPast = (d) => isBefore(startOfDay(d), today)
  const calDays = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 0 }),
    end:   endOfWeek(endOfMonth(currentMonth),     { weekStartsOn: 0 }),
  })

  useEffect(() => {
    if (!user) return
    getDoc(doc(db, 'users', user.uid, 'availability', 'data'))
      .then(snap => { if (snap.exists()) setAvailability(snap.data()); setLoading(false) })
      .catch(() => setLoading(false))
  }, [user])

  const getDayData   = (ds) => availability[ds] ?? { status: 'unavailable_all_day', windows: [] }
  const getDayStatus = (ds) => getDayData(ds).status

  const handleDayClick = (day) => {
    if (isPast(day)) return
    setSelectedDate(day)
    const ds = format(day, 'yyyy-MM-dd')
    setDayDraft(JSON.parse(JSON.stringify(getDayData(ds))))
  }

  // ── Timeline drag to add/remove available windows ───────────────────────────
  const yToMin = (y) => {
    const rect = timelineRef.current?.getBoundingClientRect()
    if (!rect) return 0
    return Math.round(Math.max(0, Math.min(1440, (y - rect.top) / HOUR_HEIGHT * 60)) / 15) * 15
  }

  const handleTimelineMouseDown = (e) => {
    if (!dayDraft) return
    e.preventDefault()
    const m = yToMin(e.clientY)
    setDragging({ startMin: m, endMin: m, mode: 'add' })
  }

  const handleTimelineMouseMove = useCallback((e) => {
    if (!dragging) return
    const m = yToMin(e.clientY)
    setDragging(d => ({ ...d, endMin: m }))
  }, [dragging])

  const handleTimelineMouseUp = useCallback(() => {
    if (!dragging || !dayDraft) { setDragging(null); return }
    const s = Math.min(dragging.startMin, dragging.endMin)
    const e = Math.max(dragging.startMin, dragging.endMin)
    if (e - s < 15) { setDragging(null); return }
    // Merge with existing windows
    const newWin = { start: minsToTime(s), end: minsToTime(e) }
    const merged = mergeWindows([...(dayDraft.windows ?? []), newWin])
    setDayDraft(d => ({ ...d, status: 'partial', windows: merged }))
    setDragging(null)
  }, [dragging, dayDraft])

  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleTimelineMouseMove)
      window.addEventListener('mouseup',  handleTimelineMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleTimelineMouseMove)
      window.removeEventListener('mouseup',  handleTimelineMouseUp)
    }
  }, [dragging, handleTimelineMouseMove, handleTimelineMouseUp])

  const mergeWindows = (wins) => {
    if (!wins.length) return []
    const sorted = [...wins].map(w => ({ s: toMins(w.start), e: toMins(w.end) })).sort((a,b) => a.s - b.s)
    const merged = [sorted[0]]
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1]
      if (sorted[i].s <= last.e) last.e = Math.max(last.e, sorted[i].e)
      else merged.push(sorted[i])
    }
    return merged.filter(w => w.e > w.s).map(w => ({ start: minsToTime(w.s), end: minsToTime(w.e) }))
  }

  const removeWindow = (i) => setDayDraft(d => ({ ...d, windows: (d.windows ?? []).filter((_,idx) => idx !== i) }))

  const setDayStatus = (status) => {
    setDayDraft(d => ({ ...d, status, windows: status === 'partial' ? (d.windows ?? []) : [] }))
  }

  const handleSave = async () => {
    if (!selectedDate || !dayDraft) return
    if (dayDraft.status === 'partial' && !dayDraft.windows?.length) {
      toast.error('Add at least one available time block, or choose a full-day status'); return
    }
    setSaving(true)
    try {
      const ds = format(selectedDate, 'yyyy-MM-dd')
      const updated = { ...availability, [ds]: dayDraft }
      await setDoc(doc(db, 'users', user.uid, 'availability', 'data'), updated)
      setAvailability(updated)
      toast.success('Availability saved')
    } catch (err) { toast.error('Failed to save') }
    finally { setSaving(false) }
  }

  const handleReset = async () => {
    if (!selectedDate) return
    const ds = format(selectedDate, 'yyyy-MM-dd')
    const updated = { ...availability }
    delete updated[ds]
    setSaving(true)
    try {
      await setDoc(doc(db, 'users', user.uid, 'availability', 'data'), updated)
      setAvailability(updated)
      setDayDraft({ status: 'unavailable_all_day', windows: [] })
      toast.success('Reset to unavailable')
    } catch { toast.error('Failed to reset') }
    finally { setSaving(false) }
  }

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null

  // Drag preview block
  const dragBlock = dragging && dragging.endMin !== dragging.startMin ? {
    s: Math.min(dragging.startMin, dragging.endMin),
    e: Math.max(dragging.startMin, dragging.endMin),
  } : null

  // Unavailable blocks for rendering
  const unavailBlocks = dayDraft ? invertWindows(dayDraft.windows ?? [], dayDraft.status) : []

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Availability</h1>
        <p className={styles.sub}>Unavailable by default. Click a day to set when you are available.</p>
      </div>

      <div className={styles.layout}>
        {/* ── Month calendar ── */}
        <div className={styles.calCard}>
          <div className={styles.calNav}>
            <button className={styles.calNavBtn} onClick={() => setCurrentMonth(m => subMonths(m, 1))}>‹</button>
            <span className={styles.calMonth}>{format(currentMonth, 'MMMM yyyy')}</span>
            <button className={styles.calNavBtn} onClick={() => setCurrentMonth(m => addMonths(m, 1))}>›</button>
          </div>

          <div className={styles.calDayLabels}>
            {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className={styles.calDayLabel}>{d}</div>)}
          </div>

          <div className={styles.calGrid}>
            {calDays.map(day => {
              const ds = format(day, 'yyyy-MM-dd')
              const status = getDayStatus(ds)
              const past   = isPast(day)
              const isSel  = selectedDate && isSameDay(day, selectedDate)
              const inMo   = isSameMonth(day, currentMonth)
              const hasEntry = !!availability[ds]
              return (
                <div key={ds}
                  className={[
                    styles.calCell,
                    !inMo   ? styles.otherMonth : '',
                    past    ? styles.pastDay    : '',
                    isToday(day) ? styles.today : '',
                    isSel   ? styles.selected   : '',
                    !past && inMo && status === 'available_all_day'     ? styles.cellAvail   : '',
                    !past && inMo && status === 'partial'               ? styles.cellPartial  : '',
                    !past && inMo && status === 'unavailable_all_day' && hasEntry ? styles.cellUnavail : '',
                  ].join(' ')}
                  onClick={() => handleDayClick(day)}
                >
                  <span className={styles.calCellDate}>{format(day, 'd')}</span>
                </div>
              )
            })}
          </div>

          <div className={styles.legend}>
            <div className={styles.legendItem}><div className={styles.legendBox} style={{ background: 'rgba(255,97,0,.15)', border: '1.5px solid #FF6100' }} /><span>Unavailable</span></div>
            <div className={styles.legendItem}><div className={styles.legendBox} style={{ background: 'rgba(0,191,99,.15)', border: '1.5px solid #00BF63' }} /><span>Available all day</span></div>
            <div className={styles.legendItem}><div className={styles.legendBox} style={{ background: 'rgba(37,99,235,.12)', border: '1.5px solid #2563eb' }} /><span>Partial</span></div>
          </div>
        </div>

        {/* ── Day view ── */}
        <div className={styles.dayPanel}>
          {selectedDate && dayDraft ? (
            <>
              <div className={styles.dayFooter}>
                <Button variant="primary" loading={saving} onClick={handleSave}>Save</Button>
                <Button variant="ghost"  onClick={handleReset}>Reset to unavailable</Button>
              </div>

              <div className={styles.dayHeader}>
                <div>
                  <div className={styles.dayTitle}>{format(selectedDate, 'EEEE, MMMM d')}</div>
                  <div className={styles.dayStatus}>
                    {dayDraft.status === 'unavailable_all_day' && <span className={styles.badgeUnavail}>Unavailable all day</span>}
                    {dayDraft.status === 'available_all_day'   && <span className={styles.badgeAvail}>Available all day</span>}
                    {dayDraft.status === 'partial'             && <span className={styles.badgePartial}>{dayDraft.windows?.length ?? 0} available window{(dayDraft.windows?.length ?? 0) !== 1 ? 's' : ''}</span>}
                  </div>
                </div>
                <div className={styles.dayStatusBtns}>
                  <button className={[styles.statusBtn, dayDraft.status === 'unavailable_all_day' ? styles.statusBtnActiveRed : ''].join(' ')}
                    onClick={() => setDayStatus('unavailable_all_day')}>Unavailable all day</button>
                  <button className={[styles.statusBtn, dayDraft.status === 'available_all_day' ? styles.statusBtnActiveGreen : ''].join(' ')}
                    onClick={() => setDayStatus('available_all_day')}>Available all day</button>
                  <button className={[styles.statusBtn, dayDraft.status === 'partial' ? styles.statusBtnActiveBlue : ''].join(' ')}
                    onClick={() => setDayStatus('partial')}>Set specific times</button>
                </div>
              </div>

              {/* Timeline */}
              <div className={styles.timelineWrap}>
                <div className={styles.timelineHint}>
                  {dayDraft.status === 'partial'
                    ? 'Drag on the timeline to add available time blocks. Click a block to remove it.'
                    : dayDraft.status === 'available_all_day'
                    ? 'All hours are available. Switch to "Set specific times" to customize.'
                    : 'No hours are available. Switch to "Set specific times" to mark some as available.'}
                </div>

                <div
                  className={styles.timeline}
                  ref={timelineRef}
                  onMouseDown={dayDraft.status === 'partial' ? handleTimelineMouseDown : undefined}
                  style={{ cursor: dayDraft.status === 'partial' ? 'crosshair' : 'default' }}
                >
                  {/* Hour grid lines */}
                  {HOURS.map(h => (
                    <div key={h} className={styles.hourRow} style={{ height: HOUR_HEIGHT }}>
                      <div className={styles.hourLabel}>{formatHour(h)}</div>
                      <div className={styles.hourLine} />
                    </div>
                  ))}
                  {/* End line */}
                  <div className={styles.hourRow} style={{ height: 1 }}>
                    <div className={styles.hourLabel}>12 AM</div>
                    <div className={styles.hourLine} />
                  </div>

                  {/* Unavailable blocks (red) */}
                  {unavailBlocks.map((b, i) => (
                    <div key={i} className={styles.blockUnavail} style={{
                      top: (b.start / 60) * HOUR_HEIGHT,
                      height: ((b.end - b.start) / 60) * HOUR_HEIGHT,
                    }}>
                      <span className={styles.blockLabel}>Unavailable</span>
                    </div>
                  ))}

                  {/* Available windows (green) — only in partial mode */}
                  {dayDraft.status === 'partial' && (dayDraft.windows ?? []).map((w, i) => {
                    const s = toMins(w.start), e = toMins(w.end)
                    return (
                      <div key={i} className={styles.blockAvail} style={{
                        top: (s / 60) * HOUR_HEIGHT,
                        height: ((e - s) / 60) * HOUR_HEIGHT,
                      }}>
                        <span className={styles.blockLabel}>{w.start} – {w.end}</span>
                        <button className={styles.blockRemoveBtn} onMouseDown={ev => ev.stopPropagation()} onClick={() => removeWindow(i)}>✕</button>
                      </div>
                    )
                  })}

                  {/* Available all day overlay */}
                  {dayDraft.status === 'available_all_day' && (
                    <div className={styles.blockAvail} style={{ top: 0, height: 24 * HOUR_HEIGHT }}>
                      <span className={styles.blockLabel}>Available all day</span>
                    </div>
                  )}

                  {/* Drag preview */}
                  {dragBlock && (
                    <div className={styles.blockDrag} style={{
                      top: (dragBlock.s / 60) * HOUR_HEIGHT,
                      height: ((dragBlock.e - dragBlock.s) / 60) * HOUR_HEIGHT,
                    }}>
                      <span className={styles.blockLabel}>{minsToTime(dragBlock.s)} – {minsToTime(dragBlock.e)}</span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className={styles.dayEmpty}>
              <div className={styles.dayEmptyIcon}>📅</div>
              <div className={styles.dayEmptyTitle}>Select a day</div>
              <div className={styles.dayEmptySub}>Click any future date to set your availability</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
