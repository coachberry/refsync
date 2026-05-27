import { useState } from 'react'
import { Link, useLocation, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import toast from 'react-hot-toast'
import styles from './Auth.module.css'

// Check if email is on the allowlist
const checkAllowlist = async (email) => {
  const snap = await getDocs(query(
    collection(db, 'allowlist'),
    where('email', '==', email.toLowerCase().trim())
  ))
  return !snap.empty
}

export default function SignIn() {
  const { signIn, user, activeRole, loading } = useAuth()
  const location = useLocation()

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState('')

  if (!loading && user) {
    const from = location.state?.from?.pathname ?? '/profile'
    return <Navigate to={from} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      // Check allowlist before attempting sign-in
      const allowed = await checkAllowlist(email)
      if (!allowed) {
        setError('This platform is currently in private beta. Join the waitlist at gamecrewhq.com to request access.')
        setSubmitting(false)
        return
      }
      await signIn(email, password)
      toast.success('Welcome back!')
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
          <img src="/logos/GAMECREWHQ-LOGO-LONG-BLKBG-transparent.png" alt="GameCrewHQ" className={styles.logo} />
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
