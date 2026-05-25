import { useState, useEffect } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState } from '@/components/ui'
import { Spinner } from '@/components/ui/LoadingSpinner'
import styles from './OfficialStats.module.css'

export default function OfficialStats() {
  const { user, profile } = useAuth()
  const { isReferee, isScorekeeper } = useSubRoles()
  const [games, setGames]   = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    getDocs(query(
      collection(db, 'games'),
      where('assignedUids', 'array-contains', user.uid)
    )).then(snap => {
      setGames(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user])

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  // Separate ref vs SK games
  const refGames  = games.filter(g => {
    const me = g.assignedOfficials?.find(o => o.uid === user.uid)
    return me && me.role !== 'Scorekeeper'
  })
  const skGames   = games.filter(g => {
    const me = g.assignedOfficials?.find(o => o.uid === user.uid)
    return me && me.role === 'Scorekeeper'
  })

  const hasRefGames = refGames.length > 0
  const hasSKGames  = skGames.length > 0  || isScorekeeper

  // Calculate stats
  const calcStats = (gameList) => {
    const completed = gameList.filter(g => g.status === 'completed')
    const totalPay  = gameList.reduce((s, g) => {
      const me = g.assignedOfficials?.find(o => o.uid === user.uid)
      return s + (me?.pay ?? g.payRate ?? 0)
    }, 0)
    const hours = gameList.reduce((s, g) => s + (g.duration ?? 1.5), 0)
    return {
      total:     gameList.length,
      completed: completed.length,
      upcoming:  gameList.filter(g => {
        const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
        return gd > new Date() && g.status !== 'completed'
      }).length,
      totalPay,
      hours: hours.toFixed(1),
    }
  }

  const refStats = calcStats(refGames)
  const skStats  = calcStats(skGames)

  // Current year games
  const thisYear = new Date().getFullYear()
  const refThisYear = refGames.filter(g => {
    const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
    return gd.getFullYear() === thisYear
  }).length
  const skThisYear = skGames.filter(g => {
    const gd = g.gameDate?.toDate?.() ?? new Date(g.gameDate)
    return gd.getFullYear() === thisYear
  }).length

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>My Stats</h1>
        <p className={styles.sub}>{thisYear} season · All time</p>
      </div>

      {/* Referee stats — only show if they have ref games */}
      {isReferee && hasRefGames && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>🏒 Referee</div>
          <div className={styles.statsGrid}>
            <StatCard label="Games This Year" value={refThisYear} icon="📅" />
            <StatCard label="Total Games"     value={refStats.total} icon="🏒" />
            <StatCard label="Completed"       value={refStats.completed} icon="✅" />
            <StatCard label="Upcoming"        value={refStats.upcoming} icon="⏭" />
            <StatCard label="Total Hours"     value={`${refStats.hours}h`} icon="⏱" />
            <StatCard label="Total Earned"    value={`$${refStats.totalPay.toFixed(0)}`} icon="💰" color="var(--teal)" />
          </div>
        </div>
      )}

      {/* Scorekeeper stats — show if signed up as SK (even with 0 games) */}
      {isScorekeeper && hasSKGames && (
        <div className={styles.section}>
          <div className={styles.sectionLabel}>📋 Scorekeeper</div>
          <div className={styles.statsGrid}>
            <StatCard label="Games This Year" value={skThisYear} icon="📅" />
            <StatCard label="Total Games"     value={skStats.total} icon="📋" />
            <StatCard label="Completed"       value={skStats.completed} icon="✅" />
            <StatCard label="Upcoming"        value={skStats.upcoming} icon="⏭" />
            <StatCard label="Total Hours"     value={`${skStats.hours}h`} icon="⏱" />
            <StatCard label="Total Earned"    value={`$${skStats.totalPay.toFixed(0)}`} icon="💰" color="var(--teal)" />
          </div>
          {skGames.length === 0 && (
            <div className={styles.zeroNote}>No scorekeeper games yet — stats will appear here after your first game.</div>
          )}
        </div>
      )}

      {/* No stats yet */}
      {!hasRefGames && !hasSKGames && (
        <Card>
          <CardBody>
            <EmptyState icon="📊" title="No stats yet"
              message="Your game stats will appear here after you've been assigned and completed games." />
          </CardBody>
        </Card>
      )}

      {/* Recent games list */}
      {games.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Recent Games</CardTitle></CardHeader>
          <CardBody noPadding>
            {games.slice(0, 10).map(game => {
              const me = game.assignedOfficials?.find(o => o.uid === user.uid)
              const gd = game.gameDate?.toDate?.() ?? new Date(game.gameDate)
              const isSK = me?.role === 'Scorekeeper'
              return (
                <div key={game.id} className={styles.gameRow}>
                  <div className={styles.gameIcon}>{isSK ? '📋' : '🏒'}</div>
                  <div className={styles.gameInfo}>
                    <div className={styles.gameTitle}>{game.homeTeam} vs {game.awayTeam}</div>
                    <div className={styles.gameMeta}>
                      {gd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      {' · '}{game.venue}
                      {me?.role && ` · ${me.role}`}
                    </div>
                  </div>
                  <div className={styles.gamePay}>${(me?.pay ?? game.payRate ?? 0).toFixed(0)}</div>
                  <Badge variant={game.status === 'completed' ? 'green' : game.status === 'assigned' ? 'blue' : 'amber'}>
                    {game.status}
                  </Badge>
                </div>
              )
            })}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statValue} style={{ color }}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}
