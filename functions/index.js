const { onRequest } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
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

// ── 7. Auto-complete games and generate payroll ───────────────────────────────
exports.autoCompleteGames = onSchedule(
  { schedule: 'every 15 minutes', timeZone: 'America/Chicago' },
  async () => {
    const now = admin.firestore.Timestamp.now()
    console.log('autoCompleteGames running at', now.toDate().toISOString())

    // Query all assigned/open games that haven't been completed yet
    const gamesSnap = await db.collection('games')
      .where('status', 'in', ['open', 'assigned'])
      .get()

    if (gamesSnap.empty) { console.log('No games to check'); return }

    const batch = db.batch()
    let completedCount = 0

    for (const gameDoc of gamesSnap.docs) {
      const game = gameDoc.data()

      // Parse game date and duration
      const gameDate = game.gameDate instanceof admin.firestore.Timestamp
        ? game.gameDate.toDate()
        : new Date(game.gameDate)

      const durationHours = Number(game.duration ?? 1.5)
      const endTime = new Date(gameDate.getTime() + durationHours * 60 * 60 * 1000)

      // Only complete if end time has passed
      if (endTime > now.toDate()) continue

      console.log(`Completing game ${gameDoc.id}: ${game.homeTeam} vs ${game.awayTeam}`)

      // Mark game as completed
      batch.update(gameDoc.ref, {
        status: 'completed',
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      completedCount++

      // Create a payroll record for each assigned official
      const assignedOfficials = game.assignedOfficials ?? []
      for (const official of assignedOfficials) {
        if (!official.uid) continue

        // Look up scheduler's pay rate for this official's role + division
        let pay = Number(official.pay ?? 0)

        // Find which scheduler owns this official's role
        const schedulerId = official.role?.toLowerCase().includes('scorekeeper')
          ? (game.skSchedulerId ?? game.schedulerId)
          : game.schedulerId

        // Try to look up from pricing sheet if pay is 0
        if (pay === 0 && schedulerId) {
          try {
            const sheetSnap = await db
              .collection('users').doc(schedulerId)
              .collection('pricingSheet').doc('data')
              .get()
            if (sheetSnap.exists) {
              const sheet = sheetSnap.data()
              const rule = (sheet.rules ?? []).find(r =>
                r.division?.toLowerCase() === game.division?.toLowerCase() &&
                r.role === official.role
              )
              pay = rule?.pay ?? sheet.defaultPay ?? 0
            }
          } catch (e) { console.warn('Could not load pricing sheet:', e.message) }
        }

        // Look up mileage reimbursement if official has a home address
        let mileageReimbursement = 0
        let miles = 0
        try {
          const homeAddress = userSnap.data()?.officialProfile?.homeAddress
          const venueAddress = game.venueAddress ?? game.venue
          if (homeAddress && venueAddress && process.env.GOOGLE_MAPS_KEY) {
            const mapsUrl = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(homeAddress)}&destinations=${encodeURIComponent(venueAddress)}&units=imperial&key=${process.env.GOOGLE_MAPS_KEY}`
            const mapsRes  = await fetch(mapsUrl)
            const mapsData = await mapsRes.json()
            const element  = mapsData?.rows?.[0]?.elements?.[0]
            if (element?.status === 'OK') {
              miles = element.distance.value / 1609.34
              mileageReimbursement = miles >= 50 ? Math.round(miles * 0.67 * 100) / 100 : 0
            }
          }
        } catch (e) { console.warn('Mileage calc failed:', e.message) }

        const paymentRef = db.collection('payments').doc()
        batch.set(paymentRef, {
          officialId:            official.uid,
          officialName:          official.name,
          schedulerId:           schedulerId ?? null,
          gameId:                gameDoc.id,
          groupId:               game.groupId ?? null,
          groupName:             game.groupName ?? '',
          homeTeam:              game.homeTeam,
          awayTeam:              game.awayTeam,
          gameDate:              game.gameDate,
          venue:                 game.venue ?? '',
          division:              game.division ?? '',
          role:                  official.role,
          amount:                pay,
          mileageReimbursement,
          miles:                 Math.round(miles * 10) / 10,
          totalAmount:           pay + mileageReimbursement,
          description:           `${official.role} — ${game.homeTeam} vs ${game.awayTeam}`,
          gameCount:             1,
          status:                'pending',
          createdAt:             admin.firestore.FieldValue.serverTimestamp(),
        })

        // Notify official they have a completed game
        const notifRef = db.collection('notifications').doc()
        batch.set(notifRef, {
          uid:       official.uid,
          type:      'payroll',
          title:     '✅ Game Completed',
          message:   `${game.homeTeam} vs ${game.awayTeam} has been completed. $${pay.toFixed(2)} added to your payroll.`,
          read:      false,
          link:      '/profile/finances',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }
    }

    await batch.commit()
    console.log(`Completed ${completedCount} games`)
  }
)

// ── 8. iCal Feed — officials subscribe once, games stay in sync ───────────────
exports.officialCalendarFeed = onRequest(
  { cors: true },
  async (req, res) => {
    const uid = req.query.uid
    const token = req.query.token
    if (!uid || !token) { res.status(400).send('Missing uid or token'); return }

    // Verify token matches stored token
    const userSnap = await db.collection('users').doc(uid).get()
    if (!userSnap.exists || userSnap.data().calendarToken !== token) {
      res.status(403).send('Invalid token'); return
    }

    // Fetch assigned games
    const gamesSnap = await db.collection('games')
      .where('assignedUids', 'array-contains', uid)
      .get()

    const ical = require('ical-generator').default
    const cal = ical({ name: 'GameCrewHQ Schedule', timezone: 'America/Chicago' })

    gamesSnap.docs.forEach(d => {
      const g = d.data()
      const gameDate = g.gameDate instanceof admin.firestore.Timestamp
        ? g.gameDate.toDate() : new Date(g.gameDate)
      const endDate = new Date(gameDate.getTime() + (g.duration ?? 1.5) * 3600000)
      const assigned = (g.assignedOfficials ?? []).find(o => o.uid === uid)

      cal.createEvent({
        id:          d.id,
        start:       gameDate,
        end:         endDate,
        summary:     `${g.homeTeam} vs ${g.awayTeam}`,
        description: [
          `Role: ${assigned?.role ?? 'Official'}`,
          `Division: ${g.division ?? '—'}`,
          `Duration: ${g.duration ?? 1.5}hr`,
          g.notes ? `Notes: ${g.notes}` : '',
        ].filter(Boolean).join('\n'),
        location:    g.venue ?? '',
        url:         'https://refsync-nine.vercel.app/official/schedule',
      })
    })

    res.set('Content-Type', 'text/calendar; charset=utf-8')
    res.set('Content-Disposition', 'attachment; filename="gamecrewhq.ics"')
    res.send(cal.toString())
  }
)

// ── 9. SMS Reminders via Twilio ───────────────────────────────────────────────
const TWILIO_SID    = defineSecret('TWILIO_ACCOUNT_SID')
const TWILIO_TOKEN  = defineSecret('TWILIO_AUTH_TOKEN')
const TWILIO_PHONE  = defineSecret('TWILIO_PHONE_NUMBER')

exports.sendGameReminders = onSchedule(
  { schedule: 'every 30 minutes', timeZone: 'America/Chicago', secrets: [TWILIO_SID, TWILIO_TOKEN, TWILIO_PHONE] },
  async () => {
    const twilio = require('twilio')
    const client = twilio(TWILIO_SID.value(), TWILIO_TOKEN.value())
    const from   = TWILIO_PHONE.value()
    const now    = new Date()

    // Find games starting in ~24 hours and ~2 hours
    const in24h  = new Date(now.getTime() + 23.5 * 3600000)
    const in24hE = new Date(now.getTime() + 24.5 * 3600000)
    const in2h   = new Date(now.getTime() +  1.5 * 3600000)
    const in2hE  = new Date(now.getTime() +  2.5 * 3600000)

    const windows = [
      { start: admin.firestore.Timestamp.fromDate(in24h), end: admin.firestore.Timestamp.fromDate(in24hE), label: '24h' },
      { start: admin.firestore.Timestamp.fromDate(in2h),  end: admin.firestore.Timestamp.fromDate(in2hE),  label: '2h'  },
    ]

    for (const window of windows) {
      const gamesSnap = await db.collection('games')
        .where('gameDate', '>=', window.start)
        .where('gameDate', '<=', window.end)
        .where('status', 'in', ['assigned', 'open'])
        .get()

      for (const gameDoc of gamesSnap.docs) {
        const g = gameDoc.data()
        const gameDate = g.gameDate.toDate()
        const timeStr  = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
        const dateStr  = gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' })

        for (const official of (g.assignedOfficials ?? [])) {
          if (!official.uid) continue
          // Check if reminder already sent
          const reminderKey = `${gameDoc.id}_${official.uid}_${window.label}`
          const sentSnap = await db.collection('smsReminders').doc(reminderKey).get()
          if (sentSnap.exists) continue

          // Get official's phone number
          const userSnap = await db.collection('users').doc(official.uid).get()
          const phone = userSnap.data()?.phone
          if (!phone) continue

          const msg = window.label === '24h'
            ? `GameCrewHQ: Reminder — you're scheduled for ${g.homeTeam} vs ${g.awayTeam} tomorrow (${dateStr}) at ${timeStr} at ${g.venue ?? 'TBD'}. Role: ${official.role ?? 'Official'}.`
            : `GameCrewHQ: Game in ~2 hours — ${g.homeTeam} vs ${g.awayTeam} at ${timeStr} at ${g.venue ?? 'TBD'}. See you on the ice!`

          try {
            await client.messages.create({ from, to: phone, body: msg })
            await db.collection('smsReminders').doc(reminderKey).set({ sentAt: admin.firestore.FieldValue.serverTimestamp() })
            console.log(`SMS sent to ${official.uid} for game ${gameDoc.id} (${window.label})`)
          } catch (e) { console.error(`SMS failed for ${official.uid}:`, e.message) }
        }
      }
    }
  }
)

// ── 10. Send SMS when official is newly assigned to a game ────────────────────
exports.sendAssignmentSMS = onRequest(
  { cors: true, secrets: [TWILIO_SID, TWILIO_TOKEN, TWILIO_PHONE] },
  async (req, res) => withCors(req, res, async () => {
    const { officialUid, gameId } = req.body
    if (!officialUid || !gameId) { res.status(400).json({ error: 'Missing fields' }); return }
    try {
      const [userSnap, gameSnap] = await Promise.all([
        db.collection('users').doc(officialUid).get(),
        db.collection('games').doc(gameId).get(),
      ])
      const phone = userSnap.data()?.phone
      if (!phone) { res.json({ skipped: 'no phone' }); return }
      const g = gameSnap.data()
      const gameDate = g.gameDate.toDate()
      const dateStr  = gameDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' })
      const timeStr  = gameDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
      const assigned = (g.assignedOfficials ?? []).find(o => o.uid === officialUid)
      const twilio   = require('twilio')
      const client   = twilio(TWILIO_SID.value(), TWILIO_TOKEN.value())
      await client.messages.create({
        from: TWILIO_PHONE.value(),
        to:   phone,
        body: `GameCrewHQ: You've been assigned to ${g.homeTeam} vs ${g.awayTeam} on ${dateStr} at ${timeStr} at ${g.venue ?? 'TBD'} as ${assigned?.role ?? 'Official'}. View details: https://refsync-nine.vercel.app`
      })
      res.json({ sent: true })
    } catch (err) { res.status(500).json({ error: err.message }) }
  })
)

// ── 11. Auto-Assign officials to a game ──────────────────────────────────────
exports.autoAssignGame = onRequest(
  { cors: true },
  async (req, res) => withCors(req, res, async () => {
    const { gameId, schedulerId, schedulerType } = req.body
    if (!gameId || !schedulerId) { res.status(400).json({ error: 'Missing fields' }); return }

    try {
      const gameSnap = await db.collection('games').doc(gameId).get()
      if (!gameSnap.exists) { res.status(404).json({ error: 'Game not found' }); return }
      const game = gameSnap.data()
      const gameDate = game.gameDate instanceof admin.firestore.Timestamp
        ? game.gameDate.toDate() : new Date(game.gameDate)
      const dateStr   = gameDate.toISOString().slice(0, 10)
      const gameTime  = `${String(gameDate.getHours()).padStart(2,'0')}:${String(gameDate.getMinutes()).padStart(2,'0')}`
      const durationH = Number(game.duration ?? 1.5)

      // Get roster for this scheduler
      const rosterSnap = await db.collection('connections')
        .where('fromUid', '==', schedulerId)
        .where('type', '==', 'scheduler-official')
        .where('status', '==', 'accepted')
        .get()
      const officialUids = rosterSnap.docs.map(d => d.data().toUid).filter(Boolean)

      if (!officialUids.length) { res.json({ assigned: [], message: 'No roster' }); return }

      // Load availability + game counts for each official
      const officialData = await Promise.all(officialUids.map(async uid => {
        const [userSnap, availSnap, gamesSnap] = await Promise.all([
          db.collection('users').doc(uid).get(),
          db.collection('users').doc(uid).collection('availability').doc('data').get(),
          db.collection('games').where('assignedUids', 'array-contains', uid).get(),
        ])
        if (!userSnap.exists) return null
        const user     = userSnap.data()
        const avail    = availSnap.exists ? availSnap.data() : {}
        const dayData  = avail[dateStr] ?? null
        const gameCount = gamesSnap.size

        // Check availability with 1hr buffer
        const bufferMins = 60
        const gameStartMins = parseInt(gameTime.split(':')[0]) * 60 + parseInt(gameTime.split(':')[1])
        const gameEndMins   = gameStartMins + durationH * 60
        const neededStart   = gameStartMins - bufferMins
        const neededEnd     = gameEndMins   + bufferMins

        let available = false
        if (!dayData || dayData.status === 'unavailable_all_day') available = false
        else if (dayData.status === 'available_all_day') available = true
        else if (dayData.status === 'partial') {
          available = (dayData.windows ?? []).some(w => {
            const ws = parseInt(w.start.split(':')[0])*60 + parseInt(w.start.split(':')[1])
            const we = parseInt(w.end.split(':')[0])*60   + parseInt(w.end.split(':')[1])
            return ws <= neededStart && we >= neededEnd
          })
        }

        // Filter by scheduler type
        const subRoles = user.subRoles ?? []
        const isRef = subRoles.includes('referee')
        const isSK  = subRoles.includes('scorekeeper')
        const relevantForScheduler = schedulerType === 'ref_scheduler'
          ? isRef : schedulerType === 'sk_scheduler' ? isSK : true

        return { uid, name: user.displayName, subRoles, available, gameCount, relevantForScheduler, certLevel: user.officialProfile?.certLevel }
      }))

      const eligible = officialData.filter(o => o && o.available && o.relevantForScheduler)

      // Build crew slots needed
      const assigned       = game.assignedOfficials ?? []
      const refsNeeded     = Number(game.refs ?? 0)
      const linesNeeded    = Number(game.linesmen ?? 0)
      const sksNeeded      = Number(game.scorekeepers ?? 0)

      const assignments = []

      const fillSlots = (count, roleFn, eligiblePool) => {
        // Sort by fewest games (load balancing)
        const sorted = [...eligiblePool].sort((a, b) => a.gameCount - b.gameCount)
        for (let i = 1; i <= count; i++) {
          const role = roleFn(i, count)
          if (assigned.find(o => o.role === role)) continue // already filled
          const official = sorted.find(o => !assignments.find(a => a.uid === o.uid))
          if (!official) continue
          assignments.push({ uid: official.uid, name: official.name, role, pay: 0 })
        }
      }

      const refs = eligible.filter(o => o.subRoles.includes('referee'))
      const sks  = eligible.filter(o => o.subRoles.includes('scorekeeper'))

      if (schedulerType !== 'sk_scheduler') {
        fillSlots(refsNeeded,  (i, n) => n === 1 ? 'Referee'  : `Referee ${i}`,  refs)
        fillSlots(linesNeeded, (i, n) => n === 1 ? 'Linesman' : `Linesman ${i}`, refs)
      }
      if (schedulerType !== 'ref_scheduler') {
        fillSlots(sksNeeded, (i, n) => n === 1 ? 'Scorekeeper' : `Scorekeeper ${i}`, sks)
      }

      // Load pricing sheet for pay
      const sheetSnap = await db.collection('users').doc(schedulerId).collection('pricingSheet').doc('data').get()
      const sheet = sheetSnap.exists ? sheetSnap.data() : { defaultPay: 0, rules: [] }

      // Write assignments to Firestore
      const allAssigned    = [...assigned, ...assignments.map(a => {
        const rule = (sheet.rules ?? []).find(r => r.division?.toLowerCase() === game.division?.toLowerCase() && r.role === a.role)
        const pay  = rule?.pay ?? sheet.defaultPay ?? 0
        return { ...a, pay, status: 'pending', assignedAt: new Date().toISOString() }
      })]
      const allUids = [...new Set(allAssigned.map(o => o.uid))]

      const refsA  = allAssigned.filter(o => o.role?.startsWith('Referee')).length
      const linesA = allAssigned.filter(o => o.role?.startsWith('Linesman')).length
      const sksA   = allAssigned.filter(o => o.role?.startsWith('Scorekeeper')).length
      const refSlotsFull = refsA >= refsNeeded && linesA >= linesNeeded
      const skSlotsFull  = sksA >= sksNeeded
      const allSlotsFull = refSlotsFull && skSlotsFull

      await db.collection('games').doc(gameId).update({
        assignedOfficials: allAssigned,
        assignedUids: allUids,
        refSlotsFull, skSlotsFull, allSlotsFull,
        status: allSlotsFull ? 'assigned' : 'open',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })

      // Send assignment notifications
      for (const a of assignments) {
        await db.collection('notifications').doc().set === undefined
        await db.collection('notifications').add({
          uid: a.uid, type: 'assignment',
          title: '📋 Game Assignment',
          message: `You've been auto-assigned to ${game.homeTeam} vs ${game.awayTeam} as ${a.role}`,
          read: false, link: '/official/schedule',
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        })
      }

      res.json({ assigned: assignments, total: assignments.length })
    } catch (err) {
      console.error('autoAssign error:', err)
      res.status(500).json({ error: err.message })
    }
  })
)

// ── 12. Calculate mileage for a completed game ────────────────────────────────
// Called by autoCompleteGames when generating payroll — checks if venue is 50+ miles
// from official's home address and adds mileage reimbursement to payment record
exports.calculateMileage = onRequest(
  { cors: true },
  async (req, res) => withCors(req, res, async () => {
    const { officialUid, gameId } = req.body
    if (!officialUid || !gameId) { res.status(400).json({ error: 'Missing fields' }); return }
    try {
      const [userSnap, gameSnap] = await Promise.all([
        db.collection('users').doc(officialUid).get(),
        db.collection('games').doc(gameId).get(),
      ])
      const homeAddress = userSnap.data()?.officialProfile?.homeAddress
      const venue       = gameSnap.data()?.venueAddress ?? gameSnap.data()?.venue
      if (!homeAddress || !venue) { res.json({ miles: 0, reimbursement: 0, skipped: 'missing address' }); return }

      const MAPS_KEY = process.env.GOOGLE_MAPS_KEY
      if (!MAPS_KEY) { res.json({ miles: 0, reimbursement: 0, skipped: 'no maps key' }); return }

      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(homeAddress)}&destinations=${encodeURIComponent(venue)}&units=imperial&key=${MAPS_KEY}`
      const mapsRes  = await fetch(url)
      const mapsData = await mapsRes.json()
      const element  = mapsData?.rows?.[0]?.elements?.[0]
      if (element?.status !== 'OK') { res.json({ miles: 0, reimbursement: 0, skipped: 'route not found' }); return }

      const meters = element.distance.value
      const miles  = meters / 1609.34
      const IRS_RATE = 0.67 // 2024 IRS standard mileage rate per mile
      const reimbursement = miles >= 50 ? Math.round(miles * IRS_RATE * 100) / 100 : 0

      res.json({ miles: Math.round(miles * 10) / 10, reimbursement, eligible: miles >= 50 })
    } catch (err) {
      console.error('calculateMileage error:', err)
      res.status(500).json({ error: err.message })
    }
  })
)
