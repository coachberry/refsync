import { useState } from 'react'
import { Link, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'
import styles from './Auth.module.css'

export default function SignIn() {
  const { signIn, user, activeRole, loading } = useAuth()
  const location = useLocation()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')

  // Once auth resolves and user is logged in, redirect to profile
  if (!loading && user) {
    const from = location.state?.from?.pathname ?? '/profile'
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await signIn(email, password)
      toast.success('Welcome back!')
      // Navigate handled above once auth state updates
    } catch (err) {
      setError(
        err.code === 'auth/invalid-credential'
          ? 'Invalid email or password'
          : err.message ?? 'Sign in failed'
      )
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.outer}>
      <div className={styles.card} style={{ maxWidth: 420 }}>
        <div className={styles.header}>
          <div className={styles.logo}>Ref<span style={{ color: 'var(--red)' }}>Sync</span></div>
          <div className={styles.sub}>Hockey Officiating Platform</div>
        </div>

        <div className={styles.body}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Email</label>
              <input
                className={styles.input}
                type="email"
                placeholder="jordan@example.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>Password</label>
              <input
                className={styles.input}
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>

            {error && <div className={styles.errorBox}>{error}</div>}

            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? 'Signing in…' : 'Sign In →'}
            </button>
          </form>

          <p className={styles.link}>
            Don't have an account?{' '}
            <Link to="/signup" style={{ color: 'var(--red)', fontWeight: 600 }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
