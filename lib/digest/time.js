'use strict';

const { isIsoDate, daysBetween, weekdayOf, normalizeClock } = require('../standard');

/* Dates in Marginalia are plain "YYYY-MM-DD" strings and times are "HH:MM": no time zone attached.
   They mean the calendar the person lives in, so "today" is always the America/New_York date. */

const TZ = 'America/New_York';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** The New York calendar date and hour for an instant. Handles daylight saving through Intl. */
function easternParts(now) {
  const parts = {};
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  for (const part of formatter.formatToParts(now)) parts[part.type] = part.value;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

const utcMs = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const addDays = (iso, n) => new Date(utcMs(iso) + n * 86400000).toISOString().slice(0, 10);

const longDate = (iso) => {
  const d = new Date(utcMs(iso));
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const shortDate = (iso) => {
  const d = new Date(utcMs(iso));
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

function formatClock(value) {
  const clock = normalizeClock(value);
  if (!clock) return '';
  const hour = Number(clock.slice(0, 2));
  return `${hour % 12 || 12}:${clock.slice(3)} ${hour < 12 ? 'AM' : 'PM'}`;
}

const timeRange = (start, end) =>
  [formatClock(start), formatClock(end)].filter(Boolean).join(' – ');

module.exports = {
  TZ, isIsoDate, easternParts, daysBetween, addDays, weekdayOf, longDate, shortDate,
  normalizeClock, formatClock, timeRange,
};
