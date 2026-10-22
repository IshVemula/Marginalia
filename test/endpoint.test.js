'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const handler = require('../api/morning-digest');
const { sampleWorkspace } = require('./fixtures');

/* Exercises api/morning-digest.js itself (query parsing, headers, response types) with real HTTP calls to a
   local stand-in for Supabase. Only previews (?dryRun=1) are used, so nothing is ever sent. */

function startSupabase() {
  const seen = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url.split('?')[0]}`);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([{ data: sampleWorkspace() }]));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise((r) => server.close(r)),
  })));
}

function call(requestUrl, { headers = {}, method = 'GET' } = {}) {
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200, headers: {}, body: undefined,
      setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
      status(code) { this.statusCode = code; return this; },
      json(value) { this.body = value; this.headers['content-type'] = 'application/json'; resolve(this); },
      send(value) { this.body = value; resolve(this); },
    };
    handler({ url: requestUrl, method, headers }, res).catch(reject);
  });
}

test('the endpoint: 401 without the secret, preview with it', async () => {
  const supabase = await startSupabase();
  Object.assign(process.env, { CRON_SECRET: 'endpoint-secret', SUPABASE_URL: supabase.url, SUPABASE_SERVICE_ROLE_KEY: 'k' });
  try {
    const denied = await call('/api/morning-digest?dryRun=1');
    assert.equal(denied.statusCode, 401);
    assert.deepEqual(denied.body, { error: 'unauthorized' });
    assert.deepEqual(supabase.seen, [], 'nothing was read for an unauthorized request');

    const auth = { authorization: 'Bearer endpoint-secret' };
    const json = await call('/api/morning-digest?dryRun=1', { headers: auth });
    assert.equal(json.statusCode, 200);
    assert.equal(json.headers['cache-control'], 'no-store');
    assert.equal(json.body.dryRun, true);
    assert.match(json.body.subject, /^Your day: /);

    const html = await call('/api/morning-digest?dryRun=1&format=html', { headers: auth });
    assert.equal(html.headers['content-type'], 'text/html; charset=utf-8');
    assert.match(html.body, /^<!doctype html>/);

    assert.deepEqual([...new Set(supabase.seen)], ['GET /rest/v1/app_state'], 'only ever reads the planner record');
  } finally {
    await supabase.close();
    for (const name of ['CRON_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) delete process.env[name];
  }
});
