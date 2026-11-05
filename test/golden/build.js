'use strict';

/* Builds the golden answers from the golden inputs using lib/standard.js. The same inputs are checked in the Python
   port used by Claude's tools (grad-task-mcp), and its answers must match expected.json exactly. If you change what
   the standard view means on purpose, run `npm run golden`, review the diff of expected.json, and copy the files in
   test/golden/ to the other repo. */

const fs = require('node:fs');
const path = require('node:path');
const Standard = require('../../lib/standard');

const read = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, name), 'utf8'));
const TODAY = '2026-11-05';                    // a Thursday
const SESSION_DATES = ['2026-11-05', '2026-11-06', '2026-11-10'];

const withoutRaw = (items) => items.map(({ raw, ...rest }) => rest);

/* Applies the scripted edits in stamp-ops.json the way the site does: change fields, finish / reopen, add items. */
function applyOps(data, ops) {
  Standard.forEachRaw(data, (kind, raw) => {
    if (ops.edit[raw.id]) Object.assign(raw, ops.edit[raw.id]);
    if (raw.id in ops.done) Standard.setDone(kind, raw, ops.done[raw.id]);
  });
  for (const add of ops.add) {
    const space = data.academics.subjects.find((s) => s.id === add.space);
    (space[add.list] = space[add.list] || []).push(JSON.parse(JSON.stringify(add.item)));
  }
}

function build() {
  const workspace = read('workspace.json');
  const ops = read('stamp-ops.json');

  const stamped = JSON.parse(JSON.stringify(workspace));
  const before = Standard.snapshot(stamped);
  applyOps(stamped, ops);
  const touched = Standard.stamp(stamped, before, ops.now);
  const stamps = {};
  Standard.forEachRaw(stamped, (kind, raw) => {
    if (raw.createdAt || raw.updatedAt || raw.doneAt) stamps[raw.id] = { createdAt: raw.createdAt || '', updatedAt: raw.updatedAt || '', doneAt: raw.doneAt || '' };
  });

  const migrated = read('workspace-v1.json');
  Standard.migrate(migrated);

  const sessions = {};
  for (const date of SESSION_DATES) sessions[date] = Standard.classSessionsOn(workspace, date);

  return { today: TODAY, items: withoutRaw(Standard.standardItems(workspace, { today: TODAY })), sessions, stamps: { touched, byId: stamps }, migrated };
}

module.exports = { build, applyOps, read, TODAY };
