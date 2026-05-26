import { useNavigate } from 'react-router-dom'
import styles from './Landing.module.css'

const FEATURES = [
  { icon: '📋', title: 'Smart Scheduling', desc: 'Game Directors send RFQs to schedulers. Schedulers fill crews. Everyone stays in sync.' },
  { icon: '📅', title: 'Calendar Sync',    desc: 'Officials get games in Apple Calendar, Google Calendar, or Outlook — automatically.' },
  { icon: '💳', title: 'Built-in Payments', desc: 'Directors pay schedulers. Schedulers pay officials. All via Stripe — no checks, no Venmo.' },
  { icon: '📱', title: 'SMS Reminders',    desc: 'Officials get texts 24 hours and 2 hours before every game. No more no-shows.' },
  { icon: '⚡', title: 'Auto-Assign',      desc: 'One click fills open slots based on availability, certification, and workload balance.' },
  { icon: '🧾', title: 'Expense Reports',  desc: 'Officials submit mileage, hotel, and gear. Schedulers approve with one click.' },
]

const ROLES = [
  { icon: '🏒', role: 'Game Directors', desc: 'Post events, connect with schedulers, pay invoices in-app. Know your crew is covered before puck drop.' },
  { icon: '📋', role: 'Schedulers',     desc: 'Manage your roster, assign officials, track payroll, and get paid — all in one place.' },
  { icon: '🦺', role: 'Officials',      desc: 'See your schedule, set availability, sync to your calendar, and get paid automatically.' },
]

export default function Landing() {
  const navigate = useNavigate()
  return (
    <div className={styles.page}>
      {/* Nav */}
      <nav className={styles.nav}>
        <img src="/logos/GAMECREWHQ-LOGO-LONG-BLKBG-transparent.png" alt="GameCrewHQ" className={styles.navLogo} />
        <div className={styles.navActions}>
          <button className={styles.navSignIn} onClick={() => navigate('/signin')}>Sign In</button>
          <button className={styles.navSignUp} onClick={() => navigate('/signup')}>Get Started Free</button>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero}>
        <div className={styles.heroContent}>
          <div className={styles.heroBadge}>Built for hockey officials</div>
          <h1 className={styles.heroTitle}>
            The Game Crew<br />Management Platform
          </h1>
          <p className={styles.heroSub}>
            Connect Game Directors, Schedulers, Referees, and Scorekeepers on one platform. Schedule games, assign officials, sync calendars, and pay your crew — automatically.
          </p>
          <div className={styles.heroCtas}>
            <button className={styles.ctaPrimary} onClick={() => navigate('/signup')}>Get Started Free</button>
            <button className={styles.ctaSecondary} onClick={() => navigate('/signin')}>Sign In</button>
          </div>
          <div className={styles.heroNote}>Free to start · No credit card required</div>
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
              <div className={styles.featureIcon}>{f.icon}</div>
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
              <div className={styles.roleIcon}>{r.icon}</div>
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

      {/* CTA */}
      <section className={styles.cta}>
        <h2 className={styles.ctaTitle}>Ready to run a tighter crew?</h2>
        <p className={styles.ctaSub}>Join game directors, schedulers, and officials who use GameCrewHQ to run smoother games.</p>
        <button className={styles.ctaPrimary} onClick={() => navigate('/signup')}>Get Started Free</button>
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
