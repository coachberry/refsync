/**
 * services/stripe.js
 * Frontend Stripe service — calls Firebase Cloud Functions
 * Never puts the secret key in the frontend
 */
import { loadStripe } from '@stripe/stripe-js'

const FUNCTIONS_BASE = import.meta.env.DEV
  ? 'http://127.0.0.1:5001/refsync-c1a46/us-central1'
  : 'https://us-central1-refsync-c1a46.cloudfunctions.net'

// createConnectAccountLink deployed to Cloud Run with a different URL
const CONNECT_ACCOUNT_URL = import.meta.env.DEV
  ? 'http://127.0.0.1:5001/refsync-c1a46/us-central1/createConnectAccountLink'
  : 'https://createconnectaccountlink-hmh3r2a4ra-uc.a.run.app'

// Stripe.js instance (publishable key only)
let stripePromise = null
export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  }
  return stripePromise
}

// ── Call a Cloud Function ─────────────────────────────────────────────────────
const callFunction = async (name, body) => {
  const res = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `${name} failed`)
  return data
}

// ── Connect bank account (onboarding) ────────────────────────────────────────
export const connectBankAccount = (uid, email, name) => {
  const body = {
    uid, email, name,
    returnUrl:  `${window.location.origin}/profile/finances?stripe=success`,
    refreshUrl: `${window.location.origin}/profile/finances?stripe=refresh`,
  }
  return fetch(CONNECT_ACCOUNT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); return d })
}

// ── Pay an invoice (director → scheduler) ────────────────────────────────────
export const createInvoicePayment = (invoiceId, directorUid, schedulerUid, amountDollars, paymentMethod = 'card') =>
  callFunction('createPaymentIntent', { invoiceId, directorUid, schedulerUid, amountDollars, paymentMethod })

// ── Pay an official (scheduler → official) ───────────────────────────────────
export const payOfficial = (paymentId, schedulerUid, officialUid, amountDollars, description) =>
  callFunction('payOfficial', { paymentId, schedulerUid, officialUid, amountDollars, description })

// ── Get Stripe Express Dashboard link ────────────────────────────────────────
export const getStripeDashboardLink = (uid) =>
  callFunction('getStripeDashboardLink', { uid })
