/* Marginalia's standard view of the data.

   The workspace stores each kind of item in its own list with its own field names (a deadline has `title`, a to-do
   has `text`, a bill has `name` and `due`...). Everything that needs to ask a question across kinds -- what is due
   today, what is overdue, what did I finish -- reads the data through THIS file instead of re-deriving the rules.

   One file, two places it runs: the website loads it with a <script> tag (it becomes `window.Standard`), and the
   morning digest `require`s it. Claude's tools have a Python port that is tested against the same golden files
   (test/golden/), so the three cannot quietly drift apart.

   What it provides
     KINDS                         one entry per kind of item: which area, which fields mean title / date / time /
                                   done, and whether it can be linked to a person
     standardItems(data, opts)     every item in the workspace as {id, kind, area, title, date, time, endTime, done,
                                   status, notes, createdAt, updatedAt, doneAt, personId, dueCounts, ...}
     classSessionsOn(data, iso)    the repeating class times that fall on a date (computed, never stored per day)
     snapshot / stamp              record created / edited / finished times on whatever changed
     migrate(data)                 bring an older workspace up to the current version, without losing anything
   It never throws on missing or older-shaped data: absent lists count as empty. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Standard = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = 2;
  var AREAS = ['academics', 'lifeadmin', 'career', 'people', 'personal'];

  /* ---- small helpers (kept here so this file stands alone in the browser) ---- */
  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  var CLOCK = /^(\d{1,2}):(\d{2})$/;

  function isIsoDate(value) {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
    var parsed = new Date(value + 'T00:00:00Z');
    return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;   // "Feb 30" is not a date
  }
  function normalizeClock(value) {
    var match = typeof value === 'string' ? CLOCK.exec(value.trim()) : null;
    if (!match) return '';
    var hour = Number(match[1]), minute = Number(match[2]);
    if (hour > 23 || minute > 59) return '';
    return (hour < 10 ? '0' : '') + hour + ':' + match[2];
  }
  function utcMs(iso) { var p = iso.split('-').map(Number); return Date.UTC(p[0], p[1] - 1, p[2]); }
  function daysBetween(fromIso, toIso) { return Math.round((utcMs(toIso) - utcMs(fromIso)) / 86400000); }
  function weekdayOf(iso) { return new Date(utcMs(iso)).getUTCDay(); }          // 0 = Sunday, as the site stores it
  function list(value) { return Array.isArray(value) ? value.filter(function (x) { return x && typeof x === 'object'; }) : []; }
  function str(value) { return typeof value === 'string' ? value.trim() : ''; }

  /* ---- the kinds ----
     title / date / time / end: the stored field that plays that role (absent = the kind has none)
     done:   { flag } a true/false field   | { field, values } done when the status is one of these | { never }
     dueOnly: only counts toward Today / Upcoming while the status is one of these (applications)
     person: the field that links the item to someone in People */
  var KINDS = {
    'academics.space':       { area: 'academics', label: 'Space', title: 'name', done: { never: true }, container: true },
    'academics.deadline':    { area: 'academics', label: 'Deadline', title: 'title', date: 'date', time: 'time', done: { field: 'status', values: ['Done'] } },
    'academics.milestone':   { area: 'academics', label: 'Milestone', title: 'title', date: 'date', done: { flag: 'done' } },
    'academics.todo':        { area: 'academics', label: 'To-do', title: 'text', date: 'date', time: 'time', done: { flag: 'done' }, person: 'personId' },
    'academics.event':       { area: 'academics', label: 'Event', title: 'title', date: 'date', time: 'time', end: 'endTime', done: { flag: 'done' }, person: 'personId' },
    'academics.class':       { area: 'academics', label: 'Class time', title: 'title', time: 'start', end: 'end', done: { never: true }, repeating: true },
    'lifeadmin.document':    { area: 'lifeadmin', label: 'Document', title: 'name', date: 'deadline', done: { field: 'status', values: ['Complete'] } },
    'lifeadmin.home':        { area: 'lifeadmin', label: 'Home task', title: 'text', done: { flag: 'done' } },
    'lifeadmin.grocery':     { area: 'lifeadmin', label: 'Grocery', title: 'name', done: { flag: 'done' } },
    'lifeadmin.bill':        { area: 'lifeadmin', label: 'Bill', title: 'name', date: 'due', done: { flag: 'paid' } },
    'lifeadmin.appointment': { area: 'lifeadmin', label: 'Appointment', title: 'title', date: 'date', time: 'time', done: { flag: 'done' } },
    'career.application':    { area: 'career', label: 'Application', title: 'company', date: 'deadline', done: { field: 'status', values: ['Rejected', 'Closed'] }, dueOnly: { field: 'status', values: ['Interested', 'Preparing'] } },
    'career.task':           { area: 'career', label: 'Career task', title: 'text', date: 'date', time: 'time', done: { flag: 'done' }, person: 'personId' },
    'career.networking':     { area: 'career', label: 'Networking', title: 'text', date: 'date', time: 'time', done: { flag: 'done' }, person: 'personId' },
    'people.person':         { area: 'people', label: 'Person', title: 'name', date: 'next', done: { never: true }, container: true },
    'people.task':           { area: 'people', label: 'Person task', title: 'text', done: { flag: 'done' } },
    'personal.recreation':   { area: 'personal', label: 'Recreation', title: 'text', date: 'date', time: 'time', done: { flag: 'done' }, person: 'personId' },
    'personal.social':       { area: 'personal', label: 'Social', title: 'text', date: 'date', time: 'time', done: { flag: 'done' }, person: 'personId' },
    'personal.task':         { area: 'personal', label: 'Personal task', title: 'text', done: { flag: 'done' }, person: 'personId' }
  };

  /* Calls cb(kind, raw, context) for every item in the workspace, in a stable order. */
  function forEachRaw(data, cb) {
    var d = data && typeof data === 'object' ? data : {};
    var academics = d.academics || {}, life = d.lifeadmin || {}, career = d.career || {}, personal = d.personal || {};
    list(academics.subjects).forEach(function (s) {
      cb('academics.space', s, { space: s });
      list(s.deadlines).forEach(function (x) { cb('academics.deadline', x, { space: s }); });
      list(s.todos).forEach(function (x) { cb('academics.todo', x, { space: s }); });
      list(s.events).forEach(function (x) { cb('academics.event', x, { space: s }); });
      list(s.milestones).forEach(function (x) { cb('academics.milestone', x, { space: s }); });
      list(s.schedule).forEach(function (x) { cb('academics.class', x, { space: s }); });
    });
    list(life.documents).forEach(function (x) { cb('lifeadmin.document', x, {}); });
    list(life.home).forEach(function (x) { cb('lifeadmin.home', x, {}); });
    list(life.groceries).forEach(function (x) { cb('lifeadmin.grocery', x, {}); });
    list(life.bills).forEach(function (x) { cb('lifeadmin.bill', x, {}); });
    list(life.appointments).forEach(function (x) { cb('lifeadmin.appointment', x, {}); });
    list(career.applications).forEach(function (x) { cb('career.application', x, {}); });
    list(career.tasks).forEach(function (x) { cb('career.task', x, {}); });
    list(career.networking).forEach(function (x) { cb('career.networking', x, {}); });
    list(d.people).forEach(function (p) {
      cb('people.person', p, { person: p });
      list(p.tasks).forEach(function (x) { cb('people.task', x, { person: p }); });
    });
    list(personal.recreation).forEach(function (x) { cb('personal.recreation', x, {}); });
    list(personal.social).forEach(function (x) { cb('personal.social', x, {}); });
    list(personal.tasks).forEach(function (x) { cb('personal.task', x, {}); });
  }

  function isDone(kind, raw) {
    var rule = KINDS[kind].done;
    if (rule.never) return false;
    if (rule.flag) return !!raw[rule.flag];
    return rule.values.indexOf(raw[rule.field]) > -1;
  }

  /* Mark an item finished (or reopen it). Returns false when that kind of item has no "finished" (a space, a person,
     an application, a class time). */
  function setDone(kind, raw, done) {
    var rule = KINDS[kind].done;
    if (rule.never || kind === 'career.application') return false;
    if (rule.flag) { raw[rule.flag] = !!done; return true; }
    if (kind === 'academics.deadline') raw.status = done ? 'Done' : 'Not started';
    else if (kind === 'lifeadmin.document') raw.status = done ? 'Complete' : 'Not Started';
    return true;
  }

  /* ---- the standard view ---- */
  function standardItems(data, opts) {
    var today = opts && isIsoDate(opts.today) ? opts.today : '';
    var people = {};
    list(data && data.people).forEach(function (p) { if (p.id) people[p.id] = str(p.name); });
    var out = [];

    forEachRaw(data, function (kind, raw, ctx) {
      var spec = KINDS[kind];
      var dateRaw = spec.date ? raw[spec.date] : '';
      var date = isIsoDate(dateRaw) ? dateRaw : '';
      var item = {
        id: str(raw.id), kind: kind, area: spec.area, label: spec.label,
        spaceId: ctx.space ? str(ctx.space.id) : '', spaceName: ctx.space ? str(ctx.space.name) : '',
        title: str(raw[spec.title]), notes: str(raw.notes),
        date: date, time: spec.time ? normalizeClock(raw[spec.time]) : '', endTime: spec.end ? normalizeClock(raw[spec.end]) : '',
        done: isDone(kind, raw), status: str(raw.status),
        createdAt: str(raw.createdAt), updatedAt: str(raw.updatedAt), doneAt: str(raw.doneAt),
        personId: spec.person ? str(raw[spec.person]) : '', personName: '',
        dueCounts: false, daysUntil: null, raw: raw
      };
      if (item.personId) item.personName = people[item.personId] || '';

      // does this item count toward Today / Upcoming / overdue?
      var counts = !!date && !item.done && !spec.repeating;
      if (counts && spec.dueOnly) counts = spec.dueOnly.values.indexOf(raw[spec.dueOnly.field]) > -1;
      item.dueCounts = counts;
      if (today && date) item.daysUntil = daysBetween(today, date);

      // the name to show in a due list: "Space — thing", "Follow up: Name", "thing — Person"
      var shown = item.title || (ctx.space ? '' : spec.label);
      if (ctx.space && kind !== 'academics.space' && kind !== 'academics.class') shown = (item.spaceName || 'Untitled space') + ' — ' + (item.title || spec.label);
      else if (kind === 'people.person') shown = 'Follow up: ' + (item.title || 'someone');
      else if (kind === 'career.application') shown = (item.title || 'Application') + (str(raw.role) ? ' — ' + str(raw.role) : '');
      if (item.personName && spec.person) shown += ' — ' + item.personName;
      item.dueTitle = shown;

      // kind-specific extras the consumers sometimes need
      item.extra = {};
      if (kind === 'lifeadmin.bill') { item.extra.amount = Number(raw.amount); item.extra.recur = str(raw.recur); }
      if (kind === 'academics.deadline') item.extra.type = str(raw.type);
      if (kind === 'career.application') { item.extra.role = str(raw.role); item.extra.applied = str(raw.applied); }
      if (kind === 'academics.event') item.extra.location = str(raw.location);
      out.push(item);
    });
    return out;
  }

  /* Does this class time meet on `iso`? (right weekday, within its first and last day) */
  function meetsOn(cls, iso) {
    if (!isIsoDate(iso) || !Array.isArray(cls.days) || cls.days.indexOf(weekdayOf(iso)) < 0) return false;
    if (isIsoDate(cls.from) && iso < cls.from) return false;
    if (isIsoDate(cls.until) && iso > cls.until) return false;
    return true;
  }

  /* Repeating class times that meet on `iso`, earliest first. */
  function classSessionsOn(data, iso) {
    var out = [];
    if (!isIsoDate(iso)) return out;
    forEachRaw(data, function (kind, raw, ctx) {
      if (kind !== 'academics.class') return;
      var start = normalizeClock(raw.start);
      if (!start || !meetsOn(raw, iso)) return;
      out.push({
        date: iso, start: start, end: normalizeClock(raw.end), title: str(raw.title), location: str(raw.location),
        spaceId: str(ctx.space.id), spaceName: str(ctx.space.name) || 'Untitled space', color: str(ctx.space.color), classId: str(raw.id)
      });
    });
    out.sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : a.spaceName.localeCompare(b.spaceName); });
    return out;
  }

  /* ---- tracking: when an item was created, last changed, and finished ----
     Take a snapshot before a change, make the change, then stamp(): anything new gets createdAt, anything whose
     content changed gets updatedAt, and finishing / reopening sets / clears doneAt. This is done in one place so
     no code that edits an item has to remember to. Containers' child lists are not part of their own signature. */
  var STAMPS = { createdAt: 1, updatedAt: 1, doneAt: 1 };
  var CHILD_LISTS = { deadlines: 1, todos: 1, events: 1, milestones: 1, schedule: 1, tasks: 1 };   // a space's / person's own items
  function signature(raw) {
    var keys = Object.keys(raw).filter(function (k) { return !STAMPS[k] && !CHILD_LISTS[k]; }).sort();
    return JSON.stringify(keys.map(function (k) { return [k, raw[k]]; }));
  }
  function snapshot(data) {
    var before = {};
    forEachRaw(data, function (kind, raw) { if (raw.id) before[raw.id] = { sig: signature(raw), done: isDone(kind, raw) }; });
    return before;
  }
  function stamp(data, before, nowIso) {
    var touched = 0;
    forEachRaw(data, function (kind, raw) {
      if (!raw.id) return;
      var was = before[raw.id], done = isDone(kind, raw);
      if (!was) {                                     // new
        raw.createdAt = raw.createdAt || nowIso; raw.updatedAt = nowIso; raw.doneAt = done ? nowIso : (raw.doneAt || '');
        touched += 1;
      } else if (was.sig !== signature(raw)) {        // edited
        raw.updatedAt = nowIso;
        if (done && !was.done) raw.doneAt = nowIso;
        if (!done && was.done) raw.doneAt = '';
        touched += 1;
      }
    });
    return touched;
  }

  /* ---- versions ----
     v1 -> v2: a space (was "subject") gets a type and a contact (was "professor") and a list of events.
     Nothing is removed; running it again changes nothing. Returns true if it changed anything. */
  function migrate(data) {
    if (!data || typeof data !== 'object') return false;
    var changed = false;
    list(data.academics && data.academics.subjects).forEach(function (s) {
      if (!Array.isArray(s.events)) { s.events = []; changed = true; }
      if (s.contact === undefined) { s.contact = str(s.professor); changed = true; }
      if ('professor' in s) { delete s.professor; changed = true; }
      if (s.type === undefined) { s.type = list(s.schedule).length ? 'Course' : ''; changed = true; }
    });
    if (data.schemaVersion !== VERSION) { data.schemaVersion = VERSION; changed = true; }
    return changed;
  }

  return {
    VERSION: VERSION, AREAS: AREAS, KINDS: KINDS,
    isIsoDate: isIsoDate, normalizeClock: normalizeClock, daysBetween: daysBetween, weekdayOf: weekdayOf,
    forEachRaw: forEachRaw, isDone: isDone, setDone: setDone,
    standardItems: standardItems, classSessionsOn: classSessionsOn, meetsOn: meetsOn,
    snapshot: snapshot, stamp: stamp, migrate: migrate
  };
}));
