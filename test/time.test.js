'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { easternParts, daysBetween, addDays, weekdayOf, formatClock, timeRange, longDate, shortDate, isIsoDate } = require('../lib/digest/time');
const { utcHoursFor, cronEntries, DEFAULT_SEND_HOUR, DEFAULT_LATEST_HOUR } = require('../lib/digest/schedule');

const et = (iso) => easternParts(new Date(iso));

test('New York time, winter: UTC-5', () => {
  assert.deepEqual(et('2026-01-15T12:00:00Z'), { date: '2026-01-15', hour: 7, minute: 0 });
});

test('New York time, summer: UTC-4', () => {
  assert.deepEqual(et('2026-07-15T11:00:00Z'), { date: '2026-07-15', hour: 7, minute: 0 });
});

test('spring forward (Sunday Mar 8, 2026): the same UTC hour is an hour later in New York', () => {
  assert.equal(et('2026-03-07T12:00:00Z').hour, 7);          // Saturday, still winter time
  assert.equal(et('2026-03-09T12:00:00Z').hour, 8);          // Monday, summer time: 12:00 UTC is now 8 AM
  assert.equal(et('2026-03-07T11:00:00Z').hour, 6);
  assert.equal(et('2026-03-09T11:00:00Z').hour, 7);          // so 11:00 UTC is the 7 AM run from here on
  // the change itself: 01:59 EST is followed by 03:00 EDT
  assert.deepEqual([et('2026-03-08T06:59:00Z').hour, et('2026-03-08T06:59:00Z').minute], [1, 59]);
  assert.deepEqual([et('2026-03-08T07:00:00Z').hour, et('2026-03-08T07:00:00Z').minute], [3, 0]);
});

test('fall back (Sunday Nov 1, 2026): the same UTC hour is an hour earlier in New York', () => {
  assert.equal(et('2026-10-31T11:00:00Z').hour, 7);          // Saturday, still summer time
  assert.equal(et('2026-11-02T11:00:00Z').hour, 6);          // Monday, winter time: 11:00 UTC is now 6 AM
  assert.equal(et('2026-11-02T12:00:00Z').hour, 7);          // so 12:00 UTC is the 7 AM run from here on
  // the change itself: 01:59 EDT is followed by 01:00 EST
  assert.deepEqual([et('2026-11-01T05:59:00Z').hour, et('2026-11-01T05:59:00Z').minute], [1, 59]);
  assert.deepEqual([et('2026-11-01T06:00:00Z').hour, et('2026-11-01T06:00:00Z').minute], [1, 0]);
});

test('the New York date can differ from the UTC date, in both directions', () => {
  assert.equal(et('2026-10-23T02:00:00Z').date, '2026-10-22');       // 10 PM the evening before
  assert.equal(et('2026-10-22T03:59:00Z').date, '2026-10-21');
  assert.equal(et('2026-10-22T04:00:00Z').date, '2026-10-22');       // midnight in New York (UTC-4)
  assert.equal(et('2026-12-31T04:59:00Z').date, '2026-12-30');       // year end, winter time
  assert.equal(et('2026-12-31T05:00:00Z').date, '2026-12-31');
});

test('midnight reads as hour 0, never 24', () => {
  assert.equal(et('2026-10-22T04:00:00Z').hour, 0);
});

test('date arithmetic works on plain dates and across month and year ends', () => {
  assert.equal(daysBetween('2026-10-22', '2026-10-25'), 3);
  assert.equal(daysBetween('2026-10-22', '2026-10-20'), -2);
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);
  assert.equal(daysBetween('2026-03-07', '2026-03-09'), 2);          // across spring forward: still 2 calendar days
  assert.equal(daysBetween('2026-10-31', '2026-11-02'), 2);          // across fall back
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(weekdayOf('2026-10-22'), 4);                           // Thursday; Sunday is 0
  assert.equal(weekdayOf('2026-11-01'), 0);
});

test('dates and times are displayed the way the site shows them', () => {
  assert.equal(longDate('2026-10-22'), 'Thursday, Oct 22');
  assert.equal(shortDate('2026-10-22'), 'Thu, Oct 22');
  assert.equal(formatClock('08:40'), '8:40 AM');
  assert.equal(formatClock('8:40'), '8:40 AM');
  assert.equal(formatClock('00:05'), '12:05 AM');
  assert.equal(formatClock('12:00'), '12:00 PM');
  assert.equal(formatClock('23:59'), '11:59 PM');
  assert.equal(formatClock('25:00'), '');
  assert.equal(timeRange('08:40', '09:55'), '8:40 AM – 9:55 AM');
  assert.equal(timeRange('08:40', ''), '8:40 AM');
  assert.equal(isIsoDate('2026-02-30'), false);
  assert.equal(isIsoDate('10/22/2026'), false);
});

/* ---- the cron schedule ---- */

const vercelConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
const cronHours = vercelConfig.crons.map((c) => Number(c.schedule.split(' ')[1]));

test('vercel.json registers exactly the crons the code says (change the window with scripts/cron-entries.js)', () => {
  assert.deepEqual(vercelConfig.crons, cronEntries(DEFAULT_SEND_HOUR, DEFAULT_LATEST_HOUR));
  assert.deepEqual(cronHours, [11, 12, 13, 14, 15, 16]);
});

test('every cron is a once-a-day schedule (the free plan rejects anything more often)', () => {
  for (const cron of vercelConfig.crons) {
    assert.match(cron.schedule, /^0 \d{1,2} \* \* \*$/);
    assert.equal(cron.path, '/api/morning-digest');
  }
});

test('in both seasons, several crons land inside the 7:00-11:59 AM window and the first one is the 7 AM hour', () => {
  for (const [label, day, expectedFirst] of [['summer', '2026-07-15', 11], ['winter', '2026-01-15', 12]]) {
    const inWindow = cronHours
      .map((hour) => ({ hour, east: easternParts(new Date(`${day}T${String(hour).padStart(2, '0')}:00:00Z`)).hour }))
      .filter((c) => c.east >= DEFAULT_SEND_HOUR && c.east <= DEFAULT_LATEST_HOUR);
    assert.equal(inWindow.length, 5, `${label}: five attempts inside the window`);
    assert.equal(inWindow[0].hour, expectedFirst, `${label}: first attempt is the 7 AM hour`);
    assert.equal(inWindow[0].east, 7);
  }
});

test('the helper works for other windows', () => {
  assert.deepEqual(utcHoursFor(8, 12), [12, 13, 14, 15, 16, 17]);
  assert.deepEqual(utcHoursFor(7, 7), [11, 12]);
  assert.deepEqual(utcHoursFor(20, 21), [0, 1, 2]);                   // wraps past midnight UTC
});
