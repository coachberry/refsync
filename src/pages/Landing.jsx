import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/lib/firebase'
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore'
import styles from './Landing.module.css'

const IconCalendar = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
const IconCard     = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
const IconPhone    = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12" y2="18" strokeWidth="2.5"/></svg>
const IconBolt     = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
const IconReceipt  = () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8z"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
const IconClipboard= () => <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
const IconPuck     = () => <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="16" rx="10" ry="4"/><path d="M2 16V8a10 4 0 0 1 20 0v8"/><path d="M2 12a10 4 0 0 0 20 0"/></svg>
const IconShield   = () => <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>

const FEATURES = [
  { Icon: IconClipboard, title: 'Smart Scheduling',  desc: 'Game Directors send requests to schedulers. Schedulers fill crews. Everyone stays in sync.' },
  { Icon: IconCalendar,  title: 'Calendar Sync',     desc: 'Officials get games in Apple Calendar, Google Calendar, or Outlook — automatically.' },
  { Icon: IconCard,      title: 'Built-in Payments', desc: 'Directors pay schedulers. Schedulers pay officials. All via Stripe — no checks, no Venmo.' },
  { Icon: IconPhone,     title: 'SMS Reminders',     desc: 'Officials get texts 24 hours and 2 hours before every game. No more no-shows.' },
  { Icon: IconBolt,      title: 'Auto-Assign',       desc: 'One click fills open slots based on availability, certification, and workload balance.' },
  { Icon: IconReceipt,   title: 'Expense Reports',   desc: 'Officials submit mileage, hotel, and gear. Schedulers approve with one click.' },
]

const ROLES = [
  { Icon: IconPuck,      role: 'Game Directors', desc: 'Post events, connect with schedulers, pay invoices in-app. Know your crew is covered before puck drop.' },
  { Icon: IconClipboard, role: 'Schedulers',     desc: 'Manage your roster, assign officials, track payroll, and get paid — all in one place.' },
  { Icon: IconShield,    role: 'Officials',      desc: 'See your schedule, set availability, sync to your calendar, and get paid automatically.' },
]

function WaitlistForm({ label = 'Join the Waitlist', placeholder = 'Enter your email address' }) {
  const [email, setEmail]   = useState('')
  const [role, setRole]     = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) { setError('Enter a valid email address'); return }
    setLoading(true); setError('')
    try {
      // Check if already on waitlist
      const existing = await getDocs(query(collection(db, 'waitlist'), where('email', '==', email.toLowerCase().trim())))
      if (!existing.empty) { setSubmitted(true); return }
      await addDoc(collection(db, 'waitlist'), {
        email:     email.toLowerCase().trim(),
        role:      role || 'not specified',
        source:    'landing_page',
        createdAt: serverTimestamp(),
      })
      setSubmitted(true)
    } catch { setError('Something went wrong. Try again.') }
    finally { setLoading(false) }
  }

  if (submitted) return (
    <div className={styles.waitlistSuccess}>
      <div className={styles.waitlistSuccessIcon}>✓</div>
      <div className={styles.waitlistSuccessTitle}>You're on the list!</div>
      <div className={styles.waitlistSuccessSub}>We'll email you when GameCrewHQ opens. You'll be among the first in.</div>
    </div>
  )

  return (
    <form className={styles.waitlistForm} onSubmit={handleSubmit}>
      <div className={styles.waitlistRow}>
        <input
          className={styles.waitlistInput}
          type="email" placeholder={placeholder}
          value={email} onChange={e => { setEmail(e.target.value); setError('') }}
        />
        <select className={styles.waitlistSelect} value={role} onChange={e => setRole(e.target.value)}>
          <option value="">I am a…</option>
          <option value="game_director">Game Director</option>
          <option value="ref_scheduler">Referee Scheduler</option>
          <option value="sk_scheduler">Scorekeeper Scheduler</option>
          <option value="referee">Referee</option>
          <option value="scorekeeper">Scorekeeper</option>
        </select>
        <button className={styles.waitlistBtn} type="submit" disabled={loading}>
          {loading ? 'Joining…' : label}
        </button>
      </div>
      {error && <div className={styles.waitlistError}>{error}</div>}
    </form>
  )
}

export default function Landing() {
  const navigate = useNavigate()

  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className={styles.nav}>
        <img src="/logos/GAMECREWHQ-LOGO-LONG-BLKBG-transparent.png" alt="GameCrewHQ" className={styles.navLogo} />
        <div className={styles.navActions}>
          <button className={styles.navSignIn} onClick={() => navigate('/signin')}>Sign In</button>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>🚀 Coming Soon</div>
          <h1 className={styles.heroTitle}>
            The Game Crew<br />Management Platform
          </h1>
          <p className={styles.heroSub}>
            GameCrewHQ is the all-in-one platform for hockey officials, schedulers, and game directors. Schedule games, assign crews, sync calendars, and pay officials — automatically.
          </p>
          <p className={styles.heroSub} style={{ color:'rgba(255,255,255,.45)', fontSize:14, marginTop:-10 }}>
            We're putting the finishing touches on the platform. Join the waitlist to get early access when we launch.
          </p>
          <WaitlistForm label="Join the Waitlist" placeholder="Your email address" />
          <div className={styles.heroNote}>No spam · Unsubscribe anytime · Early access for waitlist members</div>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.heroCard}>
            <div className={styles.heroCardHeader}>
              <span className={styles.heroCardDot} style={{ background:'#ff5f56' }} />
              <span className={styles.heroCardDot} style={{ background:'#ffbd2e' }} />
              <span className={styles.heroCardDot} style={{ background:'#27c93f' }} />
            </div>
            <div className={styles.heroCardBody}>
              <div className={styles.mockGame}>
                <div className={styles.mockGameDate}>SAT JUN 14</div>
                <div className={styles.mockGameTitle}>Nashville Jr. Predators vs Chicago Steel</div>
                <div className={styles.mockGameMeta}>4:00 PM · Ford Ice Center · 14U AA</div>
                <div className={styles.mockCrew}>
                  <div className={styles.mockCrewItem} style={{ color:'var(--green)' }}>✓ Referee 1 — M. Johnson</div>
                  <div className={styles.mockCrewItem} style={{ color:'var(--green)' }}>✓ Referee 2 — K. Smith</div>
                  <div className={styles.mockCrewItem} style={{ color:'var(--green)' }}>✓ Linesman 1 — T. Williams</div>
                  <div className={styles.mockCrewItem} style={{ color:'var(--green)' }}>✓ Scorekeeper — A. Davis</div>
                </div>
                <div className={styles.mockBadge}>✅ Crew Filled</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className={styles.features}>
        <h2 className={styles.sectionTitle}>Everything your crew needs</h2>
        <div className={styles.featuresGrid}>
          {FEATURES.map(f => (
            <div key={f.title} className={styles.featureCard}>
              <div className={styles.featureIcon}><f.Icon /></div>
              <div className={styles.featureTitle}>{f.title}</div>
              <div className={styles.featureDesc}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section className={styles.roles}>
        <h2 className={styles.sectionTitle}>Built for every role</h2>
        <div className={styles.rolesGrid}>
          {ROLES.map(r => (
            <div key={r.role} className={styles.roleCard}>
              <div className={styles.roleIcon}><r.Icon /></div>
              <div className={styles.roleTitle}>{r.role}</div>
              <div className={styles.roleDesc}>{r.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing teaser */}
      <section className={styles.pricing}>
        <h2 className={styles.sectionTitle}>Simple pricing</h2>
        <p className={styles.pricingSub}>Start free. Pay only when your organization grows.</p>
        <div className={styles.pricingCards}>
          <div className={styles.pricingCard}>
            <div className={styles.pricingName}>Starter</div>
            <div className={styles.pricingPrice}>Free</div>
            <div className={styles.pricingDetail}>Up to 15 officials · 1% platform fee</div>
          </div>
          <div className={[styles.pricingCard, styles.pricingCardFeatured].join(' ')}>
            <div className={styles.pricingBadge}>Most Popular</div>
            <div className={styles.pricingName}>Pro</div>
            <div className={styles.pricingPrice}>$19<span>/mo</span></div>
            <div className={styles.pricingDetail}>Up to 50 officials · 0.75% platform fee</div>
          </div>
          <div className={styles.pricingCard}>
            <div className={styles.pricingName}>League</div>
            <div className={styles.pricingPrice}>$49<span>/mo</span></div>
            <div className={styles.pricingDetail}>Up to 150 officials · 0.5% platform fee</div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>Be first on the ice.</h2>
        <p className={styles.ctaSub}>Join the waitlist and get early access when GameCrewHQ launches.</p>
        <WaitlistForm label="Get Early Access" placeholder="Enter your email" />
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <img src="/logos/GAMECREWHQ-LOGO-LONG-BLKBG-transparent.png" alt="GameCrewHQ" className={styles.footerLogo} />
        <div className={styles.footerLinks}>
          <a href="mailto:support@gamecrewhq.com">Contact</a>
          <span>·</span>
          <a href="/privacy">Privacy</a>
          <span>·</span>
          <a href="/terms">Terms</a>
        </div>
        <div className={styles.footerCopy}>© 2026 GameCrewHQ. All rights reserved.</div>
      </footer>
    </div>
  )
}
