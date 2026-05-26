import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useNotifications } from '@/hooks/useNotifications'
import { Avatar } from '@/components/ui/Avatar'
import NotificationPanel from './NotificationPanel'
import styles from './Topbar.module.css'

export default function Topbar({ onMenuClick, title }) {
  const { profile, activeRole } = useAuth()
  const { unreadCount } = useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)
  const navigate = useNavigate()

  const profilePath = '/profile'

  return (
    <>
      <header className={styles.topbar}>
        <button className={styles.menuBtn} onClick={onMenuClick} aria-label="Open menu">
          <MenuIcon />
        </button>

        <img
          src="/logos/GAMECREWHQ-LOGO-LONG-BLKBG-transparent.png"
          alt="GameCrewHQ"
          className={styles.headerLogo}
        />

        <div className={styles.actions}>
          <div className={styles.search}>
            <SearchIcon className={styles.searchIcon} />
            <input className={styles.searchInput} placeholder="Search…" aria-label="Search" />
          </div>

          <button
            className={styles.iconBtn}
            onClick={() => setNotifOpen(o => !o)}
            aria-label="Notifications"
          >
            <BellIcon />
            {unreadCount > 0 && (
              <span className={styles.notifBadge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
            )}
          </button>

          <button
            className={styles.avatarBtn}
            onClick={() => navigate(profilePath)}
            title="My Profile"
          >
            <Avatar
              name={profile?.displayName}
              src={profile?.photoURL}
              size="sm"
            />
          </button>
        </div>
      </header>

      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}

const MenuIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="3" y1="6"  x2="21" y2="6" />
    <line x1="3" y1="12" x2="21" y2="12" />
    <line x1="3" y1="18" x2="21" y2="18" />
  </svg>
)
const SearchIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)
const BellIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
)
