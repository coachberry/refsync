/**
 * services/stripe.js
 * Frontend Stripe service — calls Firebase Cloud Functions
 * Never puts the secret key in the frontend
 */
import { loadStripe } from '@stripe/stripe-js'

const FUNCTIONS = {
  createConnectAccountLink: 'https://createconnectaccountlink-hmh3r2a4ra-uc.a.run.app',
  createPaymentIntent:      'https://createpaymentintent-hmh3r2a4ra-uc.a.run.app',
  payOfficial:              'https://payofficial-hmh3r2a4ra-uc.a.run.app',
  getStripeDashboardLink:   'https://getstripedashboardlink-hmh3r2a4ra-uc.a.run.app',
  stripeWebhook:            'https://stripewebhook-hmh3r2a4ra-uc.a.run.app',
}

const DEV_BASE = 'http://127.0.0.1:5001/refsync-c1a46/us-central1'

const callFunction = async (name, body) => {
  const url = import.meta.env.DEV
    ? `${DEV_BASE}/${name}`
    : FUNCTIONS[name]
  const res  = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error ?? `${name} failed`)
  return data
}

// Stripe.js instance (publishable key only)
let stripePromise = null
export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  }
  return stripePromise
}

// ── Connect bank account (onboarding) ────────────────────────────────────────
export const connectBankAccount = (uid, email, name) =>
  callFunction('createConnectAccountLink', {
    uid, email, name,
    returnUrl:  `${window.location.origin}/profile/finances?stripe=success`,
    refreshUrl: `${window.location.origin}/profile/finances?stripe=refresh`,
  })

// ── Pay an invoice (director → scheduler) ────────────────────────────────────
export const createInvoicePayment = (invoiceId, directorUid, schedulerUid, amountDollars, paymentMethod = 'card') =>
  callFunction('createPaymentIntent', { invoiceId, directorUid, schedulerUid, amountDollars, paymentMethod })

// ── Pay an official (scheduler → official) ───────────────────────────────────
export const payOfficial = (paymentId, schedulerUid, officialUid, amountDollars, description) =>
  callFunction('payOfficial', { paymentId, schedulerUid, officialUid, amountDollars, description })

// ── Get Stripe Express Dashboard link ────────────────────────────────────────
export const getStripeDashboardLink = (uid) =>
  callFunction('getStripeDashboardLink', { uid })
