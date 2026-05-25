import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '@/hooks/useNotifications'
import { Spinner } from '@/components/ui/LoadingSpinner'
import { formatDistanceToNow } from 'date-fns'
import styles from './NotificationPanel.module.css'

const TYPE_ICONS = {
  game_request:   '🏒',
  game_accepted:  '✅',
  game_declined:  '❌',
  connection:     '🤝',
  message:        '💬',
  news:           '📢',
  invoice:        '💰',
  default:        '🔔',
}

export default function NotificationPanel({ open, onClose }) {
  const { notifications, unreadCount, loading, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  const handleClick = (notif) => {
    if (!notif.read) markRead(notif.id)
    if (notif.link) { navigate(notif.link); onClose() }
  }

  const timeAgo = (notif) => {
    try {
      const date = notif.createdAt?.toDate?.() ?? new Date(notif.createdAt)
      return formatDistanceToNow(date, { addSuffix: true })
    } catch {
      return 'recently'
    }
  }

  return (
    <>
      {open && <div className={styles.backdrop} onClick={onClose} />}
      <div className={[styles.panel, open ? styles.open : ''].join(' ')}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.title}>Notifications</span>
            {unreadCount > 0 && (
              <span className={styles.unreadBadge}>{unreadCount}</span>
            )}
          </div>
          <div className={styles.headerActions}>
            {unreadCount > 0 && (
              <button className={styles.markAllBtn} onClick={markAllRead}>
                Mark all read
              </button>
            )}
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        <div className={styles.body}>
          {loading ? (
            <div className={styles.center}><Spinner color="muted" /></div>
          ) : notifications.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyIcon}>🔔</div>
              <div className={styles.emptyText}>No notifications yet</div>
              <div className={styles.emptySub}>Game requests, messages, and updates will appear here.</div>
            </div>
          ) : (
            notifications.map(n => (
              <div
                key={n.id}
                className={[styles.item, !n.read ? styles.unread : ''].join(' ')}
                onClick={() => handleClick(n)}
              >
                <div className={styles.itemIcon}>
                  {TYPE_ICONS[n.type] ?? TYPE_ICONS.default}
                </div>
                <div className={styles.itemBody}>
                  {n.title && <div className={styles.itemTitle}>{n.title}</div>}
                  <div className={styles.itemText}>{n.message}</div>
                  <div className={styles.itemTime}>{timeAgo(n)}</div>
                </div>
                {!n.read && <div className={styles.unreadDot} />}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
