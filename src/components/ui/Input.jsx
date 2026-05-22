import styles from './Input.module.css'

/**
 * Input — text input with label and error
 */
export function Input({
  label,
  error,
  hint,
  icon,
  className = '',
  ...props
}) {
  return (
    <div className={[styles.field, className].join(' ')}>
      {label && <label className={styles.label}>{label}</label>}
      <div className={styles.inputWrap}>
        {icon && <span className={styles.inputIcon}>{icon}</span>}
        <input
          className={[styles.input, error ? styles.hasError : '', icon ? styles.withIcon : ''].join(' ')}
          {...props}
        />
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {hint && !error && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}

/**
 * Select — dropdown
 */
export function Select({ label, error, children, className = '', ...props }) {
  return (
    <div className={[styles.field, className].join(' ')}>
      {label && <label className={styles.label}>{label}</label>}
      <select
        className={[styles.input, styles.select, error ? styles.hasError : ''].join(' ')}
        {...props}
      >
        {children}
      </select>
      {error && <p className={styles.error}>{error}</p>}
    </div>
  )
}

/**
 * Textarea
 */
export function Textarea({ label, error, hint, className = '', rows = 3, ...props }) {
  return (
    <div className={[styles.field, className].join(' ')}>
      {label && <label className={styles.label}>{label}</label>}
      <textarea
        className={[styles.input, styles.textarea, error ? styles.hasError : ''].join(' ')}
        rows={rows}
        {...props}
      />
      {error && <p className={styles.error}>{error}</p>}
      {hint && !error && <p className={styles.hint}>{hint}</p>}
    </div>
  )
}

/**
 * FormRow — two inputs side by side
 */
export function FormRow({ children, className = '' }) {
  return (
    <div className={[styles.formRow, className].join(' ')}>
      {children}
    </div>
  )
}
