import styles from './Avatar.module.css'

/**
 * Avatar
 * Shows photo if src provided, falls back to initials
 * size: 'xs'(24) | 'sm'(32) | 'md'(40) | 'lg'(56) | 'xl'(80)
 */
export function Avatar({ name, src, size = 'md', color, className = '' }) {
  const initials = getInitials(name)
  const bg = color ?? getColor(name)

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={[styles.avatar, styles[size], className].join(' ')}
      />
    )
  }

  return (
    <div
      className={[styles.avatar, styles[size], styles.initials, className].join(' ')}
      style={{ background: bg }}
      aria-label={name}
    >
      {initials}
    </div>
  )
}

/**
 * AvatarGroup — stacked avatars with overflow count
 */
export function AvatarGroup({ people = [], max = 4, size = 'sm' }) {
  const visible = people.slice(0, max)
  const overflow = people.length - max

  return (
    <div className={styles.group}>
      {visible.map((p, i) => (
        <Avatar
          key={p.uid ?? p.name ?? i}
          name={p.name ?? p.displayName}
          src={p.photoURL}
          size={size}
          className={styles.groupItem}
        />
      ))}
      {overflow > 0 && (
        <div className={[styles.avatar, styles[size], styles.overflow, styles.groupItem].join(' ')}>
          +{overflow}
        </div>
      )}
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('')
}

const PALETTE = [
  '#cc1f1f', '#2563eb', '#00b899', '#f59e0b',
  '#7c3aed', '#db2777', '#0891b2', '#65a30d',
]

function getColor(name = '') {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return PALETTE[Math.abs(hash) % PALETTE.length]
}
