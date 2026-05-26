const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')
const admin  = require('firebase-admin')
const stripe = require('stripe')

admin.initializeApp()
const db = admin.firestore()

const STRIPE_SECRET = defineSecret('STRIPE_SECRET_KEY')

const getStripe = () => {
  const val = STRIPE_SECRET.value()
  // Handle both plain string "sk_test_..." and JSON {"stripe":{"secret":"sk_test_..."}}
  let secretKey = val
  if (typeof val === 'string' && val.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(val)
      secretKey = parsed?.stripe?.secret ?? parsed?.secret ?? val
    } catch { secretKey = val }
  }
  return stripe(secretKey)
}

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const withCors = (req, res, handler) => {
  Object.entries(corsHeaders).forEach(([k, v]) => res.set(k, v))
  if (req.method === 'OPTIONS') { res.status(204).send(''); return }
  return handler()
}

// ── 1. Create Connect Account Link ────────────────────────────────────────────
exports.createConnectAccountLink = onRequest(
  { secrets: [STRIPE_SECRET] },
  async (req, res) => withCors(req, res, async () => {
    try {
      const { uid, email, name, returnUrl, refreshUrl } = req.body
      if (!uid || !email) { res.status(400).json({ error: 'uid and email required' }); return }

      const S = getStripe()
      console.log('createConnectAccountLink called for uid:', uid)
      const userDoc = await db.collection('users').doc(uid).get()
      let stripeAccountId = userDoc.data()?.stripeAccountId

      if (!stripeAccountId) {
        const account = await S.accounts.create({
          type: 'express', email,
          capabilities: { transfers: { requested: true }, card_payments: { requested: true } },
          business_type: 'individual',
          metadata: { uid, name },
        })
        stripeAccountId = account.id
        await db.collection('users').doc(uid).update({
          stripeAccountId, stripeOnboarded: false,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      const accountLink = await S.accountLinks.create({
        account: stripeAccountId,
        refresh_url: refreshUrl ?? 'https://refsync-nine.vercel.app/profile/finances',
        return_url:  returnUrl  ?? 'https://refsync-nine.vercel.app/profile/finances?stripe=success',
        type: 'account_onboarding',
      })

      res.json({ url: accountLink.url, accountId: stripeAccountId })
    } catch (err) {
      console.error('createConnectAccountLink error:', err)
      res.status(500).json({ error: err.message })
    }
  })
)

// ── 2. Create Payment Intent (Director pays Invoice) ──────────────────────────
exports.createPaymentIntent = onRequest(
  { secrets: [STRIPE_SECRET] },
  async (req, res) => withCors(req, res, async () => {
    try {
      const { invoiceId, directorUid, schedulerUid, amountDollars, paymentMethod = 'card' } = req.body
      if (!invoiceId || !directorUid || !schedulerUid || !amountDollars) {
        res.status(400).json({ error: 'invoiceId, directorUid, schedulerUid, amountDollars required' }); return
      }

      const S = getStripe()
      const schedulerDoc = await db.collection('users').doc(schedulerUid).get()
      const stripeAccountId = schedulerDoc.data()?.stripeAccountId
      if (!stripeAccountId) { res.status(400).json({ error: 'Scheduler has not connected their bank account yet' }); return }

      const amountCents = Math.round(amountDollars * 100)
      const feeAmountCents = paymentMethod === 'us_bank_account'
        ? Math.min(Math.round(amountCents * 0.008), 500)
        : Math.round(amountCents * 0.029) + 30
      const totalCents = amountCents + feeAmountCents

      const paymentIntent = await S.paymentIntents.create({
        amount: totalCents, currency: 'usd',
        payment_method_types: paymentMethod === 'us_bank_account' ? ['us_bank_account'] : ['card'],
        transfer_data: { destination: stripeAccountId, amount: amountCents },
        metadata: { invoiceId, directorUid, schedulerUid, originalAmount: amountDollars },
        description: `RefSync invoice ${invoiceId}`,
      })

      await db.collection('invoices').doc(invoiceId).update({
        stripePaymentIntentId: paymentIntent.id,
        status: 'payment_pending',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
        totalAmount: totalCents / 100,
        feeAmount: feeAmountCents / 100,
        originalAmount: amountDollars,
      })
    } catch (err) {
      console.error('createPaymentIntent error:', err)
      res.status(500).json({ error: err.message })
    }
  })
)

// ── 3. Pay Official (Scheduler pays Referee/Scorekeeper) ──────────────────────
exports.payOfficial = onRequest(
  { secrets: [STRIPE_SECRET] },
  async (req, res) => withCors(req, res, async () => {
    try {
      const { paymentId, schedulerUid, officialUid, amountDollars, description } = req.body
      if (!schedulerUid || !officialUid || !amountDollars) {
        res.status(400).json({ error: 'schedulerUid, officialUid, amountDollars required' }); return
      }

      const S = getStripe()
      const [schedulerDoc, officialDoc] = await Promise.all([
        db.collection('users').doc(schedulerUid).get(),
        db.collection('users').doc(officialUid).get(),
      ])

      const schedulerStripeId = schedulerDoc.data()?.stripeAccountId
      const officialStripeId  = officialDoc.data()?.stripeAccountId
      if (!schedulerStripeId) { res.status(400).json({ error: 'Scheduler has not connected their bank account' }); return }
      if (!officialStripeId)  { res.status(400).json({ error: 'Official has not connected their bank account yet' }); return }

      const transfer = await S.transfers.create({
        amount: Math.round(amountDollars * 100),
        currency: 'usd',
        destination: officialStripeId,
        description: description ?? 'RefSync game payment',
        metadata: { paymentId: paymentId ?? '', schedulerUid, officialUid },
      }, { stripeAccount: schedulerStripeId })

      if (paymentId) {
        await db.collection('payments').doc(paymentId).update({
          stripeTransferId: transfer.id,
          status: 'paid',
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      res.json({ transferId: transfer.id, amount: amountDollars })
    } catch (err) {
      console.error('payOfficial error:', err)
      res.status(500).json({ error: err.message })
    }
  })
)

// ── 4. Get Stripe Express Dashboard Link ──────────────────────────────────────
exports.getStripeDashboardLink = onRequest(
  { secrets: [STRIPE_SECRET] },
  async (req, res) => withCors(req, res, async () => {
    try {
      const { uid } = req.body
      if (!uid) { res.status(400).json({ error: 'uid required' }); return }

      const S = getStripe()
      const userDoc = await db.collection('users').doc(uid).get()
      const stripeAccountId = userDoc.data()?.stripeAccountId
      if (!stripeAccountId) { res.status(400).json({ error: 'No Stripe account found' }); return }

      const loginLink = await S.accounts.createLoginLink(stripeAccountId)
      res.json({ url: loginLink.url })
    } catch (err) {
      console.error('getStripeDashboardLink error:', err)
      res.status(500).json({ error: err.message })
    }
  })
)

// ── 5. Stripe Webhook ─────────────────────────────────────────────────────────
exports.stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET] },
  async (req, res) => {
    const S   = getStripe()
    const sig = req.headers['stripe-signature']
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    let event
    try {
      event = webhookSecret
        ? S.webhooks.constructEvent(req.rawBody, sig, webhookSecret)
        : JSON.parse(req.body)
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`); return
    }

    try {
      switch (event.type) {
        case 'payment_intent.succeeded': {
          const pi = event.data.object
          const { invoiceId, schedulerUid } = pi.metadata ?? {}
          if (invoiceId) {
            await db.collection('invoices').doc(invoiceId).update({ status: 'paid', paidAt: admin.firestore.FieldValue.serverTimestamp() })
            if (schedulerUid) await db.collection('notifications').add({
              uid: schedulerUid, type: 'invoice', title: 'Invoice Paid',
              message: `Payment of $${(pi.amount_received / 100).toFixed(2)} received.`,
              read: false, link: '/profile/finances', createdAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          }
          break
        }
        case 'payment_intent.payment_failed': {
          const pi = event.data.object
          const { invoiceId, directorUid } = pi.metadata ?? {}
          if (invoiceId) {
            await db.collection('invoices').doc(invoiceId).update({ status: 'failed' })
            if (directorUid) await db.collection('notifications').add({
              uid: directorUid, type: 'invoice', title: 'Payment Failed',
              message: 'Your invoice payment failed. Please try again.',
              read: false, link: '/profile/finances', createdAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          }
          break
        }
        case 'account.updated': {
          const account = event.data.object
          if (account.charges_enabled && account.payouts_enabled) {
            const snap = await db.collection('users').where('stripeAccountId', '==', account.id).limit(1).get()
            if (!snap.empty) {
              await snap.docs[0].ref.update({ stripeOnboarded: true, updatedAt: admin.firestore.FieldValue.serverTimestamp() })
              await db.collection('notifications').add({
                uid: snap.docs[0].id, type: 'connection', title: 'Bank Account Connected',
                message: 'Your Stripe account is active. You can now send and receive payments.',
                read: false, link: '/profile/finances', createdAt: admin.firestore.FieldValue.serverTimestamp(),
              })
            }
          }
          break
        }
        case 'transfer.created': {
          const transfer = event.data.object
          const { officialUid } = transfer.metadata ?? {}
          if (officialUid) await db.collection('notifications').add({
            uid: officialUid, type: 'invoice', title: 'Payment Received',
            message: `$${(transfer.amount / 100).toFixed(2)} has been sent to your bank account.`,
            read: false, link: '/profile/finances', createdAt: admin.firestore.FieldValue.serverTimestamp(),
          })
          break
        }
        default: console.log(`Unhandled event: ${event.type}`)
      }
      res.json({ received: true })
    } catch (err) {
      console.error('Webhook error:', err)
      res.status(500).json({ error: err.message })
    }
  }
)

// ─────────────────────────────────────────────────────────────────────────────
// 6. SEND EMAIL NOTIFICATION
//    Uses Resend API for transactional emails
//    Set RESEND_API_KEY secret: firebase functions:secrets:set RESEND_API_KEY
// ─────────────────────────────────────────────────────────────────────────────
const RESEND_API_KEY = defineSecret('RESEND_API_KEY')

exports.sendEmailNotification = onRequest(
  { secrets: [RESEND_API_KEY] },
  async (req, res) => withCors(req, res, async () => {
    try {
      const { to, subject, html, type } = req.body
      if (!to || !subject || !html) {
        res.status(400).json({ error: 'to, subject, html required' }); return
      }

      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${RESEND_API_KEY.value()}`,
        },
        body: JSON.stringify({
          from: 'RefSync <notifications@refsync-nine.vercel.app>',
          to:   [to],
          subject,
          html,
        }),
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.message ?? 'Email send failed')
      res.json({ id: data.id })
    } catch (err) {
      console.error('sendEmailNotification error:', err)
      res.status(500).json({ error: err.message })
    }
  })
)
