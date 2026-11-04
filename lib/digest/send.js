'use strict';

/* Sends the digest through Resend. The Idempotency-Key is the New York date, so Resend itself refuses to send a
   second digest for the same day even if two runs overlap or a run is repeated (keys are kept for 24 hours). */

const FROM = 'Marginalia <onboarding@resend.dev>';   // Resend's test sender: it can only deliver to your own account email

/** -> { id } when sent, or { duplicate: true } when Resend says today's digest already went out. */
async function sendDigest({ apiKey, to, email, day, fetchImpl = fetch }) {
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'Idempotency-Key': `morning-digest/${day}`,
    },
    body: JSON.stringify({ from: FROM, to: [to], subject: email.subject, html: email.html, text: email.text }),
  });
  let payload = {};
  try { payload = await response.json(); } catch (e) { /* no body */ }

  if (response.ok) return { id: payload.id || '' };
  // 409: this key was already used today (same email already sent, or another run is sending it right now)
  if (response.status === 409) return { duplicate: true, reason: payload.name || 'idempotent_request' };
  const error = new Error(`Resend rejected the email (${response.status})${payload.message ? `: ${payload.message}` : ''}`);
  error.status = response.status;
  throw error;
}

module.exports = { sendDigest, FROM };
