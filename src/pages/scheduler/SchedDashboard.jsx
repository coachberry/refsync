import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useGameGroups } from '@/hooks/useGameGroups'
import { useConnections } from '@/hooks/useConnections'
import { Card, CardHeader, CardTitle, CardBody, Badge, EmptyState } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { Avatar } from '@/components/ui/Avatar'
import styles from './SchedDashboard.module.css'

export default function SchedDashboard() {
  const { profile } = useAuth()
  const { isRefScheduler, isSKScheduler, isBothScheduler } = useSubRoles()
  const { groups, loading: groupsLoading } = useGameGroups()
  const { pendingIncoming, accept, decline } = useConnections()
  const navigate = useNavigate()

  const totalOpen  = groups.reduce((s, g) => s + ((g.totalGames ?? 0) - (g.filledGames ?? 0)), 0)
  const totalGames = groups.reduce((s, g) => s + (g.totalGames ?? 0), 0)

  // Split groups by type if both roles
  const refGroups = groups.filter(g => !g.type || g.type === 'referee' || g.type === 'both')
  const skGroups  = groups.filter(g => g.type === 'scorekeeper' || g.type === 'both')

  const roleLabel = isBothScheduler
    ? 'Referee & Scorekeeper Scheduler'
    : isRefScheduler
    ? 'Referee Scheduler'
    : 'Scorekeeper Scheduler'

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.sub}>Welcome back, {profile?.displayName?.split(' ')[0]} · {roleLabel}</p>
        </div>
        <Button variant="primary" onClick={() => navigate('/scheduler/groups')}>
          View Game Groups
        </Button>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        <StatCard icon="📋" label="Active Groups"   value={groups.length} />
        <StatCard icon="🏒" label="Total Games"     value={totalGames} />
        <StatCard icon="⚠️" label="Open / Unfilled" value={totalOpen} />
        <StatCard icon="👥" label="Roster Size"     value="—" />
      </div>

      {/* Connection requests */}
      <ConnectionRequests pending={pendingIncoming} onAccept={accept} onDecline={decline} />

      {/* Referee Scheduler section */}
      {isRefScheduler && (
        <>
          {isBothScheduler && <SectionDivider label="🏒 Referee Scheduler" />}
          <GameGroupsCard
            title={isBothScheduler ? 'Referee Game Groups' : 'Active Game Groups'}
            groups={isBothScheduler ? refGroups : groups}
            loading={groupsLoading}
            onAssign={() => navigate('/scheduler/assign')}
            onViewAll={() => navigate('/scheduler/groups')}
            emptyMessage="Accept a connection from a game director to get started with referee scheduling."
          />
        </>
      )}

      {/* Scorekeeper Scheduler section */}
      {isSKScheduler && (
        <>
          {isBothScheduler && <SectionDivider label="📋 Scorekeeper Scheduler" />}
          <GameGroupsCard
            title={isBothScheduler ? 'Scorekeeper Game Groups' : 'Active Game Groups'}
            groups={isBothScheduler ? skGroups : groups}
            loading={groupsLoading}
            onAssign={() => navigate('/scheduler/assign')}
            onViewAll={() => navigate('/scheduler/groups')}
            emptyMessage="Accept a connection from a game director to get started with scorekeeper scheduling."
          />
        </>
      )}
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value }) {
  return (
    <div className={styles.stat}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}

// ── Section divider ───────────────────────────────────────────────────────────
function SectionDivider({ label }) {
  return (
    <div className={styles.sectionDivider}>
      <span className={styles.sectionDividerBefore} />
      <span className={styles.sectionDividerLabel}>{label}</span>
      <span className={styles.sectionDividerAfter} />
    </div>
  )
}

// ── Connection requests card ──────────────────────────────────────────────────
function ConnectionRequests({ pending, onAccept, onDecline }) {
  if (!pending.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Connection Requests</CardTitle>
        <Badge variant="amber">{pending.length} pending</Badge>
      </CardHeader>
      <CardBody noPadding>
        {pending.map(conn => (
          <div key={conn.id} className={styles.connRow}>
            <Avatar name={conn.fromName ?? 'Director'} size="md" />
            <div className={styles.connInfo}>
              <div className={styles.connName}>{conn.fromName ?? 'Tournament Director'}</div>
              <div className={styles.connOrg}>{conn.groupName ?? conn.organization ?? 'Game request'}</div>
              {conn.gameCount > 0 && <div className={styles.connGames}>{conn.gameCount} games</div>}
            </div>
            <div className={styles.connActions}>
              <Button variant="teal"  size="sm" onClick={() => onAccept(conn.id)}>Accept</Button>
              <Button variant="ghost" size="sm" onClick={() => onDecline(conn.id)}>Decline</Button>
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  )
}

// ── Game groups card ──────────────────────────────────────────────────────────
function GameGroupsCard({ title, groups, loading, onAssign, onViewAll, emptyMessage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <Button size="sm" variant="ghost" onClick={onViewAll}>View all</Button>
      </CardHeader>
      <CardBody noPadding>
        {loading ? (
          <div className={styles.center}><Spinner /></div>
        ) : groups.length === 0 ? (
          <EmptyState icon="📋" title="No game groups yet" message={emptyMessage} />
        ) : (
          groups.slice(0, 5).map(g => (
            <div key={g.id} className={styles.groupRow}>
              <div className={styles.groupInfo}>
                <div className={styles.groupName}>{g.name}</div>
                <div className={styles.groupMeta}>{g.directorName ?? 'Director'} · {g.sport ?? 'Hockey'}</div>
              </div>
              <div className={styles.groupFill}>
                <div className={styles.fillBar}>
                  <div
                    className={styles.fillProgress}
                    style={{ width: `${g.totalGames ? Math.round((g.filledGames / g.totalGames) * 100) : 0}%` }}
                  />
                </div>
                <div className={styles.fillText}>{g.filledGames ?? 0}/{g.totalGames ?? 0}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={onAssign}>Assign</Button>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  )
}
