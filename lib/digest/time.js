'use strict';

/* Dates in Marginalia are plain "YYYY-MM-DD" strings and times are "HH:MM": no time zone attached.
   They mean the calendar the person lives in, so "today" is always the America/New_York date. */

const TZ = 'America/New_York';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^(\d{1,2}):(\d{2})$/;

function isIsoDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  // JavaScript quietly turns "Feb 30" into "Mar 2", so check the date reads back the same
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

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
const daysBetween = (fromIso, toIso) => Math.round((utcMs(toIso) - utcMs(fromIso)) / 86400000);
const addDays = (iso, n) => new Date(utcMs(iso) + n * 86400000).toISOString().slice(0, 10);
const weekdayOf = (iso) => new Date(utcMs(iso)).getUTCDay();          // 0 = Sunday, as the site stores it

const longDate = (iso) => {
  const d = new Date(utcMs(iso));
  return `${WEEKDAYS_LONG[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const shortDate = (iso) => {
  const d = new Date(utcMs(iso));
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

/** "8:40" -> "08:40" (so times sort as text); anything that isn't a clock time -> "". */
function normalizeClock(value) {
  const match = typeof value === 'string' ? CLOCK.exec(value.trim()) : null;
  if (!match) return '';
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return '';
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}

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
