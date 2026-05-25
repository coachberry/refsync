import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useAvailability } from '@/hooks/useAvailability'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval,
  startOfWeek, endOfWeek, isSameMonth, isSameDay, isToday,
  addMonths, subMonths, isBefore, startOfDay, parseISO
} from 'date-fns'
import styles from './OfficialAvailability.module.css'

const BLOCK_TYPES = {
  unavailable: { label: 'Unavailable', color: '#aa1a1a', bg: 'rgba(204,31,31,.08)', border: 'rgba(204,31,31,.3)', icon: '🚫' },
  available:   { label: 'Available',   color: '#007a65', bg: 'rgba(0,184,153,.1)',  border: 'var(--teal)',         icon: '✅' },
}

export default function OfficialAvailability() {
  const { user } = useAuth()
  const { blocks, loading, addBlock, removeBlock } = useAvailability()
  const [currentMonth, setCurrentMonth]   = useState(new Date())
  const [selectedDate, setSelectedDate]   = useState(null)
  const [showBlockForm, setShowBlockForm] = useState(false)
  const [blockForm, setBlockForm] = useState({
    type: 'unavailable',
    allDay: false,
    startTime: '09:00',
    endTime: '17:00',
    startLocation: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const today      = startOfDay(new Date())
  const monthStart = startOfMonth(currentMonth)
  const monthEnd   = endOfMonth(currentMonth)
  const calStart   = startOfWeek(monthStart, { weekStartsOn: 0 })
  const calEnd     = endOfWeek(monthEnd,     { weekStartsOn: 0 })
  const calDays    = eachDayOfInterval({ start: calStart, end: calEnd })

  const blocksForDate = (dateStr) => blocks.filter(b => b.date === dateStr)

  // Summarise a date for the calendar dot color
  const dateSummary = (dateStr) => {
    const dateBlocks = blocksForDate(dateStr)
    if (!dateBlocks.length) return null
    if (dateBlocks.some(b => b.type === 'unavailable')) return 'unavailable'
    return 'available'
  }

  const isPast = (day) => isBefore(startOfDay(day), today)

  const handleDayClick = (day) => {
    if (isPast(day)) return
    setSelectedDate(day)
    setShowBlockForm(false)
  }

  const handleSaveBlock = async () => {
    if (!selectedDate) return
    setSaving(true)
    await addBlock({
      date: format(selectedDate, 'yyyy-MM-dd'),
      type: blockForm.type,
      allDay: blockForm.allDay,
      startTime: blockForm.allDay ? null : blockForm.startTime,
      endTime:   blockForm.allDay ? null : blockForm.endTime,
      startLocation: blockForm.startLocation,
      notes: blockForm.notes,
    })
    setShowBlockForm(false)
    setBlockForm({ type: 'unavailable', allDay: false, startTime: '09:00', endTime: '17:00', startLocation: '', notes: '' })
    setSaving(false)
  }

  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null
  const selectedBlocks  = selectedDateStr ? blocksForDate(selectedDateStr) : []

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Availability</h1>
        <p className={styles.sub}>
          You are considered <strong>available</strong> by default. Add blocks for times you are unavailable or to mark specific windows as explicitly open.
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
                const dateStr   = format(day, 'yyyy-MM-dd')
                const summary   = dateSummary(dateStr)
                const past      = isPast(day)
                const isSelected = selectedDate && isSameDay(day, selectedDate)
                const inMonth   = isSameMonth(day, currentMonth)

                return (
                  <div
                    key={dateStr}
                    className={[
                      styles.calCell,
                      !inMonth      ? styles.otherMonth : '',
                      past          ? styles.pastDay    : '',
                      isToday(day)  ? styles.today      : '',
                      isSelected    ? styles.selected   : '',
                    ].join(' ')}
                    onClick={() => handleDayClick(day)}
                    title={past ? 'Past dates cannot be edited' : undefined}
                  >
                    <span className={styles.calCellDate}>{format(day, 'd')}</span>
                    {summary && !past && (
                      <span
                        className={styles.calCellDot}
                        style={{
                          background: isSelected || isToday(day)
                            ? 'rgba(255,255,255,.8)'
                            : summary === 'unavailable' ? 'var(--red)' : 'var(--teal)'
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </div>

            {/* Legend */}
            <div className={styles.legend}>
              <div className={styles.legendItem}>
                <div className={styles.legendDot} style={{ background: 'var(--color-border-strong)' }} />
                <span>No blocks (available)</span>
              </div>
              <div className={styles.legendItem}>
                <div className={styles.legendDot} style={{ background: 'var(--red)' }} />
                <span>Has unavailable block</span>
              </div>
              <div className={styles.legendItem}>
                <div className={styles.legendDot} style={{ background: 'var(--teal)' }} />
                <span>Explicitly available</span>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Day detail panel */}
        <div className={styles.detailPanel}>
          {selectedDate ? (
            <Card>
              <CardHeader>
                <CardTitle>{format(selectedDate, 'EEEE, MMMM d')}</CardTitle>
                <Button size="sm" variant="primary" onClick={() => setShowBlockForm(v => !v)}>
                  {showBlockForm ? 'Cancel' : '+ Add Block'}
                </Button>
              </CardHeader>
              <CardBody>

                {/* Default availability notice */}
                <div className={styles.defaultNotice}>
                  <span className={styles.defaultNoticeIcon}>ℹ️</span>
                  <span>You are <strong>available all day</strong> by default. Add blocks below for specific unavailable or available windows.</span>
                </div>

                {/* Add block form */}
                {showBlockForm && (
                  <div className={styles.blockForm}>
                    {/* Block type selector */}
                    <div className={styles.typeSelector}>
                      {Object.entries(BLOCK_TYPES).map(([type, meta]) => (
                        <button
                          key={type}
                          className={[styles.typeBtn, blockForm.type === type ? styles.typeBtnActive : ''].join(' ')}
                          style={blockForm.type === type ? { background: meta.bg, borderColor: meta.border, color: meta.color } : {}}
                          onClick={() => setBlockForm(f => ({ ...f, type }))}
                        >
                          {meta.icon} {meta.label}
                        </button>
                      ))}
                    </div>

                    {/* All day toggle */}
                    <div className={styles.allDayRow}>
                      <label className={styles.allDayLabel}>
                        <input
                          type="checkbox"
                          checked={blockForm.allDay}
                          onChange={e => setBlockForm(f => ({ ...f, allDay: e.target.checked }))}
                          className={styles.allDayCheck}
                        />
                        All day
                      </label>
                    </div>

                    {/* Time range — hidden when all day */}
                    {!blockForm.allDay && (
                      <div className={styles.formRow}>
                        <div className={styles.formField}>
                          <label className={styles.formLabel}>From</label>
                          <input
                            className={styles.formInput}
                            type="time"
                            value={blockForm.startTime}
                            onChange={e => setBlockForm(f => ({ ...f, startTime: e.target.value }))}
                          />
                        </div>
                        <div className={styles.formField}>
                          <label className={styles.formLabel}>To</label>
                          <input
                            className={styles.formInput}
                            type="time"
                            value={blockForm.endTime}
                            onChange={e => setBlockForm(f => ({ ...f, endTime: e.target.value }))}
                          />
                        </div>
                      </div>
                    )}

                    {/* Available block: show starting location */}
                    {blockForm.type === 'available' && (
                      <div className={styles.formField}>
                        <label className={styles.formLabel}>
                          Starting Location <span className={styles.formOptional}>(overrides home for mileage)</span>
                        </label>
                        <input
                          className={styles.formInput}
                          placeholder="e.g. 123 Main St, Nashville TN"
                          value={blockForm.startLocation}
                          onChange={e => setBlockForm(f => ({ ...f, startLocation: e.target.value }))}
                        />
                      </div>
                    )}

                    <div className={styles.formField}>
                      <label className={styles.formLabel}>Notes <span className={styles.formOptional}>(optional)</span></label>
                      <input
                        className={styles.formInput}
                        placeholder={blockForm.type === 'unavailable' ? 'e.g. Doctor appointment' : 'e.g. Available after my shift'}
                        value={blockForm.notes}
                        onChange={e => setBlockForm(f => ({ ...f, notes: e.target.value }))}
                      />
                    </div>

                    <Button variant="primary" fullWidth loading={saving} onClick={handleSaveBlock}>
                      Save Block
                    </Button>
                  </div>
                )}

                {/* Existing blocks */}
                {selectedBlocks.length === 0 && !showBlockForm && (
                  <div className={styles.noBlocks}>
                    No blocks added — you are available all day. Tap <strong>+ Add Block</strong> to add a specific unavailable or available window.
                  </div>
                )}

                {selectedBlocks.length > 0 && (
                  <div className={styles.blockList}>
                    {selectedBlocks.map(block => {
                      const meta = BLOCK_TYPES[block.type] ?? BLOCK_TYPES.unavailable
                      return (
                        <div
                          key={block.id}
                          className={styles.blockItem}
                          style={{ background: meta.bg, borderColor: meta.border }}
                        >
                          <div className={styles.blockItemLeft}>
                            <div className={styles.blockTypeLabel} style={{ color: meta.color }}>
                              {meta.icon} {meta.label}
                            </div>
                            <div className={styles.blockTime}>
                              {block.allDay
                                ? 'All day'
                                : `${block.startTime ?? ''} – ${block.endTime ?? ''}`
                              }
                            </div>
                            {block.startLocation && (
                              <div className={styles.blockDetail}>📍 {block.startLocation}</div>
                            )}
                            {block.notes && (
                              <div className={styles.blockDetail}>{block.notes}</div>
                            )}
                          </div>
                          <button className={styles.blockRemove} onClick={() => removeBlock(block.id)}>✕</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CardBody>
                <EmptyState
                  icon="📅"
                  title="Select a day"
                  message="Click any future date on the calendar to add availability blocks."
                />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
