import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileNav from './MobileNav'
import styles from './AppShell.module.css'

// Map routes to page titles
const PAGE_TITLES = {
  // Official
  '/official':              'Home',
  '/official/schedule':     'My Schedule',
  '/official/availability': 'Availability',
  '/official/inbox':        'Inbox',
  '/official/news':         'News & Updates',
  '/official/profile':      'My Profile',
  '/official/expenses':     'Expenses',
  // Scheduler
  '/scheduler':             'Dashboard',
  '/scheduler/groups':      'Game Groups',
  '/scheduler/assign':      'Assign Officials',
  '/scheduler/roster':      'My Roster',
  '/scheduler/finance':     'Finance',
  '/scheduler/messages':    'Messages',
  '/scheduler/news':        'News & Updates',
  '/scheduler/settings':    'Settings',
  // Director
  '/director':              'Dashboard',
  '/director/events':       'My Events',
  '/director/schedulers':   'Schedulers',
  '/director/invoices':     'Invoices',
  '/director/messages':     'Messages',
  '/director/settings':     'Settings',
}

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { activeRole } = useAuth()
  const location = useLocation()

  const title = PAGE_TITLES[location.pathname] ?? 'RefSync'
  const isOfficial = activeRole === 'official'

  return (
    <div className={styles.shell}>
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className={[styles.main, isOfficial ? styles.officialMain : ''].join(' ')}>
        <Topbar
          title={title}
          onMenuClick={() => setSidebarOpen(true)}
        />

        <main className={[styles.content, isOfficial ? 'has-mobile-nav' : ''].join(' ')}>
          {/* Outlet renders the matched child route's page component */}
          <Outlet />
        </main>
      </div>

      {/* Bottom nav — officials on mobile only */}
      {isOfficial && <MobileNav />}
    </div>
  )
}
