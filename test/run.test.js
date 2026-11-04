'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { runDigest } = require('../lib/digest/run');
const { STALE_AFTER_MS } = require('../lib/digest/guard');
const { sampleWorkspace, emptyWorkspace } = require('./fixtures');

const SUPA = 'https://project.supabase.co';
const ENV = {
  CRON_SECRET: 'cron-secret-value', SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  RESEND_API_KEY: 're_test', DIGEST_TO_EMAIL: 'me@example.com',
};
const AUTH = { authorization: 'Bearer cron-secret-value' };
const at = (iso) => new Date(iso);
const SEVEN_AM = '2026-10-22T11:30:00Z';       // Thursday Oct 22, 7:30 AM New York (summer time)

/** A fake Supabase (app_state + digest_log) and a fake Resend that keeps its 24-hour idempotency rule. */
function makeWorld({ data = sampleWorkspace(), rows, resend = {} } = {}) {
  const world = {
    appState: rows || [{ user_id: 'u1', data, rev: 7 }],
    log: new Map(),                    // sent_on -> row
    emails: [],                        // what Resend actually delivered
    seen: new Map(),                   // idempotency key -> payload
    requests: [],
    resendFailures: resend.failTimes || 0,
    resendStatus: resend.status || 500,
  };

  const respond = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status });

  world.fetch = async (url, options = {}) => {
    const u = new URL(url);
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : undefined;
    world.requests.push({ method, host: u.host, path: u.pathname, query: u.search });

    if (u.host === 'api.resend.com') {
      assert.equal(options.headers.Authorization, 'Bearer re_test');
      if (world.resendFailures > 0) { world.resendFailures -= 1; return respond(world.resendStatus, { message: 'temporary failure' }); }
      const key = options.headers['Idempotency-Key'];
      const payload = JSON.stringify([body.subject, body.html]);
      if (world.seen.has(key)) {
        return world.seen.get(key) === payload
          ? respond(200, { id: 'email-1' })                                  // same key, same email: original answer, nothing new sent
          : respond(409, { name: 'invalid_idempotent_request', message: 'key used with a different payload' });
      }
      world.seen.set(key, payload);
      world.emails.push({ to: body.to, subject: body.subject, text: body.text, html: body.html, key });
      return respond(200, { id: `email-${world.emails.length}` });
    }

    assert.equal(u.host, 'project.supabase.co');
    assert.equal(options.headers.apikey, 'service-key');

    if (u.pathname === '/rest/v1/app_state') {
      assert.equal(method, 'GET', 'the digest must never write to app_state');
      const want = u.searchParams.get('user_id');
      const rowsOut = world.appState.filter((r) => !want || `eq.${r.user_id}` === want).slice(0, Number(u.searchParams.get('limit') || 100));
      return respond(200, rowsOut.map((r) => ({ data: r.data })));
    }

    if (u.pathname === '/rest/v1/digest_log') {
      const q = u.searchParams;
      const wantsRows = /return=representation/.test(options.headers.Prefer || '');
      if (method === 'POST') {
        if (world.log.has(body.sent_on)) return respond(201, []);           // ignore-duplicates: nothing inserted
        world.log.set(body.sent_on, { ...body });
        return respond(201, [body]);
      }
      const day = (q.get('sent_on') || '').replace('eq.', '');
      const row = world.log.get(day);
      if (method === 'GET') return respond(200, row ? [row] : []);
      if (method === 'PATCH') {
        const matches = row && (!q.get('status') || q.get('status') === `eq.${row.status}`)
          && (!q.get('attempts') || q.get('attempts') === `eq.${row.attempts}`);
        if (matches) Object.assign(row, body);
        return wantsRows ? respond(200, matches ? [row] : []) : respond(204);
      }
    }
    return respond(404, { message: 'unexpected request' });
  };
  return world;
}

const run = (world, { now = SEVEN_AM, headers = AUTH, query = {}, env = ENV, method = 'GET' } = {}) =>
  runDigest({ method, headers, query, env, now: at(now), fetchImpl: world.fetch });

/* ---------------------------------------------------------------- the basics */

test('a run inside the window sends one email to you, with the day in the subject', async () => {
  const world = makeWorld();
  const result = await run(world);
  assert.equal(result.status, 200);
  assert.equal(result.json.status, 'sent');
  assert.equal(world.emails.length, 1);
  assert.deepEqual(world.emails[0].to, ['me@example.com']);
  assert.equal(world.emails[0].subject, 'Your day: Thu, Oct 22');
  assert.match(world.emails[0].text, /CLASSES TODAY/);
  assert.equal(world.log.get('2026-10-22').status, 'sent');
});

test('an empty record sends a short "Clear day" email', async () => {
  const world = makeWorld({ data: emptyWorkspace() });
  const result = await run(world);
  assert.equal(result.json.status, 'sent');
  assert.equal(result.json.empty, true);
  assert.match(world.emails[0].text, /Clear day/);
});

test('the digest only reads your planner data: it never writes to app_state', async () => {
  const world = makeWorld();
  await run(world);
  await run(world, { query: { dryRun: '1' } });
  const appStateCalls = world.requests.filter((r) => r.path === '/rest/v1/app_state');
  assert.ok(appStateCalls.length >= 2 && appStateCalls.every((r) => r.method === 'GET'));
});

/* ---------------------------------------------------------------- guard: double sends */

test('DOUBLE SEND: a second run the same day sends nothing', async () => {
  const world = makeWorld();
  await run(world);
  const again = await run(world, { now: '2026-10-22T13:10:00Z' });           // the 9 AM retry run
  assert.equal(again.json.status, 'skipped');
  assert.equal(again.json.reason, 'already-sent');
  assert.equal(world.emails.length, 1);
});

test('DOUBLE SEND: two runs at the same moment (Vercel delivers a cron twice) send once', async () => {
  const world = makeWorld();
  const [a, b] = await Promise.all([run(world), run(world)]);
  assert.equal(world.emails.length, 1);
  assert.deepEqual([a.json.status, b.json.status].sort(), ['sent', 'skipped']);
});

test('DOUBLE SEND: a run that died mid-send is taken over later, and Resend still refuses a second copy', async () => {
  const world = makeWorld();
  // first run: claimed the day and the email actually went out, then the function died before saving "sent"
  world.log.set('2026-10-22', { sent_on: '2026-10-22', status: 'sending', attempts: 1, claimed_at: new Date(at(SEVEN_AM).getTime() - 1000).toISOString() });
  const first = await run(world);
  assert.equal(first.json.reason, 'in-progress');                              // too recent to take over: another run may still be working
  assert.equal(world.emails.length, 0);

  // later, the claim is stale: take over. The email had in fact been delivered with this day's key.
  const stale = new Date(at(SEVEN_AM).getTime() + STALE_AFTER_MS + 60_000).toISOString();
  const { renderDigest } = require('../lib/digest/render');
  const { buildDigest } = require('../lib/digest');
  const email = renderDigest(buildDigest(sampleWorkspace(), '2026-10-22'), { siteUrl: '' });
  world.seen.set('morning-digest/2026-10-22', JSON.stringify([email.subject, email.html]));
  const taken = await run(world, { now: stale });
  assert.equal(taken.status, 200);
  assert.equal(world.emails.length, 0, 'no second email went out');
  assert.equal(world.log.get('2026-10-22').status, 'sent');
  assert.equal(world.log.get('2026-10-22').attempts, 2);
});

test('DOUBLE SEND: if the data changed between two sends, Resend refuses the second and it is treated as already sent', async () => {
  const world = makeWorld();
  await run(world);
  world.log.delete('2026-10-22');                                              // pretend the log row was lost
  world.appState[0].data.lifeadmin.bills[1].amount = 99;                       // and the data changed
  const result = await run(world, { now: '2026-10-22T12:20:00Z' });
  assert.equal(result.json.reason, 'already-sent');
  assert.equal(world.emails.length, 1);
});

/* ---------------------------------------------------------------- guard: missed and failed runs */

test('SKIPPED RUN: when the 7 AM send fails, the next hourly run tries again and succeeds', async () => {
  const world = makeWorld({ resend: { failTimes: 1 } });
  const first = await run(world);                                              // 7:30, Resend is having a bad moment
  assert.equal(first.status, 502);
  assert.equal(first.json.status, 'failed');
  assert.equal(world.log.get('2026-10-22').status, 'failed');
  assert.match(world.log.get('2026-10-22').detail, /Resend rejected the email \(500\)/);
  assert.equal(world.emails.length, 0);

  const retry = await run(world, { now: '2026-10-22T12:40:00Z' });             // 8:40
  assert.equal(retry.json.status, 'sent');
  assert.equal(retry.json.attempt, 2);
  assert.equal(world.emails.length, 1);
  assert.equal(world.log.get('2026-10-22').attempts, 2);
});

test('SKIPPED RUN: a failure reading your data is also retried, and nothing is sent until it works', async () => {
  const world = makeWorld();
  world.appState = [];                                                         // nothing to read yet
  const first = await run(world);
  assert.equal(first.status, 502);
  assert.match(first.json.error, /No planner record found/);
  world.appState = [{ user_id: 'u1', data: sampleWorkspace() }];
  const retry = await run(world, { now: '2026-10-22T13:05:00Z' });
  assert.equal(retry.json.status, 'sent');
});

test('SKIPPED RUN: the first scheduled run is missed entirely, a later one sends', async () => {
  const world = makeWorld();
  const result = await run(world, { now: '2026-10-22T14:25:00Z' });            // only the 10 AM run arrived
  assert.equal(result.json.status, 'sent');
});

test('the window: before 7 AM does nothing, 11:59 AM is the last moment, after that nothing is sent', async () => {
  const early = makeWorld();
  assert.equal((await run(early, { now: '2026-10-22T10:59:00Z' })).json.reason, 'before-window');   // 6:59 AM
  assert.equal(early.emails.length, 0);
  assert.equal(early.log.size, 0, 'a too-early run leaves no trace');

  const last = makeWorld();
  assert.equal((await run(last, { now: '2026-10-22T15:59:00Z' })).json.status, 'sent');            // 11:59 AM

  const late = makeWorld();
  const tooLate = await run(late, { now: '2026-10-22T16:00:00Z' });                                // 12:00 PM
  assert.equal(tooLate.json.reason, 'after-window');
  assert.equal(late.emails.length, 0);
  assert.equal(late.log.get('2026-10-22').status, 'failed');                   // a missed day leaves a record
  assert.match(late.log.get('2026-10-22').detail, /No digest was sent between 7:00 and 11:59/);
});

test('after the window, a day that was already sent is left alone', async () => {
  const world = makeWorld();
  await run(world);
  const late = await run(world, { now: '2026-10-22T16:30:00Z' });
  assert.equal(late.json.reason, 'after-window');
  assert.equal(world.log.get('2026-10-22').status, 'sent');
});

test('the window can be changed with DIGEST_SEND_HOUR and DIGEST_LATEST_HOUR', async () => {
  const env = { ...ENV, DIGEST_SEND_HOUR: '8', DIGEST_LATEST_HOUR: '9' };
  const world = makeWorld();
  assert.equal((await run(world, { env, now: SEVEN_AM })).json.reason, 'before-window');                 // 7:30 is now too early
  assert.equal((await run(world, { env, now: '2026-10-22T12:30:00Z' })).json.status, 'sent');           // 8:30
  const other = makeWorld();
  assert.equal((await run(other, { env, now: '2026-10-22T14:00:00Z' })).json.reason, 'after-window');   // 10:00 is past 9:59
});

test('?force=1 skips the time window but still cannot send twice', async () => {
  const world = makeWorld();
  const forced = await run(world, { now: '2026-10-22T20:00:00Z', query: { force: '1' } });               // 4 PM
  assert.equal(forced.json.status, 'sent');
  const again = await run(world, { now: '2026-10-22T20:05:00Z', query: { force: '1' } });
  assert.equal(again.json.reason, 'already-sent');
  assert.equal(world.emails.length, 1);
});

/* ---------------------------------------------------------------- daylight saving, end to end */

test('7 AM New York means 11:00 UTC in summer and 12:00 UTC in winter, on both sides of each clock change', async () => {
  const cases = [
    ['2026-03-07T11:00:00Z', 'before-window'], ['2026-03-07T12:00:00Z', 'sent'],   // Saturday before spring forward: winter time
    ['2026-03-09T10:00:00Z', 'before-window'], ['2026-03-09T11:00:00Z', 'sent'],   // Monday after: summer time
    ['2026-10-31T10:00:00Z', 'before-window'], ['2026-10-31T11:00:00Z', 'sent'],   // Saturday before fall back: summer time
    ['2026-11-02T11:00:00Z', 'before-window'], ['2026-11-02T12:00:00Z', 'sent'],   // Monday after: winter time
  ];
  for (const [instant, expected] of cases) {
    const world = makeWorld();
    const result = await run(world, { now: instant });
    assert.equal(result.json.status === 'sent' ? 'sent' : result.json.reason, expected, instant);
    if (expected === 'sent') {
      const day = instant.slice(0, 10);
      assert.equal(world.emails[0].key, `morning-digest/${day}`, 'the digest is for the New York date');
    }
  }
});

test('the digest is for the New York date even when it is already tomorrow in UTC', async () => {
  const world = makeWorld();
  await run(world, { now: '2026-10-23T02:00:00Z', query: { dryRun: '1' } });     // 10 PM Oct 22 in New York
  const dry = await run(world, { now: '2026-10-23T02:00:00Z', query: { dryRun: '1' } });
  assert.equal(dry.json.day, '2026-10-22');
});

/* ---------------------------------------------------------------- protecting the endpoint */

test('only the cron secret gets in', async () => {
  const world = makeWorld();
  for (const headers of [{}, { authorization: 'Bearer wrong' }, { authorization: 'cron-secret-value' }, { authorization: 'Bearer cron-secret-value ' }, { authorization: '' }]) {
    const result = await run(world, { headers });
    assert.equal(result.status, 401);
    assert.deepEqual(result.json, { error: 'unauthorized' });
  }
  assert.equal((await run(world, { headers: { Authorization: 'Bearer cron-secret-value' } })).status, 200);
  assert.equal(world.requests.length > 0, true);
});

test('with no CRON_SECRET configured, everything is refused', async () => {
  const world = makeWorld();
  const env = { ...ENV, CRON_SECRET: '' };
  assert.equal((await run(world, { env, headers: { authorization: 'Bearer ' } })).status, 401);
  assert.equal((await run(world, { env: { ...ENV, CRON_SECRET: undefined }, headers: {} })).status, 401);
  assert.equal(world.requests.length, 0, 'nothing was read or sent');
});

test('unauthorized requests never touch Supabase or Resend, and other methods are refused', async () => {
  const world = makeWorld();
  await run(world, { headers: {} });
  await run(world, { headers: {}, query: { dryRun: '1' } });
  assert.equal(world.requests.length, 0);
  assert.equal((await run(world, { method: 'POST' })).status, 405);
});

test('settings that are missing are named, and no secret values are shown', async () => {
  const world = makeWorld();
  const result = await run(world, { env: { CRON_SECRET: ENV.CRON_SECRET, SUPABASE_URL: SUPA } });
  assert.equal(result.status, 500);
  assert.deepEqual(result.json.missing.sort(), ['DIGEST_TO_EMAIL', 'RESEND_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);
  assert.ok(!JSON.stringify(result.json).includes('cron-secret-value'));
});

/* ---------------------------------------------------------------- the planner record */

test('more than one record is refused unless DIGEST_USER_ID says which', async () => {
  const rows = [{ user_id: 'u1', data: sampleWorkspace() }, { user_id: 'u2', data: emptyWorkspace() }];
  const world = makeWorld({ rows });
  const refused = await run(world);
  assert.equal(refused.status, 502);
  assert.match(refused.json.error, /more than one planner record/);
  assert.equal(world.emails.length, 0);

  const chosen = await run(world, { env: { ...ENV, DIGEST_USER_ID: 'u2' }, now: '2026-10-22T12:30:00Z' });
  assert.equal(chosen.json.status, 'sent');
  assert.equal(chosen.json.empty, true);
});

/* ---------------------------------------------------------------- previews */

test('?dryRun=1 returns the rendered email without sending or recording anything, at any hour', async () => {
  const world = makeWorld();
  const result = await run(world, { now: '2026-10-22T20:00:00Z', query: { dryRun: '1' } });     // 4 PM, outside the window
  assert.equal(result.status, 200);
  assert.equal(result.json.dryRun, true);
  assert.equal(result.json.subject, 'Your day: Thu, Oct 22');
  assert.match(result.json.html, /Classes today/);
  assert.match(result.json.text, /YOUR DAY: Thursday, Oct 22/);
  assert.equal(world.emails.length, 0);
  assert.equal(world.log.size, 0);
  assert.ok(world.requests.every((r) => r.host === 'project.supabase.co' && r.path === '/rest/v1/app_state'));
});

test('?dryRun=1 can return the page itself (format=html or format=text) and needs no email settings', async () => {
  const env = { CRON_SECRET: ENV.CRON_SECRET, SUPABASE_URL: SUPA, SUPABASE_SERVICE_ROLE_KEY: 'service-key' };
  const html = await run(makeWorld(), { env, query: { dryRun: '1', format: 'html' } });
  assert.equal(html.contentType, 'text/html; charset=utf-8');
  assert.match(html.body, /^<!doctype html>/);
  const text = await run(makeWorld(), { env, query: { dryRun: '1', format: 'text' } });
  assert.match(text.body, /^YOUR DAY/);
});

test('a preview of an empty record says it is a clear day', async () => {
  const result = await run(makeWorld({ data: emptyWorkspace() }), { query: { dryRun: '1' } });
  assert.equal(result.json.empty, true);
  assert.match(result.json.text, /Clear day/);
});
