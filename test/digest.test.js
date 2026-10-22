'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { collect } = require('../lib/digest/collect');
const { buildDigest } = require('../lib/digest');
const { renderDigest, escapeHtml } = require('../lib/digest/render');
const { TODAY, sampleWorkspace, emptyWorkspace } = require('./fixtures');

const section = (digest, id) => digest.sections.find((s) => s.id === id);
const rowsOf = (sec) => sec.groups.flatMap((g) => g.rows);
const labels = (sec) => sec.groups.map((g) => g.label);

test('classes today: only the ones that meet today, in start order, with room', () => {
  const digest = buildDigest(sampleWorkspace(), TODAY);
  const classes = section(digest, 'classes');
  assert.deepEqual(rowsOf(classes).map((r) => [r.lead, r.text, r.tag]), [
    ['8:40 AM – 9:55 AM', 'AI Applications — Lecture', 'Room 120'],
    ['2:00 PM – 3:15 PM', 'Technology Strategy — Lecture', 'Room 310'],
  ]);                                                      // not the Friday lab, the ended section, or the one that starts next month
  assert.equal(digest.sections[0].id, 'classes');          // the classes section comes first
});

test('overdue: grouped by area in the site\'s order, oldest first, with how late', () => {
  const overdue = section(buildDigest(sampleWorkspace(), TODAY), 'overdue');
  assert.deepEqual(labels(overdue), ['Academics', 'Life Admin', 'Career', 'People']);
  assert.deepEqual(rowsOf(overdue).map((r) => [r.text, r.tag]), [
    ['Technology Strategy — Reading response 2', '2 days overdue'],
    ['AI Applications — Case Analysis 2', '1 day overdue'],
    ['Rent — $1,450', '2 days overdue'],
    ['Meridian Capital — Summer Analyst', '4 days overdue'],
    ['Follow up: Ricardo Puga', '1 day overdue'],
  ]);
  assert.ok(rowsOf(overdue).every((r) => r.tone === 'bad'));
});

test('due today: grouped by area, skipping done, paid and complete items', () => {
  const today = section(buildDigest(sampleWorkspace(), TODAY), 'today');
  assert.deepEqual(labels(today), ['Academics', 'Life Admin', 'Career', 'People', 'Personal']);
  const texts = rowsOf(today).map((r) => r.text);
  assert.deepEqual(texts, [
    'AI Applications — Quiz 1', 'Electricity — $64.50', 'Dentist', 'Google — APM Intern', 'Follow up: Anika Rao', 'Gym',
  ]);
  for (const hidden of ['Already handed in', 'Health waiver', 'Spotify', 'Played already']) {
    assert.ok(!texts.some((t) => t.includes(hidden)), `${hidden} should not appear`);
  }
  assert.equal(rowsOf(today).find((r) => r.text === 'Gym').lead, '7:00 PM');
});

test('coming up: tomorrow through three days ahead, in date order, tagged by area', () => {
  const soon = section(buildDigest(sampleWorkspace(), TODAY), 'soon');
  assert.deepEqual(rowsOf(soon).map((r) => [r.lead, r.text, r.tag]), [
    ['Fri', 'OPT application', 'Life Admin'],
    ['Fri · 9:30 AM', 'Coffee with Priya', 'Personal'],
    ['Sat · 5:00 PM', 'AI Applications — Project Proposal', 'Academics'],
    ['Sun', 'Wi-Fi — $50', 'Life Admin'],
  ]);
});

test('on your radar: nothing is repeated, waiting applications show how long, max three each', () => {
  const digest = buildDigest(sampleWorkspace(), TODAY);
  const radar = section(digest, 'radar');
  assert.deepEqual(labels(radar), ['Bills due soon', 'Waiting to hear back', 'People to follow up with']);
  const [bills, waiting, people] = radar.groups;
  assert.deepEqual(bills.rows.map((r) => r.text), ['Phone — $35']);                    // Wi-Fi is already under "coming up"
  assert.deepEqual(waiting.rows.map((r) => [r.text, r.tag]), [
    ['Databricks — APM', '7d'], ['Northwind Labs — PM Intern', '2d'], ['Bridgewater — Associate', ''],
  ]);
  assert.deepEqual(people.rows.map((r) => r.text), ['James Whitfield']);               // Ricardo and Anika are overdue / due today above

  const all = digest.sections.flatMap((s) => (s.id === 'radar' ? [] : rowsOf(s))).map((r) => r.text);
  assert.ok(!all.some((t) => t.startsWith('Phone')) && !all.includes('James Whitfield'));
});

test('an application\'s one date only counts as a deadline while it is Interested or Preparing', () => {
  const model = collect(sampleWorkspace(), TODAY);
  const titles = model.items.map((i) => i.title);
  assert.ok(titles.includes('Google — APM Intern') && titles.includes('Meridian Capital — Summer Analyst'));
  for (const gone of ['Cornell Tech Studio', 'Databricks', 'Northwind', 'Rivet']) {
    assert.ok(!titles.some((t) => t.includes(gone)), `${gone} is not a deadline`);
  }
});

test('long lists are cut to keep the email short, and say how many were left out', () => {
  const data = emptyWorkspace();
  data.lifeadmin.documents = Array.from({ length: 12 }, (_, i) => ({
    id: `x${i}`, name: `Form ${i}`, deadline: '2026-10-10', status: 'Not Started',
  }));
  const overdue = section(buildDigest(data, TODAY), 'overdue');
  assert.equal(rowsOf(overdue).length, 8);
  assert.equal(overdue.more, 4);
});

test('an empty record, and one with nothing relevant today, gives a clear day', () => {
  assert.equal(buildDigest(emptyWorkspace(), TODAY).empty, true);
  const quiet = emptyWorkspace();
  quiet.lifeadmin.bills = [{ id: 'z', name: 'Far away', amount: 5, due: '2026-12-31', paid: false }];
  assert.equal(buildDigest(quiet, TODAY).empty, true);
  const email = renderDigest(buildDigest(emptyWorkspace(), TODAY));
  assert.match(email.html, /Clear day/);
  assert.match(email.text, /Clear day/);
  assert.equal(email.subject, 'Your day: Thu, Oct 22');
});

test('older or incomplete records never throw', () => {
  for (const data of [null, undefined, {}, { academics: null, people: 'nope' }, { academics: { subjects: [null, {}, { name: 5 }] } },
                      { lifeadmin: { bills: [{ due: 'soon' }, { due: '2026-10-22' }] }, career: { applications: [{ status: 'Waiting' }] } }]) {
    assert.doesNotThrow(() => renderDigest(buildDigest(data, TODAY)));
  }
  // a waiting application from before the single-date change keeps its "applied" date
  const legacy = emptyWorkspace();
  legacy.career.applications = [{ id: 'l', company: 'Oldco', role: 'PM', deadline: '', applied: '2026-10-12', status: 'Waiting' }];
  assert.equal(collect(legacy, TODAY).waiting[0].daysSince, 10);
});

test('the email: subject, plain-text fallback, and everything from your data is escaped', () => {
  const data = sampleWorkspace();
  data.lifeadmin.appointments.push({ id: 'evil', title: '<script>alert("x")</script> & co', date: TODAY, time: '', done: false });
  const email = renderDigest(buildDigest(data, TODAY), { siteUrl: 'https://example.com' });
  assert.equal(email.subject, 'Your day: Thu, Oct 22');
  assert.ok(!email.html.includes('<script>') && email.html.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co'));
  assert.match(email.html, /Open Marginalia/);
  assert.ok(!/<[a-z]/i.test(email.text.replace('<script>alert("x")</script> & co', '')));       // the text version is plain text
  assert.match(email.text, /^YOUR DAY: Thursday, Oct 22/);
  assert.match(email.text, /CLASSES TODAY\n {2}8:40 AM – 9:55 AM {2}AI Applications — Lecture {2}\(Room 120\)/);
  assert.match(email.text, /OVERDUE\n {2}Academics\n {4}Technology Strategy — Reading response 2 {2}\(2 days overdue\)/);
  assert.equal(escapeHtml(`<>&"'`), '&lt;&gt;&amp;&quot;&#39;');
});

test('the planner is swappable: the digest takes any planner with the same shape', () => {
  const { PLANNERS } = require('../lib/digest');
  assert.deepEqual(Object.keys(PLANNERS), ['simple']);
  assert.throws(() => buildDigest(emptyWorkspace(), TODAY, { planner: 'ranked' }), /Unknown digest planner/);
});
