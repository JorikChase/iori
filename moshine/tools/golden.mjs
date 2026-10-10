#!/usr/bin/env node
// tools/golden.mjs — compute the fixture golden hashes. The node tests and the in-page harness both check
// these, which proves the fixtures are bit-identical in node and in every browser.
//
//   node moshine/tools/golden.mjs           print
//   node moshine/tools/golden.mjs --write   write moshine/tests/golden.json (only when a fixture changes on purpose)
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { goldenHashes } from '../fixtures.js';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const g = goldenHashes();
  if (process.argv.includes('--write')) {
    const p = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'golden.json');
    writeFileSync(p, JSON.stringify(g, null, 1) + '\n'); console.log('wrote', p);
  } else console.log(JSON.stringify(g, null, 1));
}
