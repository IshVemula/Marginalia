'use strict';

const { shortDate, timeRange, formatClock } = require('./time');

/* PHASE 1: the simple digest. Lays out what the site's Today and Upcoming pages would show.

   A "planner" is any function (model, options) => { sections } that returns sections in the shape below.
   collect.js produces the model, render.js draws the sections, and this file is the only place that
   decides WHICH items appear. A later ranked plan (a capped 3-5 item list scored by due date, size and
   time left untouched, with slots reserved for Career and People) can replace this file and register
   itself in index.js without changing collect.js or render.js.

   Section shape:
     { id, title, groups: [{ label, rows: [{ lead, text, tag, tone }] }], more }
   `more` is how many rows were cut to keep the email short. */

const AREA_ORDER = ['academics', 'lifeadmin', 'career', 'people', 'personal'];
const AREA_LABEL = {
  academics: 'Academics', lifeadmin: 'Life Admin', career: 'Career', people: 'People', personal: 'Personal',
};

const DEFAULTS = {
  maxOverdue: 8, maxToday: 8, maxSoon: 6, maxRadar: 3,
  soonDays: 3,       // "coming up" covers tomorrow through this many days ahead
  radarDays: 7,      // bills and follow-ups this close are worth a mention
};

const money = (n) => (Number.isFinite(n)
  ? `$${n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}` : '');
const ago = (n) => (n === 1 ? '1 day overdue' : `${n} days overdue`);

/** Group rows by area (in the site's order) and keep at most `cap` rows in total. */
function groupByArea(items, rowOf, cap) {
  const groups = [];
  let kept = 0;
  for (const area of AREA_ORDER) {
    const inArea = items.filter((i) => i.area === area);
    if (!inArea.length) continue;
    const rows = [];
    for (const item of inArea) {
      if (kept >= cap) break;
      rows.push(rowOf(item));
      kept += 1;
    }
    if (rows.length) groups.push({ label: AREA_LABEL[area], rows });
  }
  return { groups, more: items.length - kept };
}

function plan(model, options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const shown = new Set();               // an item appears in one section only
  const sections = [];
  const take = (items) => items.forEach((i) => shown.add(i.id));

  // 1. Classes today
  if (model.classes.length) {
    sections.push({
      id: 'classes', title: 'Classes today', more: 0,
      groups: [{ label: '', rows: model.classes.map((c) => ({
        lead: timeRange(c.start, c.end),
        text: c.title ? `${c.subject} — ${c.title}` : c.subject,
        tag: c.location, tone: '',
      })) }],
    });
  }

  // 2. Overdue
  const overdue = model.items.filter((i) => i.daysUntil < 0);
  if (overdue.length) {
    const { groups, more } = groupByArea(overdue, (i) => ({
      lead: '', text: i.kind === 'bill' ? `${i.title} — ${money(i.amount)}` : i.title, tag: ago(-i.daysUntil), tone: 'bad',
    }), cfg.maxOverdue);
    take(overdue);
    sections.push({ id: 'overdue', title: 'Overdue', groups, more });
  }

  // 3. Due today
  const dueToday = model.items.filter((i) => i.daysUntil === 0);
  if (dueToday.length) {
    const { groups, more } = groupByArea(dueToday, (i) => ({
      lead: formatClock(i.time), text: i.kind === 'bill' ? `${i.title} — ${money(i.amount)}` : i.title, tag: '', tone: '',
    }), cfg.maxToday);
    take(dueToday);
    sections.push({ id: 'today', title: 'Due today', groups, more });
  }

  // 4. Coming up in the next few days
  const soon = model.items.filter((i) => i.daysUntil >= 1 && i.daysUntil <= cfg.soonDays);
  if (soon.length) {
    const rows = soon.slice(0, cfg.maxSoon).map((i) => ({
      lead: [shortDate(i.date).split(',')[0], formatClock(i.time)].filter(Boolean).join(' · '),
      text: i.kind === 'bill' ? `${i.title} — ${money(i.amount)}` : i.title,
      tag: AREA_LABEL[i.area], tone: '',
    }));
    take(soon);
    sections.push({ id: 'soon', title: `Coming up (next ${cfg.soonDays} days)`, groups: [{ label: '', rows }],
                    more: Math.max(0, soon.length - cfg.maxSoon) });
  }

  // 5. On your radar: bills and follow-ups a little further out, and applications waiting on an answer
  const radar = [];
  const closeBy = (kind) => model.items.filter((i) => i.kind === kind && !shown.has(i.id) && i.daysUntil > 0 && i.daysUntil <= cfg.radarDays);

  const bills = closeBy('bill');
  if (bills.length) {
    radar.push({ label: 'Bills due soon', rows: bills.slice(0, cfg.maxRadar).map((i) => ({
      lead: shortDate(i.date).split(',')[0], text: `${i.title} — ${money(i.amount)}`, tag: '', tone: '' })) });
  }
  if (model.waiting.length) {
    const sorted = [...model.waiting].sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1));   // longest wait first
    radar.push({ label: 'Waiting to hear back', rows: sorted.slice(0, cfg.maxRadar).map((w) => ({
      lead: '', text: w.title, tag: w.daysSince === null ? '' : w.daysSince <= 0 ? 'today' : `${w.daysSince}d`, tone: '' })) });
  }
  const followUps = closeBy('person');
  if (followUps.length) {
    radar.push({ label: 'People to follow up with', rows: followUps.slice(0, cfg.maxRadar).map((i) => ({
      lead: shortDate(i.date).split(',')[0], text: i.title.replace(/^Follow up: /, ''), tag: '', tone: '' })) });
  }
  if (radar.length) sections.push({ id: 'radar', title: 'On your radar', groups: radar, more: 0 });

  return { sections };
}

module.exports = { plan, AREA_LABEL, AREA_ORDER, DEFAULTS };
