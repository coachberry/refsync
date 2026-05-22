import styles from './Card.module.css'

export function Card({ children, className = '', onClick, hover = false }) {
  return (
    <div
      className={[styles.card, hover ? styles.hover : '', onClick ? styles.clickable : '', className].join(' ')}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export function CardHeader({ children, className = '' }) {
  return (
    <div className={[styles.header, className].join(' ')}>
      {children}
    </div>
  )
}

export function CardTitle({ children }) {
  return <h3 className={styles.title}>{children}</h3>
}

export function CardBody({ children, className = '', noPadding = false }) {
  return (
    <div className={[styles.body, noPadding ? styles.noPadding : '', className].join(' ')}>
      {children}
    </div>
  )
}

export function CardFooter({ children, className = '' }) {
  return (
    <div className={[styles.footer, className].join(' ')}>
      {children}
    </div>
  )
}
