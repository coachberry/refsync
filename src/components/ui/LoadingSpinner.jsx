import styles from './LoadingSpinner.module.css'

/** Inline spinner */
export function Spinner({ size = 'md', color = 'red' }) {
  return (
    <span
      className={[styles.spinner, styles[size], styles[color]].join(' ')}
      aria-label="Loading"
      role="status"
    />
  )
}

/** Full-page centered loader */
export function PageLoader({ message = 'Loading…' }) {
  return (
    <div className={styles.page}>
      <Spinner size="lg" />
      {message && <p className={styles.message}>{message}</p>}
    </div>
  )
}

/** Skeleton line placeholder */
export function Skeleton({ width = '100%', height = 16, radius = 6, className = '' }) {
  return (
    <div
      className={[styles.skeleton, className].join(' ')}
      style={{ width, height, borderRadius: radius }}
      aria-hidden="true"
    />
  )
}
