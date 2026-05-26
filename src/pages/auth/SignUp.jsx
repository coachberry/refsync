import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import toast from 'react-hot-toast'
import styles from './Auth.module.css'

// ── Role definitions ──────────────────────────────────────────────────────────
const ROLES = [
  {
    id: 'director',
    icon: '🏆',
    name: 'Game Director',
    desc: 'Post games, request schedulers, manage your event or league',
    color: 'var(--blue)',
    subRoles: [],
  },
  {
    id: 'scheduler',
    icon: '📋',
    name: 'Scheduler',
    desc: 'Assign officials to games, manage rosters, handle payroll & invoicing',
    color: 'var(--teal)',
    subRoles: [
      { id: 'ref_scheduler', label: 'Referee Scheduler', desc: 'Schedule and manage referees' },
      { id: 'sk_scheduler',  label: 'Scorekeeper Scheduler', desc: 'Schedule and manage scorekeepers' },
    ],
  },
  {
    id: 'official',
    icon: '🏒',
    name: 'Official',
    desc: 'Accept game assignments, manage your schedule, track earnings & mileage',
    color: 'var(--red)',
    subRoles: [
      { id: 'referee',     label: 'Referee',     desc: 'Officiate games on the ice' },
      { id: 'scorekeeper', label: 'Scorekeeper', desc: 'Keep score and manage game sheets' },
    ],
  },
]

export default function SignUp() {
  const { signUp } = useAuth()
  const navigate   = useNavigate()

  const [step, setStep]       = useState(1)
  const [loading, setLoading] = useState(false)
  const [form, setForm]       = useState({ displayName: '', email: '', password: '', confirmPassword: '' })
  const [errors, setErrors]   = useState({})
  const [selectedRoles, setSelectedRoles]    = useState([])
  const [selectedSubRoles, setSelectedSubRoles] = useState([])

  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setErrors(e => ({ ...e, [k]: '' })) }

  const validateStep1 = () => {
    const errs = {}
    if (!form.displayName.trim())              errs.displayName     = 'Name is required'
    if (!form.email.trim())                    errs.email           = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email           = 'Enter a valid email'
    if (!form.password)                        errs.password        = 'Password is required'
    else if (form.password.length < 6)         errs.password        = 'Minimum 6 characters'
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match'
    setErrors(errs)
    return !Object.keys(errs).length
  }

  const toggleRole = (id) =>
    setSelectedRoles(rs => rs.includes(id) ? rs.filter(x => x !== id) : [...rs, id])

  const toggleSubRole = (id) =>
    setSelectedSubRoles(ss => ss.includes(id) ? ss.filter(x => x !== id) : [...ss, id])

  // Which top-level roles require sub-role selection
  const needsSubRoles = selectedRoles.filter(r => ROLES.find(x => x.id === r)?.subRoles?.length > 0)

  const handleSubmit = async () => {
    if (!selectedRoles.length) { toast.error('Select at least one role'); return }

    // Validate sub-roles: each selected role with sub-roles must have at least one sub-role chosen
    for (const roleId of needsSubRoles) {
      const role = ROLES.find(r => r.id === roleId)
      const hasOne = role.subRoles.some(sr => selectedSubRoles.includes(sr.id))
      if (!hasOne) {
        toast.error(`Choose at least one type for ${role.name}`)
        return
      }
    }

    setLoading(true)
    try {
      await signUp({ ...form, roles: selectedRoles, subRoles: selectedSubRoles })
      toast.success('Welcome to GameCrewHQ!')
      navigate(`/${selectedRoles[0]}`, { replace: true })
    } catch (err) {
      toast.error(err.message ?? 'Sign up failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.outer}>
      <div className={styles.card} style={{ maxWidth: 480 }}>
        <div className={styles.header}>
          <img src="/logos/GAMECREWHQ-LOGO-LONG-BLKBG-transparent.png" alt="GameCrewHQ" className={styles.logo} />
          <div className={styles.sub}>Hockey Officiating Platform</div>
        </div>

        <div className={styles.body}>
          {/* Step indicator */}
          <div className={styles.steps}>
            {['Account', 'Your Role(s)'].map((lbl, i) => (
              <div key={i} className={styles.stepItem}>
                <div
                  className={styles.stepDot}
                  style={{ background: step > i + 1 ? 'var(--teal)' : step === i + 1 ? 'var(--red)' : 'var(--color-border-strong)' }}
                >
                  {step > i + 1 ? '✓' : i + 1}
                </div>
                <span className={styles.stepLabel} style={{ color: step === i + 1 ? 'var(--color-text)' : 'var(--color-muted)' }}>
                  {lbl}
                </span>
              </div>
            ))}
            <div className={styles.stepLine} />
          </div>

          {/* ── Step 1 ── */}
          {step === 1 && (
            <div>
              <Field label="Full Name" error={errors.displayName}>
                <input className={styles.input} placeholder="Jordan Mackay" value={form.displayName} onChange={e => set('displayName', e.target.value)} />
              </Field>
              <Field label="Email" error={errors.email}>
                <input className={styles.input} type="email" placeholder="jordan@example.com" value={form.email} onChange={e => set('email', e.target.value)} />
              </Field>
              <Field label="Password" error={errors.password}>
                <input className={styles.input} type="password" placeholder="Min. 6 characters" value={form.password} onChange={e => set('password', e.target.value)} />
              </Field>
              <Field label="Confirm Password" error={errors.confirmPassword}>
                <input className={styles.input} type="password" placeholder="Repeat password" value={form.confirmPassword} onChange={e => set('confirmPassword', e.target.value)} />
              </Field>
              <button className={styles.btnPrimary} onClick={() => validateStep1() && setStep(2)}>
                Continue →
              </button>
              <p className={styles.link}>
                Already have an account?{' '}
                <Link to="/signin" style={{ color: 'var(--red)', fontWeight: 600 }}>Sign in</Link>
              </p>
            </div>
          )}

          {/* ── Step 2 ── */}
          {step === 2 && (
            <div>
              <p style={{ fontSize: 13, color: 'var(--color-muted)', marginBottom: 16 }}>
                Select all that apply. You can add more roles later from your account settings.
              </p>

              {ROLES.map(role => {
                const picked = selectedRoles.includes(role.id)
                return (
                  <div key={role.id}>
                    <div
                      className={styles.roleCard}
                      style={{
                        borderColor: picked ? role.color : 'var(--color-border)',
                        background: picked ? `${role.color}09` : 'var(--color-surface)',
                      }}
                      onClick={() => toggleRole(role.id)}
                    >
                      <span className={styles.roleCardIcon}>{role.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div className={styles.roleCardName}>{role.name}</div>
                        <div className={styles.roleCardDesc}>{role.desc}</div>
                      </div>
                      {picked && <span style={{ color: role.color, fontSize: 18, fontWeight: 700, flexShrink: 0 }}>✓</span>}
                    </div>

                    {/* Sub-roles — shown when parent role is selected */}
                    {picked && role.subRoles.length > 0 && (
                      <div style={{ marginLeft: 16, marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {role.subRoles.map(sr => {
                          const subPicked = selectedSubRoles.includes(sr.id)
                          return (
                            <div
                              key={sr.id}
                              onClick={() => toggleSubRole(sr.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '9px 14px', borderRadius: 'var(--radius)',
                                border: `1.5px solid ${subPicked ? role.color : 'var(--color-border)'}`,
                                background: subPicked ? `${role.color}08` : 'var(--color-surface-2)',
                                cursor: 'pointer', transition: 'all .13s',
                              }}
                            >
                              <div style={{
                                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                border: `2px solid ${subPicked ? role.color : 'var(--color-border)'}`,
                                background: subPicked ? role.color : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                              }}>
                                {subPicked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600 }}>{sr.label}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-muted)' }}>{sr.desc}</div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}

              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button className={styles.btnSecondary} onClick={() => setStep(1)}>← Back</button>
                <button
                  className={styles.btnPrimary}
                  style={{ flex: 2, opacity: selectedRoles.length ? 1 : 0.5 }}
                  onClick={handleSubmit}
                  disabled={loading || !selectedRoles.length}
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
