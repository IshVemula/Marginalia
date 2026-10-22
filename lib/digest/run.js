'use strict';

const crypto = require('crypto');
const { easternParts } = require('./time');
const { buildDigest } = require('./index');
const { renderDigest } = require('./render');
const { readWorkspace } = require('./source');
const { createGuard } = require('./guard');
const { sendDigest } = require('./send');
const { DEFAULT_SEND_HOUR, DEFAULT_LATEST_HOUR } = require('./schedule');

/* One digest run. Pure of any web framework so it can be tested: pass in the request details, the environment,
   the current time and a fetch function, and get back { status, json } (or { status, body, contentType }).

   Order of checks: secret -> method -> time window -> settings -> claim today's row -> read data -> send. */

const hourSetting = (value, fallback) => {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
};

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  if (x.length !== y.length) { crypto.timingSafeEqual(y, y); return false; }
  return crypto.timingSafeEqual(x, y);
}

async function runDigest({ method = 'GET', headers = {}, query = {}, env = {}, now = new Date(), fetchImpl = fetch, log = () => {} }) {
  // 1. Only Vercel (or you, with the secret) may call this. Fail closed if no secret is configured.
  const secret = env.CRON_SECRET;
  const auth = headers.authorization || headers.Authorization || '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return { status: 401, json: { error: 'unauthorized' } };
  if (method !== 'GET') return { status: 405, json: { error: 'use GET' } };

  const dryRun = query.dryRun === '1' || query.dryRun === 'true';
  const force = query.force === '1';
  const et = easternParts(now);
  const earliest = hourSetting(env.DIGEST_SEND_HOUR, DEFAULT_SEND_HOUR);
  const latest = hourSetting(env.DIGEST_LATEST_HOUR, DEFAULT_LATEST_HOUR);
  const siteUrl = env.DIGEST_SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '');

  const supabase = { url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY };
  const guard = supabase.url && supabase.key
    ? createGuard({ ...supabase, fetchImpl, now: () => now.getTime() }) : null;

  // 2. The send window (New York time). Runs outside it do nothing; the cron list covers both daylight-saving offsets.
  if (!dryRun && !force) {
    if (et.hour < earliest) {
      log({ event: 'skipped', reason: 'before-window', hour: et.hour });
      return { status: 200, json: { status: 'skipped', reason: 'before-window', easternHour: et.hour } };
    }
    if (et.hour > latest) {
      if (guard) {      // leave a trace if the day ended up with nothing sent
        try { await guard.recordMissed(et.date, `No digest was sent between ${earliest}:00 and ${latest}:59 Eastern.`); }
        catch (error) { log({ event: 'missed-log-failed', message: error.message }); }
      }
      log({ event: 'skipped', reason: 'after-window', hour: et.hour });
      return { status: 200, json: { status: 'skipped', reason: 'after-window', easternHour: et.hour } };
    }
  }

  // 3. Settings
  const needed = dryRun
    ? ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    : ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'DIGEST_TO_EMAIL'];
  const missing = needed.filter((name) => !env[name]);
  if (missing.length) return { status: 500, json: { error: 'missing settings', missing } };

  const build = async () => {
    const data = await readWorkspace({ ...supabase, userId: env.DIGEST_USER_ID, fetchImpl });
    const digest = buildDigest(data, et.date);
    return { digest, email: renderDigest(digest, { siteUrl }) };
  };

  // 4a. Preview: render only. No claim, no send, nothing written.
  if (dryRun) {
    try {
      const { digest, email } = await build();
      if (query.format === 'html') return { status: 200, contentType: 'text/html; charset=utf-8', body: email.html };
      if (query.format === 'text') return { status: 200, contentType: 'text/plain; charset=utf-8', body: email.text };
      return { status: 200, json: { dryRun: true, day: et.date, empty: digest.empty, subject: email.subject, text: email.text, html: email.html } };
    } catch (error) {
      return { status: 500, json: { error: error.message } };
    }
  }

  // 4b. Real send: claim today's row first, so two runs can never both send.
  let claim;
  try { claim = await guard.claim(et.date); }
  catch (error) { return { status: 500, json: { error: error.message } }; }
  if (!claim.ok) {
    log({ event: 'skipped', reason: claim.reason, day: et.date });
    return { status: 200, json: { status: 'skipped', reason: claim.reason, day: et.date } };
  }

  try {
    const { digest, email } = await build();
    const sent = await sendDigest({ apiKey: env.RESEND_API_KEY, to: env.DIGEST_TO_EMAIL, email, day: et.date, fetchImpl });
    await guard.markSent(et.date, sent.duplicate ? `Resend: already sent (${sent.reason})` : `Resend id ${sent.id}`);
    log({ event: sent.duplicate ? 'skipped' : 'sent', day: et.date, attempt: claim.attempt, empty: digest.empty });
    return sent.duplicate
      ? { status: 200, json: { status: 'skipped', reason: 'already-sent', day: et.date } }
      : { status: 200, json: { status: 'sent', day: et.date, attempt: claim.attempt, empty: digest.empty, emailId: sent.id } };
  } catch (error) {
    // Release the day so the next hourly run (inside the window) tries again.
    try { await guard.markFailed(et.date, error.message); } catch (e) { log({ event: 'mark-failed-failed', message: e.message }); }
    log({ event: 'failed', day: et.date, attempt: claim.attempt, message: error.message });
    return { status: 502, json: { status: 'failed', day: et.date, attempt: claim.attempt, error: error.message } };
  }
}

module.exports = { runDigest };
