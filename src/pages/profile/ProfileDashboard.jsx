import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useSubRoles } from '@/hooks/useSubRoles'
import { useOfficialGames } from '@/hooks/useGames'
import { useThreads } from '@/hooks/useMessages'
import { Card, CardHeader, CardTitle, CardBody, Badge } from '@/components/ui'
import { Avatar } from '@/components/ui/Avatar'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { format, differenceInYears, differenceInMonths } from 'date-fns'
import styles from './ProfileDashboard.module.css'

const ROLE_META = {
  official:  { icon: '🏒', label: 'Official Dashboard',   desc: 'Schedule, availability, game requests', color: 'var(--red)',  path: '/official'  },
  scheduler: { icon: '📋', label: 'Scheduler Dashboard',  desc: 'Assign officials, game groups, roster', color: 'var(--teal)', path: '/scheduler' },
  director:  { icon: '🏆', label: 'Director Dashboard',   desc: 'Events, schedulers, games',             color: 'var(--blue)', path: '/director'  },
}

const SUB_ROLE_LABELS = {
  referee:       'Referee',
  scorekeeper:   'Scorekeeper',
  ref_scheduler: 'Referee Scheduler',
  sk_scheduler:  'Scorekeeper Scheduler',
}

export default function ProfileDashboard() {
  const { profile, user } = useAuth()
  const { isReferee, isScorekeeper } = useSubRoles()
  const { games, loading: gamesLoading } = useOfficialGames()
  const { threads, unreadCount } = useThreads()
  const navigate = useNavigate()

  const joinedDate = profile?.officialProfile?.joinedDate
  const memberDuration = () => {
    if (!joinedDate) return null
    const joined = new Date(joinedDate)
    const years  = differenceInYears(new Date(), joined)
    const months = differenceInMonths(new Date(), joined) % 12
    if (years > 0) return `${years} yr${years > 1 ? 's' : ''}${months > 0 ? ` ${months} mo` : ''}`
    return `${months} month${months !== 1 ? 's' : ''}`
  }

  const roles    = profile?.roles ?? []
  const subRoles = profile?.subRoles ?? []
  const totalGames = games.length
  const refGames   = games.filter(g => g.assignedOfficials?.find(o => o.uid === user?.uid && o.role !== 'Scorekeeper')).length
  const skGames    = games.filter(g => g.assignedOfficials?.find(o => o.uid === user?.uid && o.role === 'Scorekeeper')).length

  return (
    <div className={styles.page}>
      {/* ── Profile header ── */}
      <div className={styles.profileCard}>
        <div className={styles.profileTop}>
          <div className={styles.avatarWrap}>
            <Avatar name={profile?.displayName} src={profile?.photoURL} size="xl" />
            <button className={styles.avatarEditBtn} onClick={() => navigate('/profile/edit')} title="Edit profile">✏️</button>
          </div>
          <div className={styles.profileInfo}>
            <h1 className={styles.profileName}>{profile?.displayName}</h1>
            <div className={styles.profileEmail}>{profile?.email}</div>
            <div className={styles.profileBadges}>
              {subRoles.map(s => SUB_ROLE_LABELS[s] && (
                <span key={s} className={styles.subRoleBadge}>{SUB_ROLE_LABELS[s]}</span>
              ))}
            </div>
            {profile?.bio && <p className={styles.profileBio}>{profile.bio}</p>}
          </div>
          <div className={styles.profileStats}>
            {memberDuration() && (
              <div className={styles.statItem}>
                <div className={styles.statVal}>{memberDuration()}</div>
                <div className={styles.statLbl}>Member</div>
              </div>
            )}
            {roles.includes('official') && (
              <div className={styles.statItem}>
                <div className={styles.statVal}>{totalGames}</div>
                <div className={styles.statLbl}>Games</div>
              </div>
            )}
            <div className={styles.statItem}>
              <div className={styles.statVal}>{unreadCount > 0 ? <span className={styles.unreadVal}>{unreadCount}</span> : '0'}</div>
              <div className={styles.statLbl}>Unread</div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.grid}>
        {/* ── Role dashboards ── */}
        <div className={styles.rolesSection}>
          <div className={styles.sectionTitle}>My Dashboards</div>
          <div className={styles.roleCards}>
            {roles.map(roleId => {
              const meta = ROLE_META[roleId]
              if (!meta) return null
              const roleSubs = subRoles.filter(s => {
                if (roleId === 'official')  return ['referee','scorekeeper'].includes(s)
                if (roleId === 'scheduler') return ['ref_scheduler','sk_scheduler'].includes(s)
                return false
              })
              return (
                <div
                  key={roleId}
                  className={styles.roleCard}
                  style={{ '--role-color': meta.color }}
                  onClick={() => navigate(meta.path)}
                >
                  <div className={styles.roleCardIcon}>{meta.icon}</div>
                  <div className={styles.roleCardInfo}>
                    <div className={styles.roleCardLabel}>{meta.label}</div>
                    <div className={styles.roleCardDesc}>{meta.desc}</div>
                    {roleSubs.length > 0 && (
                      <div className={styles.roleCardSubs}>
                        {roleSubs.map(s => <span key={s} className={styles.roleSubChip}>{SUB_ROLE_LABELS[s]}</span>)}
                      </div>
                    )}
                  </div>
                  <div className={styles.roleCardArrow}>›</div>
                </div>
              )
            })}
            <div className={styles.roleCard} style={{ '--role-color': 'var(--color-muted)' }} onClick={() => navigate('/settings/add-role')}>
              <div className={styles.roleCardIcon}>➕</div>
              <div className={styles.roleCardInfo}>
                <div className={styles.roleCardLabel}>Add a Role</div>
                <div className={styles.roleCardDesc}>Expand your account with additional roles</div>
              </div>
              <div className={styles.roleCardArrow}>›</div>
            </div>
          </div>
        </div>

        {/* ── Recent messages preview ── */}
        <div className={styles.messagesSection}>
          <div className={styles.sectionHeader}>
            <div className={styles.sectionTitle}>Messages</div>
            {unreadCount > 0 && <Badge variant="red">{unreadCount} unread</Badge>}
            <button className={styles.seeAllBtn} onClick={() => navigate('/profile/messages')}>See all →</button>
          </div>
          {threads.length === 0 ? (
            <div className={styles.emptyMsg}>
              <span>💬</span>
              <span>No messages yet</span>
            </div>
          ) : (
            threads.slice(0, 4).map(thread => (
              <div key={thread.id} className={[styles.threadPreview, thread.unread ? styles.threadUnread : ''].join(' ')} onClick={() => navigate('/profile/messages')}>
                <Avatar name={thread.participantName} size="sm" />
                <div className={styles.threadPreviewInfo}>
                  <div className={styles.threadPreviewName}>{thread.participantName}</div>
                  <div className={styles.threadPreviewMsg}>{thread.lastMessage ?? 'No messages yet'}</div>
                </div>
                {thread.unread && <div className={styles.threadDot} />}
              </div>
            ))
          )}
        </div>

        {/* ── Official game stats (if applicable) ── */}
        {roles.includes('official') && (
          <div className={styles.statsSection}>
            <div className={styles.sectionTitle}>This Season</div>
            <div className={styles.miniStats}>
              {isReferee && (
                <div className={styles.miniStat}>
                  <div className={styles.miniStatIcon}>🏒</div>
                  <div className={styles.miniStatVal}>{refGames}</div>
                  <div className={styles.miniStatLbl}>Referee Games</div>
                </div>
              )}
              {isScorekeeper && (
                <div className={styles.miniStat}>
                  <div className={styles.miniStatIcon}>📋</div>
                  <div className={styles.miniStatVal}>{skGames}</div>
                  <div className={styles.miniStatLbl}>Scorekeeper Games</div>
                </div>
              )}
              <div className={styles.miniStat}>
                <div className={styles.miniStatIcon}>🏆</div>
                <div className={styles.miniStatVal}>{totalGames}</div>
                <div className={styles.miniStatLbl}>Career Games</div>
              </div>
              <div className={styles.miniStat}>
                <div className={styles.miniStatIcon}>💰</div>
                <div className={styles.miniStatVal}>—</div>
                <div className={styles.miniStatLbl}>Earned (month)</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
