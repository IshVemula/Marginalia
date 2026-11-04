#!/usr/bin/env node
'use strict';

/* Prints the "crons" block for vercel.json for a New York send window.
     node scripts/cron-entries.js            -> 7 AM to 11:59 AM (the defaults)
     node scripts/cron-entries.js 8 12       -> 8 AM to 12:59 PM
   Paste the output over the "crons" entry in vercel.json, set DIGEST_SEND_HOUR and DIGEST_LATEST_HOUR to the same
   two numbers in Vercel, and redeploy. */

const { cronEntries, DEFAULT_SEND_HOUR, DEFAULT_LATEST_HOUR } = require('../lib/digest/schedule');

const send = process.argv[2] === undefined ? DEFAULT_SEND_HOUR : Number(process.argv[2]);
const latest = process.argv[3] === undefined ? DEFAULT_LATEST_HOUR : Number(process.argv[3]);

if (![send, latest].every((n) => Number.isInteger(n) && n >= 0 && n <= 23) || send > latest) {
  console.error('Usage: node scripts/cron-entries.js [sendHour] [latestHour]   (New York hours, 0-23, send <= latest)');
  process.exit(1);
}
console.log(JSON.stringify({ crons: cronEntries(send, latest) }, null, 2));
