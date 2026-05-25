import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useOfficialGames } from '@/hooks/useGames'
import { useConnections } from '@/hooks/useConnections'
import { respondToAssignment } from '@/services/firestore'
import { Card, CardHeader, CardTitle, CardBody, Badge, statusBadge, EmptyState } from '@/components/ui'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { Avatar } from '@/components/ui/Avatar'
import Button from '@/components/ui/Button'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import styles from './OfficialHome.module.css'

export default function OfficialHome() {
  const { profile } = useAuth()
  const { isReferee, isScorekeeper, isBothOfficial } = useSubRoles()
  const { games, pending, upcoming, loading } = useOfficialGames()
  const { pendingIncoming, accept, decline } = useConnections()
  const navigate = useNavigate()

  const firstName = profile?.displayName?.split(' ')[0] ?? 'there'

  // Filter to only scheduler-official roster invites
  const rosterInvites = pendingIncoming.filter(c => c.type === 'scheduler-official')

  // Split pending and upcoming by role type
  const pendingRef  = pending.filter(g  => g.assignedOfficials?.find(o => o.uid === profile?.uid && o.role !== 'Scorekeeper'))
  const pendingSK   = pending.filter(g  => g.assignedOfficials?.find(o => o.uid === profile?.uid && o.role === 'Scorekeeper'))
  const upcomingRef = upcoming.filter(g => g.assignedOfficials?.find(o => o.uid === profile?.uid && o.role !== 'Scorekeeper'))
  const upcomingSK  = upcoming.filter(g => g.assignedOfficials?.find(o => o.uid === profile?.uid && o.role === 'Scorekeeper'))

  if (loading) return <div className={styles.center}><Spinner size="lg" /></div>

  return (
    <div className={styles.page}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <h1 className={styles.greetTitle}>Hey, {firstName} 👋</h1>
        <p className={styles.greetSub}>
          {format(new Date(), 'EEEE, MMMM d')}
          {isBothOfficial && ' · Referee & Scorekeeper'}
          {isReferee && !isScorekeeper && ' · Referee'}
          {isScorekeeper && !isReferee && ' · Scorekeeper'}
        </p>
      </div>

      {/* Roster invitations from schedulers */}
      {rosterInvites.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🤝 Roster Invitations</CardTitle>
            <Badge variant="amber">{rosterInvites.length} pending</Badge>
          </CardHeader>
          <CardBody noPadding>
            {rosterInvites.map(inv => (
              <div key={inv.id} className={styles.inviteRow}>
                <Avatar name={inv.fromName ?? 'Scheduler'} size="md" />
                <div className={styles.inviteInfo}>
                  <div className={styles.inviteName}>{inv.fromName ?? 'A Scheduler'}</div>
                  <div className={styles.inviteSub}>
                    Wants to add you to their officiating roster
                    {inv.note && <span className={styles.inviteNote}> · "{inv.note}"</span>}
                  </div>
                </div>
                <div className={styles.inviteActions}>
                  <Button size="sm" variant="teal" onClick={() => accept(inv.id)}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={() => decline(inv.id)}>Decline</Button>
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Pending game requests banner */}
      {pending.length > 0 && (
        <div className={styles.requestsBanner}>
          <span className={styles.requestsLabel}>
            ⚡ {pending.length} game request{pending.length > 1 ? 's' : ''} waiting
          </span>
          <Button size="sm" variant="primary" onClick={() => navigate('/official/schedule')}>
            Review
          </Button>
        </div>
      )}

      {/* Stats grid — adapts to roles */}
      <div className={styles.statsGrid}>
        {isReferee && (
          <>
            <StatCard icon="🏒" value={profile?.officialProfile?.seasonGames ?? 0} label="Referee games (season)" />
            <StatCard icon="⭐" value="—" label="Referee avg rating" />
          </>
        )}
        {isScorekeeper && (
          <>
            <StatCard icon="📋" value={profile?.officialProfile?.skSeasonGames ?? 0} label="Scorekeeper games (season)" />
            <StatCard icon="⭐" value="—" label="Scorekeeper avg rating" />
          </>
        )}
        <StatCard icon="💰" value="—" label="Earned (month)" />
        <StatCard icon="🚗" value="—" label="Mileage (month)" />
      </div>

      {/* When no games at all — show one unified empty state */}
      {upcoming.length === 0 && (
        <Card>
          <CardBody>
            <EmptyState
              icon="🏒"
              title="No upcoming games"
              message="You'll see your confirmed games here once a scheduler assigns you."
            />
          </CardBody>
        </Card>
      )}

      {/* Referee section — only shown when there are referee games */}
      {isReferee && upcomingRef.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>🏒 Upcoming Referee Games</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => navigate('/official/schedule')}>See all</Button>
          </CardHeader>
          <CardBody noPadding>
            {upcomingRef.slice(0, 4).map(g => <GameRow key={g.id} game={g} uid={profile?.uid} />)}
          </CardBody>
        </Card>
      )}

      {/* Scorekeeper section — only shown when there are scorekeeper games */}
      {isScorekeeper && upcomingSK.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>📋 Upcoming Scorekeeper Games</CardTitle>
            <Button size="sm" variant="ghost" onClick={() => navigate('/official/schedule')}>See all</Button>
          </CardHeader>
          <CardBody noPadding>
            {upcomingSK.slice(0, 4).map(g => <GameRow key={g.id} game={g} uid={profile?.uid} />)}
          </CardBody>
        </Card>
      )}
    </div>
  )
}

// ── Section divider ───────────────────────────────────────────────────────────
function SectionDivider({ label }) {
  return (
    <div className={styles.sectionDivider}>
      <span className={styles.sectionDividerLabel}>{label}</span>
    </div>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label }) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon}>{icon}</div>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  )
}

// ── Next game hero card ───────────────────────────────────────────────────────
function HeroGameCard({ game, uid, accentColor = 'var(--red)' }) {
  const my = game.assignedOfficials?.find(o => o.uid === uid)
  const gameDate = game.gameDate?.toDate?.() ?? new Date(game.gameDate)

  return (
    <div className={styles.heroCard} style={{ '--hero-color': accentColor }}>
      <div className={styles.heroMeta}>Next Game · {format(gameDate, 'EEEE, MMM d')}</div>
      <div className={styles.heroTitle}>{game.homeTeam} vs {game.awayTeam}</div>
      <div className={styles.heroDetails}>
        <span>🕐 {format(gameDate, 'h:mm a')}</span>
        <span>📍 {game.venue}</span>
        {game.mileage && <span>🚗 {game.mileage} mi</span>}
      </div>
      <div className={styles.heroFooter}>
        <Badge variant="green">Confirmed</Badge>
        {my?.role && <Badge variant="ice">{my.role}</Badge>}
        {game.division && <Badge variant="gray">{game.division}</Badge>}
        <span className={styles.heroPay}>${my?.pay ?? game.payRate ?? '—'}</span>
      </div>
    </div>
  )
}

// ── Game row ──────────────────────────────────────────────────────────────────
function GameRow({ game, uid }) {
  const my = game.assignedOfficials?.find(o => o.uid === uid)
  const gameDate = game.gameDate?.toDate?.() ?? new Date(game.gameDate)

  return (
    <div className={styles.gameRow}>
      <div className={styles.gameRowDate}>
        <div className={styles.gameRowMonth}>{format(gameDate, 'MMM')}</div>
        <div className={styles.gameRowDay}>{format(gameDate, 'd')}</div>
      </div>
      <div className={styles.gameRowInfo}>
        <div className={styles.gameRowTitle}>{game.homeTeam} vs {game.awayTeam}</div>
        <div className={styles.gameRowMeta}>{format(gameDate, 'h:mm a')} · {game.venue}</div>
      </div>
      <div className={styles.gameRowRight}>
        <Badge variant={statusBadge(my?.status ?? game.status)}>
          {my?.status ?? game.status}
        </Badge>
        <div className={styles.gameRowPay}>${my?.pay ?? game.payRate ?? '—'}</div>
      </div>
    </div>
  )
}
