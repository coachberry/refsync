import { NavLink } from 'react-router-dom'
import styles from './MobileNav.module.css'

/**
 * MobileNav — bottom tab bar, shown only on small screens for officials.
 * Scheduler and Director use the sidebar on all screen sizes.
 */

// ── Icons ─────────────────────────────────────────────────────────────────
const svgIcon = (d) => ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {d}
  </svg>
)

const HomeIcon  = svgIcon(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>)
const CalIcon   = svgIcon(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>)
const ClockIcon = svgIcon(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>)
const MsgIcon   = svgIcon(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>)
const UserIcon  = svgIcon(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>)

const OFFICIAL_TABS = [
  { to: '/official',              label: 'Home',     icon: HomeIcon },
  { to: '/official/schedule',     label: 'Schedule', icon: CalIcon },
  { to: '/official/availability', label: 'Avail',    icon: ClockIcon },
  { to: '/official/inbox',        label: 'Inbox',    icon: MsgIcon },
  { to: '/official/profile',      label: 'Profile',  icon: UserIcon },
]

export default function MobileNav() {
  return (
    <nav className={styles.nav} aria-label="Mobile navigation">
      {OFFICIAL_TABS.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/official'}
          className={({ isActive }) =>
            [styles.item, isActive ? styles.active : ''].join(' ')
          }
        >
          <Icon className={styles.icon} />
          <span className={styles.label}>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

