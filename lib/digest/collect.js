'use strict';

const Standard = require('../standard');
const { isIsoDate, daysBetween } = require('./time');

/* Turns the saved workspace into the flat model the digest builders read. The rules for what counts as due (open,
   dated, applications only while still to apply, classes computed from the weekly schedule, linked people) all live in
   lib/standard.js, the same file the website uses, so the email can't disagree with the Today and Upcoming pages.
   This file only reshapes that into what the digest needs. It never throws on missing or older-shaped data. */

/* the site stores a space's color as a CSS variable name; emails need real colors */
const SUBJECT_COLORS = {
  'var(--c-acad)': '#43607f', 'var(--c-career)': '#4f7355', 'var(--c-people)': '#7c5875',
  'var(--c-personal)': '#927b41', 'var(--c-admin)': '#9c6a4c',
};
const DEFAULT_ACCENT = '#43607f';

function collect(data, today) {
  const standard = Standard.standardItems(data, { today });

  const items = standard
    .filter((item) => item.dueCounts)
    .map((item) => ({
      id: `${item.kind}:${item.id || `${item.title}|${item.date}`}`,
      area: item.area,
      kind: item.kind.split('.')[1],                          // deadline, todo, event, bill, person...
      title: item.dueTitle,
      date: item.date,
      time: item.time,
      endTime: item.endTime,
      extra: item.kind === 'academics.deadline' ? item.extra.type : '',
      amount: item.extra.amount,
      daysUntil: item.daysUntil,
    }));
  items.sort((a, b) => (a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : 0));

  const colors = {};
  standard.forEach((item) => { if (item.kind === 'academics.space') colors[item.id] = item.raw.color; });
  const classes = Standard.classSessionsOn(data, today).map((session) => ({
    start: session.start, end: session.end, subject: session.spaceName, title: session.title, location: session.location,
    accent: SUBJECT_COLORS[colors[session.spaceId]] || DEFAULT_ACCENT,
  }));

  const waiting = standard
    .filter((item) => item.kind === 'career.application' && item.status === 'Waiting')
    .map((item) => {
      // older records kept a separate "applied" date; newer ones keep the one date in `deadline`
      const since = [item.date, item.extra.applied].find(isIsoDate) || '';
      return { id: `waiting:${item.id || item.title}`, title: item.dueTitle, since,
               daysSince: since ? -daysBetween(today, since) : null };
    });

  return { today, classes, items, waiting };
}

module.exports = { collect, PENDING_APPLICATION: new Set(['Interested', 'Preparing']) };
