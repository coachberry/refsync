import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { useThreads } from '@/hooks/useMessages'
import { Avatar } from '@/components/ui/Avatar'
import NotificationPanel from './NotificationPanel'
import styles from './ProfileShell.module.css'

const NAV = [
  { to: '/profile',          label: 'Overview',  icon: '👤', end: true },
  { to: '/profile/messages', label: 'Messages',  icon: '💬' },
  { to: '/profile/finances', label: 'Finances',  icon: '💰' },
  { to: '/profile/edit',     label: 'Edit Profile',    icon: '✏️' },
  { to: '/billing',          label: 'Billing & Plans',  icon: '💳' },
]

const ROLE_META = {
  official:  { icon: '🏒', label: 'Official',      path: '/official',  color: 'var(--red)'  },
  scheduler: { icon: '📋', label: 'Scheduler',     path: '/scheduler', color: 'var(--teal)' },
  director:  { icon: '🏆', label: 'Game Director', path: '/director',  color: 'var(--blue)' },
}

export default function ProfileShell() {
  const { profile, logout } = useAuth()
  const { unreadCount: notifCount } = useNotifications()
  const { unreadCount: msgCount }   = useThreads()
  const [notifOpen, setNotifOpen]   = useState(false)
  const [menuOpen, setMenuOpen]     = useState(false)
  const navigate = useNavigate()

  const roles = profile?.roles ?? []

  return (
    <>
      <div className={styles.shell}>
        {/* Top nav bar */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <img
              src="/logos/GAMECREWHQ-LOGO-LONG-BLKBG-transparent.png"
              alt="GameCrewHQ"
              className={styles.logo}
              onClick={() => navigate('/profile')}
              style={{ cursor: 'pointer' }}
            />

            {/* Profile nav links */}
            <nav className={styles.nav}>
              {NAV.map(n => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) => [styles.navLink, isActive ? styles.navActive : ''].join(' ')}
                >
                  <span className={styles.navIcon}>{n.icon}</span>
                  <span>{n.label}</span>
                  {n.to === '/profile/messages' && msgCount > 0 && (
                    <span className={styles.navBadge}>{msgCount}</span>
                  )}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className={styles.topbarRight}>
            {/* Role switcher pills */}
            <div className={styles.rolePills}>
              {roles.map(r => {
                const meta = ROLE_META[r]
                if (!meta) return null
                return (
                  <button
                    key={r}
                    className={styles.rolePill}
                    style={{ '--pill-color': meta.color }}
                    onClick={() => navigate(meta.path)}
                    title={`Go to ${meta.label}`}
                  >
                    {meta.icon} {meta.label}
                  </button>
                )
              })}
            </div>

            {/* Notification bell */}
            <button className={styles.iconBtn} onClick={() => setNotifOpen(o => !o)}>
              🔔
              {notifCount > 0 && <span className={styles.notifBadge}>{notifCount}</span>}
            </button>

            {/* Avatar */}
            <Avatar
              name={profile?.displayName}
              src={profile?.photoURL}
              size="sm"
              className={styles.avatar}
            />

            {/* Sign out */}
            <button className={styles.signOutBtn} onClick={logout}>Sign out</button>
          </div>
        </header>

        {/* Page content */}
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
