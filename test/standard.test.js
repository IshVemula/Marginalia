'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Standard = require('../lib/standard');
const { build, read, TODAY } = require('./golden/build');

const workspace = () => read('workspace.json');
const byId = (items, id) => items.find((i) => i.id === id);
const view = (data = workspace()) => Standard.standardItems(data, { today: TODAY });

/* ---------------------------------------------------------------- the golden answers */

test('the golden answers still match (the Python port used by Claude must produce these exact answers)', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden', 'expected.json'), 'utf8'));
  assert.deepEqual(JSON.parse(JSON.stringify(build())), expected);
});

/* ---------------------------------------------------------------- one standard shape */

test('every item in the workspace comes out with the same set of fields', () => {
  const items = view();
  assert.equal(items.length, 38);
  const fields = Object.keys(items[0]).sort();
  for (const item of items) assert.deepEqual(Object.keys(item).sort(), fields, `${item.kind} ${item.id}`);
  assert.deepEqual(fields, [
    'area', 'createdAt', 'date', 'daysUntil', 'done', 'doneAt', 'dueCounts', 'dueTitle', 'endTime', 'extra', 'id', 'kind', 'label',
    'notes', 'personId', 'personName', 'raw', 'spaceId', 'spaceName', 'status', 'time', 'title', 'updatedAt',
  ]);
});

test('title, date and time are found whatever each kind calls them', () => {
  const items = view();
  assert.deepEqual([byId(items, 'd2').title, byId(items, 'd2').date, byId(items, 'd2').time], ['Quiz 3', '2026-11-05', '09:00']);   // deadline: title / date / time
  assert.deepEqual([byId(items, 't1').title, byId(items, 't1').date], ['Grade the group projects', '2026-11-06']);                  // to-do: text
  assert.deepEqual([byId(items, 'doc1').title, byId(items, 'doc1').date], ['OPT', '2026-11-06']);                                  // document: name / deadline
  assert.deepEqual([byId(items, 'b1').title, byId(items, 'b1').date, byId(items, 'b1').extra.amount], ['Rent', '2026-11-30', 1400]); // bill: name / due
  assert.deepEqual([byId(items, 'a1').title, byId(items, 'a1').date], ['Google', '2026-11-06']);                                   // application: company / deadline
  assert.deepEqual([byId(items, 'p1').title, byId(items, 'p1').date], ['Diana Lee', '2026-11-05']);                                // person: name / next follow-up
  assert.deepEqual([byId(items, 'e1').date, byId(items, 'e1').time, byId(items, 'e1').endTime], ['2026-11-10', '15:30', '16:30']); // event: start and end
  assert.deepEqual([byId(items, 'c1').time, byId(items, 'c1').endTime], ['08:40', '09:55']);                                       // class: start / end
});

test('"done" means the right thing for each kind', () => {
  const items = view();
  assert.equal(byId(items, 'd3').done, true);                 // deadline: status Done
  assert.equal(byId(items, 'd1').done, false);
  assert.equal(byId(items, 'doc2').done, true);               // document: status Complete
  assert.equal(byId(items, 'b3').done, true);                 // bill: paid
  assert.equal(byId(items, 'a3').done, true);                 // application: Rejected counts as finished
  assert.equal(byId(items, 'a2').done, false);                // ...Waiting does not
  assert.equal(byId(items, 't4').done, true);                 // to-do: done flag
  assert.equal(byId(items, 's1').done, false);                // spaces, people and class times are never "done"
  assert.equal(byId(items, 'p1').done, false);
  assert.equal(byId(items, 'c1').done, false);
});

/* ---------------------------------------------------------------- what counts toward Today / Upcoming */

test('what counts as due: open, dated items only; applications only while still to apply', () => {
  const due = view().filter((i) => i.dueCounts).map((i) => i.id).sort();
  assert.deepEqual(due, [
    'a1',                    // Google: Preparing, dated
    'ap1', 'b1', 'b2', 'ct1', 'd1', 'd2', 'doc1', 'e1', 'm1', 'n1', 'p1', 'r1', 'so1', 't1', 't2',
  ].sort());
  for (const never of ['a2', 'a3', 'a4']) assert.equal(byId(view(), never).dueCounts, false, `${never}: Waiting / Rejected / no date`);
  for (const never of ['c1', 't3', 'h1', 'g1', 'pe1', 'pt1', 'd3', 't4', 'm2', 'b3', 'doc2', 'n2']) {
    assert.equal(byId(view(), never).dueCounts, false, never);
  }
});

test('days until: negative when late, null when there is no date', () => {
  const items = view();
  assert.equal(byId(items, 'd1').daysUntil, -2);              // Nov 3 vs Nov 5
  assert.equal(byId(items, 'd2').daysUntil, 0);
  assert.equal(byId(items, 'b1').daysUntil, 25);
  assert.equal(byId(items, 't3').daysUntil, null);
});

test('the name shown in a due list: space, person, follow-up and application forms', () => {
  const items = view();
  assert.equal(byId(items, 'd2').dueTitle, 'Applications of AI — Quiz 3');
  assert.equal(byId(items, 't1').dueTitle, 'Applications of AI — Grade the group projects — Diana Lee');   // linked person
  assert.equal(byId(items, 'e1').dueTitle, 'Applications of AI — Product in Practice — Diana Lee');
  assert.equal(byId(items, 'n1').dueTitle, 'Coffee chat — Diana Lee');
  assert.equal(byId(items, 'so1').dueTitle, 'Diwali party — Hema');
  assert.equal(byId(items, 'p1').dueTitle, 'Follow up: Diana Lee');
  assert.equal(byId(items, 'a1').dueTitle, 'Google — APM Intern');
  assert.equal(byId(items, 'ct1').dueTitle, 'Update resume');
});

test('a link to a person that no longer exists is ignored, not shown as blank', () => {
  const data = workspace();
  data.academics.subjects[0].todos[0].personId = 'gone';
  const item = byId(view(data), 't1');
  assert.equal(item.personId, 'gone');
  assert.equal(item.personName, '');
  assert.equal(item.dueTitle, 'Applications of AI — Grade the group projects');
});

/* ---------------------------------------------------------------- finishing items */

test('finishing and reopening uses the right field for each kind', () => {
  const data = workspace();
  const raw = (id) => { let found; Standard.forEachRaw(data, (kind, r) => { if (r.id === id) found = { kind, r }; }); return found; };
  for (const [id, field, doneValue, openValue] of [
    ['d1', 'status', 'Done', 'Not started'], ['doc1', 'status', 'Complete', 'Not Started'],
    ['b1', 'paid', true, false], ['t1', 'done', true, false], ['e1', 'done', true, false],
  ]) {
    const { kind, r } = raw(id);
    assert.equal(Standard.setDone(kind, r, true), true);
    assert.equal(r[field], doneValue, `${id} finished`);
    Standard.setDone(kind, r, false);
    assert.equal(r[field], openValue, `${id} reopened`);
  }
  for (const id of ['s1', 'p1', 'a1', 'c1']) {                 // these have no "finished"
    const { kind, r } = raw(id);
    assert.equal(Standard.setDone(kind, r, true), false, id);
  }
});

/* ---------------------------------------------------------------- repeating class times */

test('class times on a date: only those that meet, within their first and last day, earliest first', () => {
  const data = workspace();
  assert.deepEqual(Standard.classSessionsOn(data, '2026-11-05').map((s) => [s.title, s.start, s.end, s.location, s.spaceName]),
    [['Lecture', '08:40', '09:55', 'Tang Hall', 'Applications of AI']]);           // Thursday: not the ended section or the one that starts in December
  assert.deepEqual(Standard.classSessionsOn(data, '2026-11-06'), []);               // Friday
  assert.equal(Standard.classSessionsOn(data, '2026-12-03').length, 2);             // Thursday after the later section begins
  assert.deepEqual(Standard.classSessionsOn(data, 'not a date'), []);
});

/* ---------------------------------------------------------------- tracking: created, edited, finished */

test('stamps: new items get createdAt, edits get updatedAt, finishing sets doneAt and reopening clears it', () => {
  const data = workspace();
  const before = Standard.snapshot(data);
  const now = '2026-11-05T15:00:00.000Z';

  const space = data.academics.subjects[0];
  space.todos[2].text = 'Read the syllabus (edited)';                       // t3: edited
  space.todos[1].done = true;                                              // t2: finished
  space.todos[3].done = false;                                             // t4: reopened (it had a doneAt)
  space.todos.push({ id: 'new1', text: 'New', done: false });              // new
  assert.equal(Standard.stamp(data, before, now), 4);

  const get = (id) => byId(Standard.standardItems(data), id);
  assert.deepEqual([get('new1').createdAt, get('new1').updatedAt, get('new1').doneAt], [now, now, '']);
  assert.deepEqual([get('t3').createdAt, get('t3').updatedAt], ['', now]);   // an edit never invents a creation time
  assert.deepEqual([get('t2').updatedAt, get('t2').doneAt], [now, now]);
  assert.deepEqual([get('t4').updatedAt, get('t4').doneAt], [now, '']);
  assert.equal(get('t1').updatedAt, '');                                     // untouched items are left alone
  assert.equal(get('s1').updatedAt, '', 'changing a to-do does not mark its space as edited');
});

test('stamps: stamping again with nothing new changes nothing, and an item added already finished gets doneAt', () => {
  const data = workspace();
  let before = Standard.snapshot(data);
  assert.equal(Standard.stamp(data, before, '2026-11-05T15:00:00.000Z'), 0);

  before = Standard.snapshot(data);
  data.career.tasks.push({ id: 'x', text: 'Logged after the fact', done: true });
  Standard.stamp(data, before, '2026-11-05T16:00:00.000Z');
  const x = byId(Standard.standardItems(data), 'x');
  assert.deepEqual([x.createdAt, x.doneAt], ['2026-11-05T16:00:00.000Z', '2026-11-05T16:00:00.000Z']);
  before = Standard.snapshot(data);
  assert.equal(Standard.stamp(data, before, '2026-11-06T09:00:00.000Z'), 0);
});

test('stamps: changing a class time\'s days is an edit to that class time', () => {
  const data = workspace();
  const before = Standard.snapshot(data);
  data.academics.subjects[0].schedule[0].days = [1, 3];
  assert.equal(Standard.stamp(data, before, '2026-11-05T15:00:00.000Z'), 1);
  assert.equal(byId(Standard.standardItems(data), 'c1').updatedAt, '2026-11-05T15:00:00.000Z');
});

/* ---------------------------------------------------------------- upgrading older data */

test('upgrading a version 1 workspace adds type, contact and events and loses nothing', () => {
  const data = read('workspace-v1.json');
  assert.equal(Standard.migrate(data), true);
  const [decision, club] = data.academics.subjects;
  assert.deepEqual([data.schemaVersion, decision.type, decision.contact, decision.events], [2, 'Course', 'Prof. Reed', []]);   // has class times: a course
  assert.deepEqual([club.type, club.contact], ['', 'President - Ishitha']);                                                      // can't tell: left for you
  assert.ok(!('professor' in decision) && !('professor' in club));
  assert.equal(decision.todos[0].text, 'Read ch 4');
  assert.equal(decision.schedule[0].location, 'Olin');
});

test('upgrading is safe to repeat and leaves current data untouched', () => {
  const data = read('workspace-v1.json');
  Standard.migrate(data);
  const once = JSON.stringify(data);
  assert.equal(Standard.migrate(data), false);
  assert.equal(JSON.stringify(data), once);
  const current = workspace();
  const copy = JSON.stringify(current);
  assert.equal(Standard.migrate(current), false);
  assert.equal(JSON.stringify(current), copy);
});

/* ---------------------------------------------------------------- never breaks on odd data */

test('missing, older or damaged data never throws', () => {
  for (const data of [null, undefined, {}, [], 'text', { academics: null, people: 'x' }, { academics: { subjects: [null, 5, {}, { name: 3, deadlines: 'x', schedule: [null] }] } },
                      { lifeadmin: { bills: [{ due: 'soon' }, { due: '2026-11-05', amount: 'lots' }] }, career: { applications: [{ status: 'Waiting' }] } }]) {
    assert.doesNotThrow(() => Standard.standardItems(data, { today: TODAY }));
    assert.doesNotThrow(() => Standard.classSessionsOn(data, TODAY));
    assert.doesNotThrow(() => Standard.stamp(data, Standard.snapshot(data), '2026-11-05T00:00:00.000Z'));
    assert.doesNotThrow(() => Standard.migrate(data));
  }
  assert.equal(Standard.isIsoDate('2026-02-30'), false);
  assert.equal(Standard.normalizeClock('8:40'), '08:40');
  assert.equal(Standard.normalizeClock('25:00'), '');
});
