import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'

const ROLE_OPTIONS = [
  {
    id: 'official',
    icon: '🏒',
    name: 'Referee / Official / Scorekeeper',
    desc: 'Accept game assignments, manage your schedule, track earnings & mileage',
    color: 'var(--red)',
  },
  {
    id: 'scheduler',
    icon: '📋',
    name: 'Scheduler / Assigner',
    desc: 'Assign officials to games, manage rosters, handle payroll & invoicing',
    color: 'var(--teal)',
  },
  {
    id: 'director',
    icon: '🏆',
    name: 'Tournament / League Director',
    desc: 'Post games, request schedulers, manage your event or league',
    color: 'var(--blue)',
  },
]

export default function SignUp() {
  const { signUp } = useAuth()
  const navigate = useNavigate()

  const [step, setStep] = useState(1) // 1 = account info, 2 = role select
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ displayName: '', email: '', password: '', confirmPassword: '' })
  const [roles, setRoles] = useState([])
  const [errors, setErrors] = useState({})

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })) }

  const validateStep1 = () => {
    const errs = {}
    if (!form.displayName.trim()) errs.displayName = 'Name is required'
    if (!form.email.trim()) errs.email = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = 'Enter a valid email'
    if (!form.password) errs.password = 'Password is required'
    else if (form.password.length < 6) errs.password = 'Minimum 6 characters'
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  const toggleRole = (id) => {
    setRoles(r => r.includes(id) ? r.filter(x => x !== id) : [...r, id])
  }

  const handleSubmit = async () => {
    if (!roles.length) { toast.error('Select at least one role'); return }
    setLoading(true)
    try {
      await signUp({ ...form, roles })
      toast.success('Welcome to RefSync!')
      // Route to first selected role
      navigate(`/${roles[0]}`, { replace: true })
    } catch (err) {
      toast.error(err.message ?? 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.outer}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logo}>Ref<span style={{ color: 'var(--red)' }}>Sync</span></div>
          <div style={styles.logoSub}>Hockey Officiating Platform</div>
        </div>

        <div style={styles.body}>
          {/* Step indicator */}
          <div style={styles.steps}>
            {['Account', 'Your Role'].map((lbl, i) => (
              <div key={i} style={styles.stepItem}>
                <div style={{ ...styles.stepDot, background: step > i ? 'var(--red)' : step === i + 1 ? 'var(--red)' : 'var(--color-border-strong)', opacity: step === i + 1 ? 1 : step > i + 1 ? 1 : 0.35 }}>
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: step === i + 1 ? 'var(--color-text)' : 'var(--color-muted)' }}>{lbl}</span>
              </div>
            ))}
            <div style={styles.stepLine} />
          </div>

          {/* ── Step 1: Account Info ── */}
          {step === 1 && (
            <div>
              <Field label="Full Name" error={errors.displayName}>
                <input style={inputStyle(errors.displayName)} placeholder="Jordan Mackay" value={form.displayName} onChange={e => set('displayName', e.target.value)} />
              </Field>
              <Field label="Email" error={errors.email}>
                <input style={inputStyle(errors.email)} type="email" placeholder="jordan@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
              <Field label="Password" error={errors.password}>
                <input style={inputStyle(errors.password)} type="password" placeholder="Min. 6 characters" value={form.password} onChange={e => set('password', e.target.value)} />
              </Field>
              <Field label="Confirm Password" error={errors.confirmPassword}>
                <input style={inputStyle(errors.confirmPassword)} type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} />
              </Field>
              <button
                style={{ ...styles.btnPrimary, marginTop: 4 }}
                onClick={() => validateStep1() && setStep(2)}
              >
                Continue →
              </button>
              <p style={styles.signInLink}>
                Already have an account?{' '}
                <Link to="/signin" style={{ color: 'var(--red)', fontWeight: 600 }}>Sign in</Link>
              </p>
            </div>
          )}

          {/* ── Step 2: Role Selection ── */}
          {step === 2 && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 16 }}>
                Select all that apply — you can switch between roles with one login.
              </p>
              {ROLE_OPTIONS.map(r => {
                const picked = roles.includes(r.id)
                return (
                  <div
                    key={r.id}
                    onClick={() => toggleRole(r.id)}
                    style={{
                      ...styles.roleCard,
                      borderColor: picked ? r.color : 'var(--color-border)',
                      background: picked ? `${r.color}09` : 'var(--color-surface)',
                    }}
                  >
                    <span style={{ fontSize: 24, flexShrink: 0 }}>{r.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: 'var(--color-muted)', marginTop: 2 }}>{r.desc}</div>
                    </div>
                    {picked && <span style={{ color: r.color, fontSize: 18, fontWeight: 700, flexShrink: 0 }}>✓</span>}
                  </div>
                )
              })}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button style={styles.btnSecondary} onClick={() => setStep(1)}>← Back</button>
                <button
                  style={{ ...styles.btnPrimary, flex: 2, opacity: roles.length ? 1 : 0.5 }}
                  onClick={handleSubmit}
                  disabled={loading || !roles.length}
                >
                  {loading ? 'Creating account…' : 'Create Account →'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Field({ label, error, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5 }}>{label}</label>
      {children}
      {error && <p style={{ fontSize: 11.5, color: 'var(--red)', marginTop: 4 }}>{error}</p>}
    </div>
  )
}

const inputStyle = (error) => ({
  width: '100%', padding: '9px 12px', borderRadius: 'var(--radius)',
  border: `1.5px solid ${error ? 'var(--red)' : 'var(--color-border)'}`,
  background: 'var(--color-surface)', fontSize: 13.5, outline: 'none',
  transition: 'border-color 0.15s',
})

const styles = {
  outer: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 20, background: 'var(--color-bg)',
  },
  card: {
    width: '100%', maxWidth: 460,
    background: 'var(--color-surface)',
    borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--color-border)',
    boxShadow: 'var(--shadow-lg)',
    overflow: 'hidden',
  },
  header: {
    background: 'var(--sidebar-bg)', padding: '28px 32px', textAlign: 'center',
  },
  logo: {
    fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: '#fff',
  },
  logoSub: { fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 },
  body: { padding: '28px 32px' },
  steps: {
    display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24, position: 'relative',
  },
  stepItem: { display: 'flex', alignItems: 'center', gap: 8, zIndex: 1 },
  stepDot: {
    width: 26, height: 26, borderRadius: '50%',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0,
  },
  stepLine: {
    position: 'absolute', top: 13, left: 34, right: 0, height: 1,
    background: 'var(--color-border)', zIndex: 0,
  },
  roleCard: {
    display: 'flex', alignItems: 'flex-start', gap: 14,
    border: '2px solid', borderRadius: 'var(--radius-md)',
    padding: '14px 16px', cursor: 'pointer',
    marginBottom: 10, transition: 'all 0.14s',
  },
  btnPrimary: {
    width: '100%', padding: '10px 16px', borderRadius: 'var(--radius)',
    background: 'var(--red)', color: '#fff', border: 'none',
    fontSize: 14, fontWeight: 700, transition: 'background 0.14s',
  },
  btnSecondary: {
    flex: 1, padding: '10px 16px', borderRadius: 'var(--radius)',
    background: 'var(--color-bg)', color: 'var(--color-text)',
    border: '1px solid var(--color-border)', fontSize: 14, fontWeight: 600,
  },
  signInLink: { textAlign: 'center', fontSize: 13, color: 'var(--color-muted)', marginTop: 16 },
}
