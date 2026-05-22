import styles from './Badge.module.css'

/**
 * Badge — inline status chip
 * variant: 'green' | 'red' | 'amber' | 'blue' | 'gray' | 'ice'
 * size: 'sm' | 'md'
 */
export default function Badge({ children, variant = 'gray', size = 'md', dot = false }) {
  return (
    <span className={[styles.badge, styles[variant], styles[size]].join(' ')}>
      {dot && <span className={styles.dot} />}
      {children}
    </span>
  )
}

// Convenience helpers so callers don't have to know variant strings
export const statusBadge = (status) => {
  const map = {
    confirmed:   'green',
    accepted:    'green',
    active:      'green',
    available:   'green',
    paid:        'green',
    pending:     'amber',
    partial:     'amber',
    request:     'blue',
    sent:        'blue',
    connected:   'green',
    draft:       'gray',
    cancelled:   'red',
    declined:    'red',
    unavailable: 'red',
    overdue:     'red',
    open:        'blue',
  }
  return map[status?.toLowerCase()] ?? 'gray'
}
