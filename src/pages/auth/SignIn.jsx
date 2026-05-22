import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

export default function SignIn() {
  const { signIn, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const from = location.state?.from?.pathname ?? null

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      toast.success('Welcome back!')
      // Redirect to where they came from, or their primary role
      if (from) { navigate(from, { replace: true }); return }
      // profile not loaded yet — App.jsx handles redirect after auth resolves
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential'
        ? 'Invalid email or password'
        : err.message ?? 'Sign in failed'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.outer}>
      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.logo}>Ref<span style={{ color: 'var(--red)' }}>Sync</span></div>
          <div style={styles.sub}>Hockey Officiating Platform</div>
        </div>

        <div style={styles.body}>
          <form onSubmit={handleSubmit}>
            <div style={styles.field}>
              <label style={styles.label}>Email</label>
              <input
                style={{ ...styles.input, borderColor: error ? 'var(--red)' : 'var(--color-border)' }}
                type="email"
                placeholder="jordan@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label}>Password</label>
              <input
                style={{ ...styles.input, borderColor: error ? 'var(--red)' : 'var(--color-border)' }}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div style={styles.errorBox}>{error}</div>
            )}

            <button type="submit" style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <p style={styles.link}>
            Don't have an account?{' '}
            <Link to="/signup" style={{ color: 'var(--red)', fontWeight: 600 }}>Create one</Link>
          </p>

          {/* Dev quick-login hints — remove in production */}
          {import.meta.env.DEV && (
            <div style={styles.devHint}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Dev quick logins</div>
              <div>Create accounts via Sign Up first, then use those credentials here.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  outer: {
    minHeight: '100vh', display: 'flex', alignItems: 'center',
    justifyContent: 'center', padding: 20, background: 'var(--color-bg)',
  },
  card: {
    width: '100%', maxWidth: 420,
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
  },
  header: { background: 'var(--sidebar-bg)', padding: '28px 32px', textAlign: 'center' },
  logo: { fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: '#fff' },
  sub: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  body: { padding: '28px 32px' },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 },
  input: {
    width: '100%', padding: '9px 12px', borderRadius: 'var(--radius)',
    border: '1.5px solid', background: 'var(--color-surface)',
    fontSize: 13.5, outline: 'none', transition: 'border-color 0.15s',
  },
  errorBox: {
    background: 'var(--red-light)', border: '1px solid var(--red-mid)',
    borderRadius: 'var(--radius)', padding: '9px 12px',
    fontSize: 13, color: 'var(--red)', marginBottom: 14,
  },
  btn: {
    width: '100%', padding: '10px 16px', borderRadius: 'var(--radius)',
    background: 'var(--red)', color: '#fff', border: 'none',
    fontSize: 14, fontWeight: 700, transition: 'background 0.14s', marginTop: 4,
  },
  link: { textAlign: 'center', fontSize: 13, color: 'var(--color-muted)', marginTop: 18 },
  devHint: {
    marginTop: 20, padding: '10px 14px',
    background: 'var(--amber-light)', borderRadius: 'var(--radius)',
    fontSize: 12, color: 'var(--color-text-2)', lineHeight: 1.5,
  },
}
