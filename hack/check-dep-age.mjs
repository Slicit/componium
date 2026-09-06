/* No package younger than two weeks.
 *
 * The attack this is against is specific and has happened repeatedly to other
 * people: someone takes over a maintainer account, publishes a version with a
 * postinstall script or a quietly altered build step, and it is pulled into
 * thousands of installs within hours. It is usually caught, and it is usually
 * caught in days rather than minutes. Waiting two weeks before taking a new
 * version costs almost nothing and moves this project out of the window where
 * that kind of thing is still live.
 *
 * It reads the lockfile rather than package.json, because the versions that
 * actually get installed are transitive far more often than direct, and a
 * compromised transitive dependency runs exactly the same code.
 *
 *   node hack/check-dep-age.mjs            # the lockfile in web/
 *   node hack/check-dep-age.mjs --days 30
 *
 * Exits non-zero when something is too new, listing what and how new.
 *
 * The escape hatch is deliberate and is in hack/dep-age-allow.json. A security
 * fix worth taking immediately is a real thing, and a rule with no way to say
 * "yes, on purpose, here is why" gets removed the first time it is
 * inconvenient. Each exception carries a reason and a date it stops applying,
 * so an exception cannot quietly become the permanent state.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = dirname(HERE);
const LOCK = join(ROOT, 'web', 'package-lock.json');
const ALLOW = join(HERE, 'dep-age-allow.json');

const args = process.argv.slice(2);
const days = Number(args[args.indexOf('--days') + 1]) || 14;
const CONCURRENCY = 12;

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!existsSync(LOCK)) fail('no lockfile at ' + LOCK);

const lock = JSON.parse(readFileSync(LOCK, 'utf8'));

/* name -> version, from every entry in the tree that came from the registry.
 * Link and workspace entries have no version to check. */
const wanted = new Map();
for (const [path, entry] of Object.entries(lock.packages ?? {})) {
  if (!path || !entry.version || entry.link) continue;
  const name = entry.name ?? path.slice(path.lastIndexOf('node_modules/') + 13);
  if (!name) continue;
  wanted.set(name + '@' + entry.version, { name, version: entry.version });
}

const allow = existsSync(ALLOW) ? JSON.parse(readFileSync(ALLOW, 'utf8')) : { exceptions: [] };
const today = new Date();
const excused = new Map();
for (const e of allow.exceptions ?? []) {
  if (!e.package || !e.until) continue;
  if (new Date(e.until) < today) {
    console.log('expired exception, no longer applied: ' + e.package + ' (' + e.reason + ')');
    continue;
  }
  excused.set(e.package, e);
}

async function publishedAt({ name, version }) {
  const url = 'https://registry.npmjs.org/' + name.replace('/', '%2f');
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(name + ': registry said ' + res.status);
  const body = await res.json();
  const when = body.time?.[version];
  if (!when) throw new Error(name + '@' + version + ': the registry does not date it');
  return new Date(when);
}

const jobs = [...wanted.values()];
const tooNew = [];
const unknown = [];
let done = 0;

async function worker() {
  for (;;) {
    const job = jobs.shift();
    if (!job) return;
    const key = job.name + '@' + job.version;
    try {
      const when = await publishedAt(job);
      const age = (today - when) / 86400000;
      if (age < days && !excused.has(job.name) && !excused.has(key)) {
        tooNew.push({ ...job, age });
      }
    } catch (why) {
      unknown.push(String(why.message ?? why));
    }
    done++;
  }
}

console.log('checking ' + wanted.size + ' packages, nothing younger than ' + days + ' days');
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

if (unknown.length) {
  console.log();
  console.log('could not be checked (' + unknown.length + '):');
  for (const u of unknown.slice(0, 10)) console.log('  ' + u);
}

if (tooNew.length) {
  console.log();
  console.log('published less than ' + days + ' days ago:');
  for (const p of tooNew.sort((a, b) => a.age - b.age)) {
    console.log('  ' + p.name + '@' + p.version + '  ' + p.age.toFixed(1) + ' days old');
  }
  console.log();
  console.log('Wait, pin the previous version, or add an exception with a reason');
  console.log('and an expiry to hack/dep-age-allow.json.');
  process.exit(1);
}

console.log('nothing too new.');
if (unknown.length) process.exit(1);
