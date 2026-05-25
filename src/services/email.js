/**
 * services/email.js
 * Sends transactional emails via Cloud Function → Resend
 */

const FUNCTIONS = {
  sendEmailNotification: import.meta.env.DEV
    ? 'http://127.0.0.1:5001/refsync-c1a46/us-central1/sendEmailNotification'
    : 'https://us-central1-refsync-c1a46.cloudfunctions.net/sendEmailNotification',
}

const send = async (to, subject, html) => {
  try {
    const res = await fetch(FUNCTIONS.sendEmailNotification, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ to, subject, html }),
    })
    return res.json()
  } catch (err) {
    console.warn('Email send failed (non-critical):', err.message)
  }
}

// ── Email templates ───────────────────────────────────────────────────────────
const base = (content) => `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; background: #fff;">
    <div style="background: #0f1117; padding: 24px 32px; text-align: center;">
      <div style="font-size: 26px; font-weight: 800; color: #fff;">
        Ref<span style="color: #cc1f1f">Sync</span>
      </div>
    </div>
    <div style="padding: 32px;">
      ${content}
    </div>
    <div style="padding: 20px 32px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #999;">
      RefSync Hockey Officiating Platform · <a href="https://refsync-nine.vercel.app" style="color: #cc1f1f;">refsync-nine.vercel.app</a>
    </div>
  </div>
`

export const sendRosterInvite = (to, fromName, note) =>
  send(to, `${fromName} invited you to their officiating roster on RefSync`,
    base(`
      <h2 style="margin: 0 0 12px; font-size: 20px;">You've been invited! 🏒</h2>
      <p style="color: #555; line-height: 1.6;"><strong>${fromName}</strong> has invited you to join their officiating roster on RefSync.</p>
      ${note ? `<blockquote style="border-left: 3px solid #cc1f1f; padding: 10px 16px; background: #fafafa; margin: 16px 0; font-style: italic;">"${note}"</blockquote>` : ''}
      <a href="https://refsync-nine.vercel.app" style="display: inline-block; background: #cc1f1f; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; margin-top: 16px;">
        View Invitation →
      </a>
    `)
  )

export const sendGameAssigned = (to, officialName, homeTeam, awayTeam, dateStr, venue, pay) =>
  send(to, `You've been assigned a game on RefSync`,
    base(`
      <h2 style="margin: 0 0 12px; font-size: 20px;">New Game Assignment 🏒</h2>
      <p style="color: #555;">Hi ${officialName}, you've been assigned the following game:</p>
      <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin: 16px 0;">
        <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">${homeTeam} vs ${awayTeam}</div>
        <div style="color: #555; font-size: 14px; line-height: 1.8;">
          📅 ${dateStr}<br/>
          📍 ${venue}<br/>
          💰 Pay: $${pay}
        </div>
      </div>
      <a href="https://refsync-nine.vercel.app/official/schedule" style="display: inline-block; background: #cc1f1f; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700;">
        Accept or Decline →
      </a>
    `)
  )

export const sendGameRequestApproved = (to, officialName, homeTeam, awayTeam, dateStr, venue, pay) =>
  send(to, `Your game request was approved — RefSync`,
    base(`
      <h2 style="margin: 0 0 12px; font-size: 20px;">Request Approved ✅</h2>
      <p style="color: #555;">Great news ${officialName}! Your request to work the following game has been approved:</p>
      <div style="background: #f0fdf9; border-radius: 10px; padding: 20px; margin: 16px 0; border: 1px solid rgba(0,184,153,.2);">
        <div style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">${homeTeam} vs ${awayTeam}</div>
        <div style="color: #555; font-size: 14px; line-height: 1.8;">
          📅 ${dateStr}<br/>
          📍 ${venue}<br/>
          💰 Pay: $${pay}
        </div>
      </div>
      <a href="https://refsync-nine.vercel.app/official/schedule" style="display: inline-block; background: #00b899; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700;">
        View My Schedule →
      </a>
    `)
  )

export const sendInvoiceReceived = (to, directorName, amount, groupName, invoiceNumber) =>
  send(to, `Invoice #${invoiceNumber} received — $${amount}`,
    base(`
      <h2 style="margin: 0 0 12px; font-size: 20px;">New Invoice 🧾</h2>
      <p style="color: #555;">You have a new invoice from your scheduler for <strong>${groupName}</strong>.</p>
      <div style="background: #f8f9fa; border-radius: 10px; padding: 20px; margin: 16px 0;">
        <div style="font-size: 28px; font-weight: 800; color: #cc1f1f;">$${amount}</div>
        <div style="color: #555; margin-top: 6px;">Invoice #${invoiceNumber}</div>
      </div>
      <a href="https://refsync-nine.vercel.app/director/invoices" style="display: inline-block; background: #cc1f1f; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700;">
        Pay Invoice →
      </a>
    `)
  )

export const sendPaymentReceived = (to, officialName, amount, description) =>
  send(to, `Payment of $${amount} sent to your account — RefSync`,
    base(`
      <h2 style="margin: 0 0 12px; font-size: 20px;">Payment On Its Way 💰</h2>
      <p style="color: #555;">Hi ${officialName}, a payment has been sent to your bank account:</p>
      <div style="background: #f0fdf9; border-radius: 10px; padding: 20px; margin: 16px 0; border: 1px solid rgba(0,184,153,.2);">
        <div style="font-size: 28px; font-weight: 800; color: #00b899;">$${amount}</div>
        ${description ? `<div style="color: #555; margin-top: 6px;">${description}</div>` : ''}
      </div>
      <p style="color: #555; font-size: 13px;">Funds typically arrive within 1-2 business days.</p>
      <a href="https://refsync-nine.vercel.app/profile/finances" style="display: inline-block; background: #00b899; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700;">
        View Finances →
      </a>
    `)
  )

export const sendNewMessage = (to, fromName, preview) =>
  send(to, `New message from ${fromName} on RefSync`,
    base(`
      <h2 style="margin: 0 0 12px; font-size: 20px;">New Message 💬</h2>
      <p style="color: #555;"><strong>${fromName}</strong> sent you a message on RefSync:</p>
      <blockquote style="border-left: 3px solid #cc1f1f; padding: 10px 16px; background: #fafafa; margin: 16px 0; font-style: italic; color: #333;">
        "${preview.slice(0, 200)}${preview.length > 200 ? '…' : ''}"
      </blockquote>
      <a href="https://refsync-nine.vercel.app/profile/messages" style="display: inline-block; background: #cc1f1f; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700;">
        Reply →
      </a>
    `)
  )
