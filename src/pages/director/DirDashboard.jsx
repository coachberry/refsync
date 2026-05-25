import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useGameGroups } from '@/hooks/useGameGroups'
import { useConnections } from '@/hooks/useConnections'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import styles from './DirDashboard.module.css'

export default function DirDashboard() {
  const { profile } = useAuth()
  const { groups, loading } = useGameGroups()
  const { pendingIncoming, accept, decline } = useConnections()
  const navigate = useNavigate()

  const totalGames  = groups.reduce((s, g) => s + (g.totalGames  ?? 0), 0)
  const totalFilled = groups.reduce((s, g) => s + (g.filledGames ?? 0), 0)

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Director Dashboard</h1>
          <p className={styles.sub}>Welcome back, {profile?.displayName?.split(' ')[0]}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/director/events')}>
          + Create Event
        </Button>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {[
          { icon: '🏆', label: 'Active Events', value: groups.filter(g => g.status === 'active').length },
          { icon: '🏒', label: 'Games Posted',  value: totalGames },
          { icon: '✅', label: 'Games Filled',  value: totalFilled },
          { icon: '⏳', label: 'Still Open',    value: totalGames - totalFilled },
        ].map((s, i) => (
          <div key={i} className={styles.stat}>
            <div className={styles.statIcon}>{s.icon}</div>
            <div className={styles.statValue}>{s.value}</div>
            <div className={styles.statLabel}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className={styles.grid}>
        {/* Scheduler connection requests (incoming from schedulers wanting to connect) */}
        <Card>
          <CardHeader>
            <CardTitle>Scheduler Requests</CardTitle>
            {pendingIncoming.length > 0 && (
              <Badge variant="amber">{pendingIncoming.length} pending</Badge>
            )}
          </CardHeader>
          <CardBody noPadding>
            {pendingIncoming.length === 0 ? (
              <EmptyState
                icon="🤝"
                title="No pending requests"
                message="Schedulers you invite will appear here."
              />
            ) : (
              pendingIncoming.map(conn => (
                <div key={conn.id} className={styles.connRow}>
                  <div className={styles.connIcon}>📋</div>
                  <div className={styles.connInfo}>
                    <div className={styles.connName}>{conn.fromName ?? 'Scheduler'}</div>
                    <div className={styles.connOrg}>{conn.organization ?? 'Scheduling Organization'}</div>
                  </div>
                  <div className={styles.connActions}>
                    <Button variant="teal" size="sm" onClick={() => accept(conn.id)}>Accept</Button>
                    <Button variant="ghost" size="sm" onClick={() => decline(conn.id)}>Decline</Button>
                  </div>
                </div>
              ))
            )}
          </CardBody>
        </Card>

        {/* Active events */}
        <Card>
          <CardHeader>
            <CardTitle>My Events</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => navigate('/director/events')}>View all</Button>
          </CardHeader>
          <CardBody noPadding>
            {loading ? (
              <div className={styles.center}><Spinner /></div>
            ) : groups.length === 0 ? (
              <EmptyState
                icon="🏆"
                title="No events yet"
                message="Create your first event to start posting games."
                action={{ label: 'Create Event', onClick: () => navigate('/director/events') }}
              />
            ) : (
              groups.slice(0, 4).map(g => (
                <div key={g.id} className={styles.eventRow}>
                  <div className={styles.eventInfo}>
                    <div className={styles.eventName}>{g.name}</div>
                    <div className={styles.eventMeta}>
                      {g.schedulerName ? `Scheduler: ${g.schedulerName}` : 'No scheduler assigned'}
                      {' · '}{g.totalGames ?? 0} games
                    </div>
                  </div>
                  <div className={styles.eventFill}>
                    <div className={styles.fillBar}>
                      <div
                        className={styles.fillProgress}
                        style={{ width: `${g.totalGames ? Math.round((g.filledGames / g.totalGames) * 100) : 0}%` }}
                      />
                    </div>
                    <div className={styles.fillText}>
                      {g.filledGames ?? 0}/{g.totalGames ?? 0} filled
                    </div>
                  </div>
                  <Badge variant={g.status === 'active' ? 'green' : 'amber'}>
                    {g.status ?? 'draft'}
                  </Badge>
                </div>
              ))
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
