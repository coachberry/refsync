import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useOfficialGames } from '@/hooks/useGames'
import { db } from '@/lib/firebase'
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState, Modal } from '@/components/ui'
import { Input, Select, Textarea } from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import styles from './GameReportForm.module.css'

const CATEGORIES = [
  'Game Misconduct',
  'Gross Misconduct',
  'Match Penalty',
  'Spectator Ejection',
  'Serious Injury',
  'Bench Minor',
  'Other Incident',
]

const REPORT_TYPES = [
  { id: 'ejection', label: '🚫 Ejection Report', desc: 'Player, coach, or spectator ejected from game' },
  { id: 'injury',   label: '🏥 Injury Report',   desc: 'Serious injury requiring medical attention' },
  { id: 'incident', label: '📋 Incident Report',  desc: 'Any other reportable incident' },
]

const PERIODS = ['1st Period', '2nd Period', '3rd Period', 'OT', 'SO', 'Pre-Game', 'Post-Game']

export default function GameReportForm() {
  const { user, profile } = useAuth()
  const { games, loading } = useOfficialGames()
  const [myReports, setMyReports]   = useState([])
  const [showForm, setShowForm]     = useState(false)
  const [selectedGame, setSelectedGame] = useState(null)
  const [saving, setSaving]         = useState(false)

  // Load my submitted reports
  useEffect(() => {
    if (!user) return
    getDocs(query(collection(db, 'gameReports'), where('submittedBy', '==', user.uid)))
      .then(snap => setMyReports(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
      .catch(() => {})
  }, [user, showForm])

  const recentGames = games
    .filter(g => {
      const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
      const daysSince = (Date.now() - gd.getTime()) / 86400000
      return daysSince <= 7 // last 7 days
    })
    .sort((a, b) => {
      const da = a.gameDate?.toDate?.() ?? new Date(a.gameDate)
      const db_ = b.gameDate?.toDate?.() ?? new Date(b.gameDate)
      return db_ - da
    })

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Game Reports</h1>
          <p className={styles.sub}>File incident, ejection, or injury reports. Must be submitted within 48 hours per USA Hockey requirements.</p>
        </div>
        <Button variant="primary" onClick={() => { setSelectedGame(null); setShowForm(true) }}>
          + File Report
        </Button>
      </div>

      {/* Pending reports banner — games in last 48hr */}
      {recentGames.length > 0 && (
        <Card>
          <CardHeader><CardTitle>⚡ Recent Games — File a Report If Needed</CardTitle></CardHeader>
          <CardBody noPadding>
            {recentGames.map(g => {
              const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
              const hasReport = myReports.some(r => r.gameId === g.id)
              const hoursAgo  = (Date.now() - gd.getTime()) / 3600000
              const overdue   = hoursAgo > 48
              return (
                <div key={g.id} className={styles.recentGame}>
                  <div className={styles.recentGameInfo}>
                    <div className={styles.recentGameTitle}>{g.homeTeam} vs {g.awayTeam}</div>
                    <div className={styles.recentGameMeta}>{format(gd, 'MMM d · h:mm a')} · {g.venue}</div>
                  </div>
                  {hasReport ? (
                    <Badge variant="green">Report Filed</Badge>
                  ) : overdue ? (
                    <Badge variant="red">48hr Passed</Badge>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => { setSelectedGame(g); setShowForm(true) }}>
                      File Report
                    </Button>
                  )}
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}

      {/* My reports history */}
      <Card>
        <CardHeader><CardTitle>My Submitted Reports</CardTitle></CardHeader>
        <CardBody noPadding>
          {myReports.length === 0 ? (
            <div style={{ padding:20 }}>
              <EmptyState icon="📋" title="No reports filed yet"
                message="File a report when an ejection, injury, or other reportable incident occurs during a game." />
            </div>
          ) : (
            myReports.map(r => {
              const gd = r.gameDate?.toDate?.() ?? (r.gameDate ? new Date(r.gameDate) : null)
              return (
                <div key={r.id} className={styles.reportRow}>
                  <div className={styles.reportInfo}>
                    <div className={styles.reportTitle}>{r.homeTeam} vs {r.awayTeam}</div>
                    <div className={styles.reportMeta}>
                      {gd ? format(gd, 'MMM d, yyyy') : '—'} · {r.category} · {r.reportType}
                    </div>
                    <div className={styles.reportDesc}>{r.incidentDescription?.slice(0, 100)}{r.incidentDescription?.length > 100 ? '…' : ''}</div>
                  </div>
                  <Badge variant={r.status === 'submitted' ? 'green' : 'amber'}>{r.status}</Badge>
                </div>
              )
            })
          )}
        </CardBody>
      </Card>

      {showForm && (
        <ReportFormModal
          open={showForm}
          onClose={() => { setShowForm(false); setSelectedGame(null) }}
          games={games}
          preselectedGame={selectedGame}
          user={user}
          profile={profile}
        />
      )}
    </div>
  )
}

function ReportFormModal({ open, onClose, games, preselectedGame, user, profile }) {
  const [saving, setSaving] = useState(false)
  const [form, setForm]     = useState({
    gameId:            preselectedGame?.id ?? '',
    reportType:        'ejection',
    category:          'Game Misconduct',
    // Involved party
    involvedName:      '',
    involvedNumber:    '',
    involvedType:      'player', // player | coach | spectator
    usahNumber:        '',
    // Incident details
    period:            '1st Period',
    timeElapsed:       '',
    injuryOccurred:    false,
    // Crew
    partner1Name:      '',
    partner1Number:    '',
    partner2Name:      '',
    partner2Number:    '',
    // Report
    incidentDescription: '',
    // Auto-filled
    rink:              preselectedGame?.venue ?? '',
    league:            '',
    levelOfPlay:       '',
  })
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const selectedGame = games.find(g => g.id === form.gameId) ?? preselectedGame

  useEffect(() => {
    if (selectedGame) {
      set('rink', selectedGame.venue ?? '')
    }
  }, [form.gameId])

  const handleSubmit = async () => {
    if (!form.gameId)              { toast.error('Select a game'); return }
    if (!form.incidentDescription.trim()) { toast.error('Incident description is required'); return }
    if (form.incidentDescription.trim().length < 50) { toast.error('Description must be at least 50 characters per USA Hockey requirements'); return }
    setSaving(true)
    try {
      const game = selectedGame
      const gd   = game?.gameDate?.toDate?.() ?? new Date(game?.gameDate)
      await addDoc(collection(db, 'gameReports'), {
        ...form,
        gameId:        form.gameId,
        homeTeam:      game?.homeTeam ?? '',
        awayTeam:      game?.awayTeam ?? '',
        gameDate:      game?.gameDate ?? null,
        venue:         game?.venue ?? '',
        division:      game?.division ?? '',
        submittedBy:   user.uid,
        submitterName: profile?.displayName,
        submitterUSAHNumber: profile?.officialProfile?.certNumber ?? '',
        status:        'submitted',
        submittedAt:   serverTimestamp(),
      })
      // Notify scheduler
      if (game?.schedulerId) {
        await addDoc(collection(db, 'notifications'), {
          uid:     game.schedulerId,
          type:    'report',
          title:   '📋 Game Report Filed',
          message: `${profile?.displayName} filed a ${form.reportType} report for ${game?.homeTeam} vs ${game?.awayTeam}`,
          read:    false,
          link:    '/scheduler',
          createdAt: serverTimestamp(),
        })
      }
      toast.success('Report submitted! File with USA Hockey within 48 hours.')
      onClose()
    } catch (err) { toast.error('Failed to submit: ' + err.message) }
    finally { setSaving(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="File Game Report" size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} onClick={handleSubmit}>Submit Report</Button>
        </>
      }
    >
      <div className={styles.formNote}>
        Per USA Hockey requirements, reports must be filed within 48 hours. This report is stored in GameCrewHQ and forwarded to your scheduler. You must also submit to USA Hockey's official portal at usahockey.com/incidentreport.
      </div>

      {/* Report type */}
      <div className={styles.section}>
        <div className={styles.sLabel}>Report Type</div>
        <div className={styles.typeGrid}>
          {REPORT_TYPES.map(t => (
            <div key={t.id}
              className={[styles.typeCard, form.reportType === t.id ? styles.typeCardActive : ''].join(' ')}
              onClick={() => set('reportType', t.id)}
            >
              <div className={styles.typeLabel}>{t.label}</div>
              <div className={styles.typeDesc}>{t.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Game */}
      <div className={styles.section}>
        <div className={styles.sLabel}>Game</div>
        <select className={styles.select} value={form.gameId} onChange={e => set('gameId', e.target.value)}>
          <option value="">Select game…</option>
          {games.map(g => {
            const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
            return <option key={g.id} value={g.id}>{format(gd, 'MMM d')} — {g.homeTeam} vs {g.awayTeam} ({g.venue})</option>
          })}
        </select>
      </div>

      {/* Game info auto-filled */}
      {selectedGame && (
        <div className={styles.gameInfoRow}>
          <span>🏟 {selectedGame.venue}</span>
          <span>📅 {format(selectedGame.gameDate?.toDate?.() ?? new Date(selectedGame.gameDate), 'MMM d, yyyy')}</span>
          <span>🎯 {selectedGame.division}</span>
        </div>
      )}

      {/* Category + Level */}
      <div className={styles.formRow}>
        <div style={{ flex:1 }}>
          <label className={styles.label}>Category</label>
          <select className={styles.select} value={form.category} onChange={e => set('category', e.target.value)}>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex:1 }}>
          <label className={styles.label}>Level of Play</label>
          <input className={styles.input} placeholder="e.g. 14U AA, Adult Rec" value={form.levelOfPlay} onChange={e => set('levelOfPlay', e.target.value)} />
        </div>
      </div>

      {/* League */}
      <div>
        <label className={styles.label}>League / Tournament</label>
        <input className={styles.input} placeholder="e.g. Metro Nashville Youth Hockey" value={form.league} onChange={e => set('league', e.target.value)} />
      </div>

      {/* Involved party */}
      <div className={styles.section}>
        <div className={styles.sLabel}>Involved Party</div>
        <div className={styles.formRow}>
          <div style={{ flex:1 }}>
            <label className={styles.label}>Type</label>
            <select className={styles.select} value={form.involvedType} onChange={e => set('involvedType', e.target.value)}>
              <option value="player">Player</option>
              <option value="coach">Coach</option>
              <option value="spectator">Spectator</option>
            </select>
          </div>
          <div style={{ flex:1 }}>
            <label className={styles.label}>{form.involvedType === 'player' ? 'Jersey Number' : form.involvedType === 'coach' ? 'Position (e.g. Head Coach)' : 'Name'}</label>
            <input className={styles.input} value={form.involvedNumber} onChange={e => set('involvedNumber', e.target.value)} placeholder={form.involvedType === 'player' ? '#14' : ''} />
          </div>
        </div>
        <div className={styles.formRow}>
          <div style={{ flex:1 }}>
            <label className={styles.label}>Full Name</label>
            <input className={styles.input} value={form.involvedName} onChange={e => set('involvedName', e.target.value)} />
          </div>
          {form.involvedType === 'player' && (
            <div style={{ flex:1 }}>
              <label className={styles.label}>USA Hockey Confirmation #</label>
              <input className={styles.input} placeholder="Search by last name + state if unknown" value={form.usahNumber} onChange={e => set('usahNumber', e.target.value)} />
            </div>
          )}
        </div>
      </div>

      {/* Incident details */}
      <div className={styles.section}>
        <div className={styles.sLabel}>Incident Details</div>
        <div className={styles.formRow}>
          <div style={{ flex:1 }}>
            <label className={styles.label}>Period</label>
            <select className={styles.select} value={form.period} onChange={e => set('period', e.target.value)}>
              {PERIODS.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ flex:1 }}>
            <label className={styles.label}>Time Elapsed (MM:SS)</label>
            <input className={styles.input} placeholder="14:32" value={form.timeElapsed} onChange={e => set('timeElapsed', e.target.value)} />
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:22 }}>
            <input type="checkbox" id="injury" checked={form.injuryOccurred}
              onChange={e => set('injuryOccurred', e.target.checked)}
              style={{ width:16, height:16 }} />
            <label htmlFor="injury" style={{ fontSize:13, cursor:'pointer' }}>Injury occurred</label>
          </div>
        </div>
      </div>

      {/* Officiating crew */}
      <div className={styles.section}>
        <div className={styles.sLabel}>Officiating Crew</div>
        <div className={styles.formRow}>
          <div style={{ flex:1 }}>
            <label className={styles.label}>Partner 1 Name</label>
            <input className={styles.input} value={form.partner1Name} onChange={e => set('partner1Name', e.target.value)} />
          </div>
          <div style={{ flex:1 }}>
            <label className={styles.label}>Partner 1 USAH #</label>
            <input className={styles.input} value={form.partner1Number} onChange={e => set('partner1Number', e.target.value)} />
          </div>
        </div>
        <div className={styles.formRow}>
          <div style={{ flex:1 }}>
            <label className={styles.label}>Partner 2 Name (if applicable)</label>
            <input className={styles.input} value={form.partner2Name} onChange={e => set('partner2Name', e.target.value)} />
          </div>
          <div style={{ flex:1 }}>
            <label className={styles.label}>Partner 2 USAH #</label>
            <input className={styles.input} value={form.partner2Number} onChange={e => set('partner2Number', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Incident description */}
      <div className={styles.section}>
        <div className={styles.sLabel}>Incident Description *</div>
        <textarea
          className={styles.textarea}
          rows={5}
          placeholder="Provide a detailed, factual description of the incident. Include what happened, who was involved, what was said or done, and all penalties assessed. Minimum 50 characters required by USA Hockey."
          value={form.incidentDescription}
          onChange={e => set('incidentDescription', e.target.value)}
        />
        <div style={{ fontSize:11.5, color: form.incidentDescription.length < 50 ? 'var(--orange)' : 'var(--green)', marginTop:4 }}>
          {form.incidentDescription.length} characters {form.incidentDescription.length < 50 ? `(${50 - form.incidentDescription.length} more needed)` : '✓'}
        </div>
      </div>
    </Modal>
  )
}
