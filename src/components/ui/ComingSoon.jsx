import { useAuth } from '@/context/AuthContext'

const ROLE_META = {
  official:  { icon: '🏒', label: 'Officials',     color: 'var(--red)'  },
  scheduler: { icon: '📋', label: 'Scheduler',     color: 'var(--teal)' },
  director:  { icon: '🏆', label: 'Game Director', color: 'var(--blue)' },
}

export default function ComingSoon({ role }) {
  const { profile, logout, switchRole } = useAuth()
  const meta = ROLE_META[role] ?? ROLE_META.official

  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{meta.icon}</div>
      <h2 style={{ fontFamily: 'var(--font-display)', marginBottom: 8 }}>
        {meta.label} — page coming soon
      </h2>
      <p style={{ color: 'var(--color-muted)', marginBottom: 24, fontSize: 13 }}>
        Signed in as {profile?.displayName}
      </p>
      <button
        onClick={logout}
        style={{ color: 'var(--color-muted)', background: 'none', border: '1px solid var(--color-border)', padding: '8px 16px', borderRadius: 8, cursor: 'pointer' }}
      >
        Sign out
      </button>
    </div>
  )
}
