'use strict';

const { collect } = require('./collect');
const phase1 = require('./phase1');

/* Planners decide which items appear in the digest. Phase 1 ("simple") is built in. A ranked plan can be added
   here later with the same signature: (model, options) => ({ sections }). */
const PLANNERS = { simple: phase1.plan };

/** data: the saved workspace JSON. today: the New York date, "YYYY-MM-DD". */
function buildDigest(data, today, { planner = 'simple', options } = {}) {
  const plan = PLANNERS[planner];
  if (!plan) throw new Error(`Unknown digest planner: ${planner}`);
  const { sections } = plan(collect(data, today), options);
  return { today, sections, empty: sections.length === 0 };
}

module.exports = { buildDigest, PLANNERS };
