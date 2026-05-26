import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Avatar } from '@/components/ui/Avatar'
import styles from './Sidebar.module.css'

// ── Icons ─────────────────────────────────────────────────────────────────────
const icon = (d) => ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
const HomeIcon     = icon(<><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></>)
const CalIcon      = icon(<><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>)
const ClockIcon    = icon(<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></>)
const MsgIcon      = icon(<><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></>)
const NewsIcon     = icon(<><path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8V6Z"/></>)
const UserIcon     = icon(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>)
const ReceiptIcon  = icon(<><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></>)
const UsersIcon    = icon(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>)
const DollarIcon   = icon(<><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></>)
const FlagIcon     = icon(<><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></>)
const SettingsIcon = icon(<><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>)
const LinkIcon     = icon(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>)
const InvoiceIcon  = icon(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></>)
const PlusIcon     = icon(<><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>)

// ── Nav config ────────────────────────────────────────────────────────────────
const NAV_CONFIG = {
  official: [
    { section: 'My Work', items: [
      { to: '/official',              label: 'Home',         icon: HomeIcon },
      { to: '/official/schedule',     label: 'Schedule',     icon: CalIcon },
      { to: '/official/availability', label: 'Availability', icon: ClockIcon },
    ]},
    { section: 'My Account', items: [
      { to: '/official/stats',        label: 'Stats',        icon: UserIcon },
      { to: '/official/expenses',     label: 'Expenses',     icon: ReceiptIcon },
      { to: '/settings/add-role',     label: 'Add a Role',   icon: PlusIcon },
    ]},
  ],
  scheduler: [
    { section: 'Overview', items: [
      { to: '/scheduler',          label: 'Dashboard',    icon: HomeIcon },
      { to: '/scheduler/quotes',   label: 'Quote Requests', icon: FlagIcon },
      { to: '/scheduler/groups',   label: 'Game Groups',  icon: CalIcon },
      { to: '/scheduler/assign',   label: 'Assign',       icon: FlagIcon },
    ]},
    { section: 'Management', items: [
      { to: '/scheduler/roster',   label: 'Roster',       icon: UsersIcon },
      { to: '/scheduler/finance',  label: 'Finance',      icon: DollarIcon },
      { to: '/scheduler/pricing',  label: 'Pricing Sheet', icon: ReceiptIcon },
      { to: '/scheduler/news',     label: 'News',         icon: NewsIcon },
    ]},
    { section: 'Account', items: [
      { to: '/scheduler/settings', label: 'Settings',  icon: SettingsIcon },
      { to: '/settings/add-role',  label: 'Add a Role', icon: PlusIcon },
    ]},
  ],
  director: [
    { section: 'Overview', items: [
      { to: '/director',        label: 'Dashboard', icon: HomeIcon },
      { to: '/director/events', label: 'My Events', icon: CalIcon },
    ]},
    { section: 'Network', items: [
      { to: '/director/schedulers', label: 'Schedulers', icon: LinkIcon },
      { to: '/director/invoices',   label: 'Invoices',   icon: InvoiceIcon },
    ]},
    { section: 'Account', items: [
      { to: '/director/settings', label: 'Settings',  icon: SettingsIcon },
      { to: '/settings/add-role', label: 'Add a Role', icon: PlusIcon },
    ]},
  ],
}

// ── Role display metadata ─────────────────────────────────────────────────────
const ROLE_META = {
  official:  { label: 'Official',      icon: '🏒', color: 'var(--red)'  },
  scheduler: { label: 'Scheduler',     icon: '📋', color: 'var(--teal)' },
  director:  { label: 'Game Director', icon: '🏆', color: 'var(--blue)' },
}

const SUB_ROLE_LABELS = {
  ref_scheduler: 'Referee Scheduler',
  sk_scheduler:  'Scorekeeper Scheduler',
  referee:       'Referee',
  scorekeeper:   'Scorekeeper',
}

export default function Sidebar({ isOpen, onClose }) {
  const { profile, activeRole, switchRole, logout } = useAuth()
  const navigate = useNavigate()

  const navItems   = NAV_CONFIG[activeRole] ?? []
  const otherRoles = profile?.roles?.filter(r => r !== activeRole) ?? []

  // Sub-role label shown under the active role name
  const activeSubRoles = (profile?.subRoles ?? [])
    .filter(s => {
      if (activeRole === 'official')  return ['referee', 'scorekeeper'].includes(s)
      if (activeRole === 'scheduler') return ['ref_scheduler', 'sk_scheduler'].includes(s)
      return false
    })
    .map(s => SUB_ROLE_LABELS[s])
    .join(' & ')

  const handleRoleSwitch = (role) => {
    switchRole(role)
    navigate(`/${role}`)
    onClose?.()
  }

  return (
    <>
      {isOpen && <div className={styles.backdrop} onClick={onClose} aria-hidden="true" />}

      <aside className={[styles.sidebar, isOpen ? styles.open : ''].join(' ')}>
        {/* Logo */}
        <div className={styles.logo}>
          <img
            src="/logos/GAMECREWHQ-LOGO-STACKED-BLKBG-transparent.png"
            alt="GameCrewHQ"
            className={styles.logoImg}
          />
        </div>

        {/* Active role */}
        <div className={styles.activeRole} style={{ '--role-color': ROLE_META[activeRole]?.color }}>
          <span className={styles.activeRoleIcon}>{ROLE_META[activeRole]?.icon}</span>
          <div>
            <div className={styles.activeRoleLabel}>{ROLE_META[activeRole]?.label}</div>
            {activeSubRoles && (
              <div className={styles.activeSubLabel}>{activeSubRoles}</div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className={styles.nav} aria-label="Main navigation">
          {navItems.map(({ section, items }) => (
            <div key={section} className={styles.section}>
              <span className={styles.sectionLabel}>{section}</span>
              {items.map(({ to, label, icon: Icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === `/${activeRole}`}
                  className={({ isActive }) =>
                    [styles.navItem, isActive ? styles.active : ''].join(' ')
                  }
                  onClick={onClose}
                >
                  <Icon className={styles.navIcon} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Back to Profile */}
        <div className={styles.roleSwitcher}>
          <span className={styles.sectionLabel}>Navigation</span>
          <button
            className={styles.roleBtn}
            onClick={() => { navigate('/profile'); onClose?.() }}
          >
            <span>👤</span>
            <span>Back to Profile</span>
          </button>
          {otherRoles.map(role => (
            <button
              key={role}
              className={styles.roleBtn}
              onClick={() => { switchRole(role); navigate(`/${role}`); onClose?.() }}
            >
              <span>{ROLE_META[role]?.icon}</span>
              <span>{ROLE_META[role]?.label}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <Avatar name={profile?.displayName} src={profile?.photoURL} size="sm" />
          <div className={styles.userInfo}>
            <span className={styles.userName}>{profile?.displayName}</span>
            <button className={styles.logoutBtn} onClick={logout}>Sign out</button>
          </div>
        </div>
      </aside>
    </>
  )
}
