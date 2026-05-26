import { Card, CardHeader, CardTitle, CardBody } from '@/components/ui'
import styles from './Billing.module.css'

const TIERS = [
  { name: 'Starter',    officials: '1–15',   price: 'Free',   perMonth: 0,   features: ['Up to 15 officials', 'Unlimited games', 'Calendar sync', 'SMS reminders', '1% platform fee'] },
  { name: 'Pro',        officials: '16–50',  price: '$19/mo', perMonth: 19,  features: ['Up to 50 officials', 'Everything in Starter', 'Auto-assign', 'Expense reports', 'Priority support', '0.75% platform fee'] },
  { name: 'League',     officials: '51–150', price: '$49/mo', perMonth: 49,  features: ['Up to 150 officials', 'Everything in Pro', 'Multiple schedulers', 'Mileage tracking', 'Custom pay rates', '0.5% platform fee'] },
  { name: 'Enterprise', officials: '150+',   price: 'Custom', perMonth: null, features: ['Unlimited officials', 'Everything in League', 'Dedicated support', 'Custom integrations', 'No platform fee'] },
]

export default function Billing() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Billing & Plans</h1>
        <p className={styles.sub}>GameCrewHQ grows with your organization. Start free, upgrade when ready.</p>
      </div>

      <div className={styles.currentPlan}>
        <div className={styles.currentPlanLabel}>Current Plan</div>
        <div className={styles.currentPlanName}>Starter — Free</div>
        <div className={styles.currentPlanNote}>You're on the free plan. Upgrade to unlock more officials and lower platform fees.</div>
      </div>

      <div className={styles.tiersGrid}>
        {TIERS.map((tier, i) => (
          <div key={tier.name} className={[styles.tierCard, i === 1 ? styles.tierCardFeatured : ''].join(' ')}>
            {i === 1 && <div className={styles.tierBadge}>Most Popular</div>}
            <div className={styles.tierName}>{tier.name}</div>
            <div className={styles.tierOfficials}>{tier.officials} officials</div>
            <div className={styles.tierPrice}>{tier.price}</div>
            {tier.perMonth !== null && tier.perMonth > 0 && <div className={styles.tierPriceSub}>per month</div>}
            <ul className={styles.tierFeatures}>
              {tier.features.map(f => <li key={f}><span className={styles.check}>✓</span>{f}</li>)}
            </ul>
            <button className={[styles.tierBtn, i === 1 ? styles.tierBtnFeatured : '', i === 0 ? styles.tierBtnCurrent : ''].join(' ')}
              onClick={() => i > 0 && alert('Contact support@gamecrewhq.com to upgrade')}>
              {i === 0 ? 'Current Plan' : i === 3 ? 'Contact Us' : 'Upgrade'}
            </button>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>How Platform Fees Work</CardTitle></CardHeader>
        <CardBody>
          <p style={{ fontSize:13.5, color:'var(--color-muted)', lineHeight:1.7, margin:0 }}>
            A small percentage is deducted from each Stripe payment processed through GameCrewHQ — both director→scheduler and scheduler→official payments. This is handled automatically by Stripe. No hidden fees, no minimums, no setup cost on the Starter plan.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
