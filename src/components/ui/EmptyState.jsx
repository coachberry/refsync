import styles from './EmptyState.module.css'
import Button from './Button'

/**
 * EmptyState — shown when a list or section has no data
 * Props:
 *   icon     — emoji or ReactNode
 *   title    — string
 *   message  — string
 *   action   — { label, onClick, icon }
 */
export default function EmptyState({ icon = '📭', title, message, action }) {
  return (
    <div className={styles.wrap}>
      <div className={styles.icon}>{icon}</div>
      {title   && <h3 className={styles.title}>{title}</h3>}
      {message && <p  className={styles.msg}>{message}</p>}
      {action  && (
        <Button
          variant="primary"
          icon={action.icon}
          onClick={action.onClick}
          className={styles.btn}
        >
          {action.label}
        </Button>
      )}
    </div>
  )
}
