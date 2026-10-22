'use strict';

const { runDigest } = require('../lib/digest/run');

/* GET /api/morning-digest
   Called by Vercel Cron (it sends `Authorization: Bearer $CRON_SECRET` automatically) and by you, with the
   same header, for previews and manual runs. See "Morning digest" in the README. */

module.exports = async function handler(req, res) {
  const query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  const result = await runDigest({
    method: req.method,
    headers: req.headers,
    query,
    env: process.env,
    log: (entry) => console.log(JSON.stringify({ digest: entry })),
  });

  res.setHeader('Cache-Control', 'no-store');
  res.status(result.status);
  if (result.body !== undefined) {
    res.setHeader('Content-Type', result.contentType || 'text/plain; charset=utf-8');
    res.send(result.body);
  } else {
    res.json(result.json);
  }
};
