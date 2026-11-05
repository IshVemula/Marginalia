#!/usr/bin/env node
'use strict';

/* Rewrites test/golden/expected.json from the golden inputs. Review the diff before committing. */

const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../test/golden/build');

const target = path.join(__dirname, '..', 'test', 'golden', 'expected.json');
fs.writeFileSync(target, JSON.stringify(build(), null, 2) + '\n');
console.log('wrote', path.relative(process.cwd(), target));
