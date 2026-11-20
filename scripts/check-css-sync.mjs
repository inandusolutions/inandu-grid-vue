#!/usr/bin/env node
// The stylesheet of grid-vue and grid-react is the same file apart from the framework's name (the class prefix, the package name in
// the import line, `InanduGrid.vue` / `InanduGrid.tsx` in a comment). This compares the two with those names set aside, so a rule
// changed in one repo and forgotten in the other shows up.
//
//   npm run check:css-sync                 compares with ../inandu-grid-react if it is checked out next to this repo,
//                                          else with the file on grid-react's main branch (needs network)
//   npm run check:css-sync -- <path>       compares with that file
//
// Not part of CI on purpose: a change that has to land in both repos would fail the first one until the second is merged.
// Run it before opening a PR that touches `src/styles/inandu-grid.css` in either repo.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const mine = resolve(here, '../src/styles/inandu-grid.css');
const sibling = resolve(here, '../../inandu-grid-react/src/styles/inandu-grid.css');
const remote = 'https://raw.githubusercontent.com/inandusolutions/inandu-grid-react/main/src/styles/inandu-grid.css';

/** The same text with the framework names replaced by a placeholder, line endings made equal, and trailing spaces dropped. */
export function normalize(css) {
  return css
    .replace(/\r\n/g, '\n')
    .replace(/grid-(?:react|vue)\b/g, 'grid-FRAMEWORK')
    .replace(/InanduGrid\.(?:tsx|vue)/g, 'InanduGrid.FRAMEWORK')
    .replace(/[ \t]+$/gm, '');
}

/** The first line at which the two texts differ, as `{ line, mine, theirs }`, or `undefined` when they are the same. */
export function firstDifference(a, b) {
  const left = a.split('\n');
  const right = b.split('\n');
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if (left[i] !== right[i]) return { line: i + 1, mine: left[i] ?? '(end of file)', theirs: right[i] ?? '(end of file)' };
  }
  return undefined;
}

async function main() {
  const argument = process.argv[2];
  let theirs;
  let where;
  if (argument) {
    theirs = readFileSync(resolve(argument), 'utf8');
    where = argument;
  } else if (existsSync(sibling)) {
    theirs = readFileSync(sibling, 'utf8');
    where = sibling;
  } else {
    const response = await fetch(remote);
    if (!response.ok) throw new Error(`Could not fetch ${remote}: ${response.status}`);
    theirs = await response.text();
    where = remote;
  }
  const difference = firstDifference(normalize(readFileSync(mine, 'utf8')), normalize(theirs));
  if (!difference) {
    console.log(`The stylesheet matches grid-react's (${where}).`);
    return;
  }
  console.error(`The stylesheet differs from grid-react's (${where}), first at line ${difference.line} (names set aside):`);
  console.error(`  grid-vue:   ${difference.mine}`);
  console.error(`  grid-react: ${difference.theirs}`);
  console.error('Change the same rule in the other repo, or make sure it is meant to differ.');
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
