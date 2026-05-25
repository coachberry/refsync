import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useGameGroups } from '@/hooks/useGameGroups'
import { useGroupGames } from '@/hooks/useGames'
import { updateGameGroup } from '@/services/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, statusBadge, EmptyState } from '@/components/ui'
import Button from '@/components/ui/Button'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import styles from './SchedGameGroups.module.css'

export default function SchedGameGroups() {
  const { groups, loading } = useGameGroups()
  const navigate = useNavigate()
  const [expandedGroup, setExpandedGroup] = useState(null)
  const [statusFilter, setStatusFilter]   = useState('all')

  const filtered = groups.filter(g => {
    if (statusFilter === 'all')    return true
    if (statusFilter === 'active') return g.status === 'active'
    if (statusFilter === 'draft')  return g.status === 'draft'
    if (statusFilter === 'open')   return (g.totalGames ?? 0) - (g.filledGames ?? 0) > 0
    return true
  })

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Game Groups</h1>
          <p className={styles.sub}>{groups.length} group{groups.length !== 1 ? 's' : ''} assigned to you</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className={styles.filters}>
        {[
          { id: 'all',    label: 'All' },
          { id: 'active', label: 'Active' },
          { id: 'open',   label: 'Has Open Games' },
          { id: 'draft',  label: 'Draft' },
        ].map(f => (
          <button
            key={f.id}
            className={[styles.filterBtn, statusFilter === f.id ? styles.filterActive : ''].join(' ')}
            onClick={() => setStatusFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.center}><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon="📋"
              title="No game groups yet"
              message="Game Directors will send you connection requests to fill their games. Accept them from your dashboard."
            />
          </CardBody>
        </Card>
      ) : (
        <div className={styles.groupList}>
          {filtered.map(group => (
            <GroupCard
              key={group.id}
              group={group}
              expanded={expandedGroup === group.id}
              onToggle={() => setExpandedGroup(id => id === group.id ? null : group.id)}
              onAssign={() => navigate('/scheduler/assign')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Group Card ────────────────────────────────────────────────────────────────
function GroupCard({ group, expanded, onToggle, onAssign }) {
  const fillPct    = group.totalGames ? Math.round((group.filledGames / group.totalGames) * 100) : 0
  const openGames  = (group.totalGames ?? 0) - (group.filledGames ?? 0)

  return (
    <div className={styles.groupCard}>
      {/* Header row */}
      <div className={styles.groupCardTop} onClick={onToggle}>
        <div className={styles.groupCardLeft}>
          <div className={styles.groupName}>{group.name}</div>
          <div className={styles.groupMeta}>
            <span>{group.sport ?? 'Hockey'}</span>
            {group.directorName && <span>Director: {group.directorName}</span>}
            {group.startDate && (
              <span>
                {format(new Date(group.startDate), 'MMM d')}
                {group.endDate ? ` – ${format(new Date(group.endDate), 'MMM d, yyyy')}` : ''}
              </span>
            )}
          </div>
          {/* Venues & Divisions */}
          {group.venues?.length > 0 && (
            <div className={styles.groupTag}>📍 {group.venues.join(' · ')}</div>
          )}
          {group.divisions?.length > 0 && (
            <div className={styles.groupTag}>🎯 {group.divisions.map(d => d.label).join(', ')}</div>
          )}
        </div>

        <div className={styles.groupCardRight}>
          <Badge variant={statusBadge(group.status ?? 'draft')}>{group.status ?? 'draft'}</Badge>
          {openGames > 0 && <Badge variant="red">{openGames} open</Badge>}
          <span className={styles.expandChevron}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Fill bar */}
      <div className={styles.fillSection}>
        <div className={styles.fillMeta}>
          <span>{group.filledGames ?? 0} / {group.totalGames ?? 0} games filled</span>
          <span className={styles.fillPct}>{fillPct}%</span>
        </div>
        <div className={styles.fillBar}>
          <div className={styles.fillProgress} style={{ width: `${fillPct}%` }} />
        </div>
      </div>

      {/* Actions */}
      <div className={styles.groupActions}>
        <Button size="sm" variant="primary" onClick={onAssign}>
          Assign Officials
        </Button>
        <Button size="sm" variant="secondary" onClick={onToggle}>
          {expanded ? 'Hide Games' : 'View Games'}
        </Button>
        {group.notes && (
          <span className={styles.notesHint} title={group.notes}>📝 Director notes</span>
        )}
      </div>

      {/* Expanded games list */}
      {expanded && (
        <GamesList groupId={group.id} group={group} />
      )}
    </div>
  )
}

// ── Games list (lazy loaded when expanded) ────────────────────────────────────
function GamesList({ groupId, group }) {
  const { games, loading } = useGroupGames(groupId)
  const [gameFilter, setGameFilter] = useState('all')

  const filtered = games.filter(g => {
    if (gameFilter === 'all')      return true
    if (gameFilter === 'open')     return g.status === 'open'
    if (gameFilter === 'assigned') return g.status === 'assigned' || g.status === 'confirmed'
    return true
  })

  if (loading) return <div className={styles.gamesLoading}><Spinner color="muted" /></div>

  return (
    <div className={styles.gamesList}>
      <div className={styles.gamesListHeader}>
        <span className={styles.gamesListTitle}>{games.length} Games</span>
        <div className={styles.gamesListFilters}>
          {['all','open','assigned'].map(f => (
            <button
              key={f}
              className={[styles.gameFilterBtn, gameFilter === f ? styles.gameFilterActive : ''].join(' ')}
              onClick={() => setGameFilter(f)}
            >
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.gamesEmpty}>No games in this filter</div>
      ) : (
        <div className={styles.gamesTable}>
          <div className={styles.gamesTableHead}>
            <span>Game</span>
            <span>Date & Time</span>
            <span>Venue</span>
            <span>Division</span>
            <span>Crew</span>
            <span>Status</span>
          </div>
          {filtered.map(game => {
            const gameDate = game.gameDate?.toDate?.() ?? new Date(game.gameDate)
            return (
              <div key={game.id} className={styles.gameRow}>
                <div className={styles.gameRowTitle}>
                  🏒 {game.homeTeam} vs {game.awayTeam}
                </div>
                <div className={styles.gameRowCell}>
                  <div>{format(gameDate, 'EEE, MMM d')}</div>
                  <div className={styles.gameRowSub}>{format(gameDate, 'h:mm a')}</div>
                </div>
                <div className={styles.gameRowCell}>{game.venue || '—'}</div>
                <div className={styles.gameRowCell}>{game.division || '—'}</div>
                <div className={styles.gameRowCell}>
                  {game.assignedOfficials?.length > 0 ? (
                    <div className={styles.crewList}>
                      {game.assignedOfficials.map((o, i) => (
                        <span key={i} className={[
                          styles.crewChip,
                          o.status === 'accepted' ? styles.crewAccepted :
                          o.status === 'declined' ? styles.crewDeclined : styles.crewPending
                        ].join(' ')}>
                          {o.name?.split(' ')[0]}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className={styles.unassigned}>Unassigned</span>
                  )}
                </div>
                <div className={styles.gameRowCell}>
                  <Badge variant={statusBadge(game.status)}>{game.status}</Badge>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
