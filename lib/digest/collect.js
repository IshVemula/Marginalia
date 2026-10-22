'use strict';

const { isIsoDate, daysBetween, weekdayOf, normalizeClock } = require('./time');

/* Turns the saved workspace (the JSON the site keeps in Supabase) into a flat, normalized model that the
   digest builders read. It follows the same rules as the site's Today / Upcoming pages:
     - done / paid / complete items never appear
     - an application's one date is a deadline only while it is Interested or Preparing
     - classes are worked out from each subject's weekly schedule (never stored per day)
   It never throws on missing or older-shaped data: absent lists are treated as empty. */

/* lists of things: anything that isn't an object (null, a stray string) is ignored */
const arr = (value) => (Array.isArray(value) ? value.filter((x) => x && typeof x === 'object') : []);
const text = (value) => (typeof value === 'string' ? value.trim() : '');

const PENDING_APPLICATION = new Set(['Interested', 'Preparing']);

function collect(data, today) {
  const root = data && typeof data === 'object' ? data : {};
  const academics = root.academics || {};
  const life = root.lifeadmin || {};
  const career = root.career || {};
  const personal = root.personal || {};

  const items = [];
  const classes = [];

  const add = (item) => {
    if (!isIsoDate(item.date)) return;
    items.push({ time: '', extra: '', ...item, time: normalizeClock(item.time), daysUntil: daysBetween(today, item.date) });
  };
  const idOf = (kind, thing, fallback) => `${kind}:${thing.id || fallback}`;

  for (const subject of arr(academics.subjects)) {
    const subjectName = text(subject.name) || 'Untitled subject';

    for (const d of arr(subject.deadlines)) {
      if (d.status === 'Done') continue;
      add({ id: idOf('deadline', d, `${subjectName}|${d.title}|${d.date}`), area: 'academics', kind: 'deadline',
            title: `${subjectName} — ${text(d.title) || 'Deadline'}`, date: d.date, time: d.time, extra: text(d.type) });
    }
    for (const m of arr(subject.milestones)) {
      if (m.done) continue;
      add({ id: idOf('milestone', m, `${subjectName}|${m.title}|${m.date}`), area: 'academics', kind: 'milestone',
            title: `${subjectName} — ${text(m.title) || 'Milestone'}`, date: m.date });
    }

    for (const c of arr(subject.schedule)) {
      const start = normalizeClock(c.start);
      if (!start || !Array.isArray(c.days) || !c.days.includes(weekdayOf(today))) continue;
      if (isIsoDate(c.from) && today < c.from) continue;
      if (isIsoDate(c.until) && today > c.until) continue;
      classes.push({ start, end: normalizeClock(c.end), subject: subjectName, title: text(c.title), location: text(c.location) });
    }
  }
  classes.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.subject.localeCompare(b.subject)));

  for (const doc of arr(life.documents)) {
    if (doc.status === 'Complete') continue;
    add({ id: idOf('document', doc, `${doc.name}|${doc.deadline}`), area: 'lifeadmin', kind: 'document',
          title: text(doc.name) || 'Document', date: doc.deadline, extra: text(doc.status) });
  }
  for (const bill of arr(life.bills)) {
    if (bill.paid) continue;
    add({ id: idOf('bill', bill, `${bill.name}|${bill.due}`), area: 'lifeadmin', kind: 'bill',
          title: text(bill.name) || 'Bill', date: bill.due, amount: Number(bill.amount) });
  }
  for (const a of arr(life.appointments)) {
    if (a.done) continue;
    add({ id: idOf('appointment', a, `${a.title}|${a.date}`), area: 'lifeadmin', kind: 'appointment',
          title: text(a.title) || 'Appointment', date: a.date, time: a.time });
  }

  const waiting = [];
  for (const app of arr(career.applications)) {
    const label = `${text(app.company) || 'Application'}${text(app.role) ? ` — ${text(app.role)}` : ''}`;
    if (PENDING_APPLICATION.has(app.status)) {
      add({ id: idOf('application', app, `${label}|${app.deadline}`), area: 'career', kind: 'application',
            title: label, date: app.deadline });
    } else if (app.status === 'Waiting') {
      // older records kept a separate "applied" date; newer ones keep the one date in `deadline`
      const since = [app.deadline, app.applied].find(isIsoDate);
      waiting.push({ id: idOf('waiting', app, label), title: label, since: since || '',
                     daysSince: since ? -daysBetween(today, since) : null });
    }
  }

  for (const person of arr(root.people)) {
    add({ id: idOf('person', person, `${person.name}|${person.next}`), area: 'people', kind: 'person',
          title: `Follow up: ${text(person.name) || 'someone'}`, date: person.next });
  }

  for (const key of ['recreation', 'social']) {
    for (const t of arr(personal[key])) {
      if (t.done) continue;
      add({ id: idOf(key, t, `${t.text}|${t.date}`), area: 'personal', kind: key,
            title: text(t.text) || 'Plan', date: t.date, time: t.time });
    }
  }

  const byWhen = (a, b) => (a.date + a.time < b.date + b.time ? -1 : a.date + a.time > b.date + b.time ? 1 : 0);
  items.sort(byWhen);
  return { today, classes, items, waiting };
}

module.exports = { collect, PENDING_APPLICATION };
