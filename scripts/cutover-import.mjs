// Cutover step 3.4: copy menu, store settings and recent orders from live
// Firestore into a Convex deployment (docs/CONVEX_CUTOVER.md).
//
//   node scripts/cutover-import.mjs --prod     # production (the cutover)
//   node scripts/cutover-import.mjs            # the dev deployment in .env.local
//
// Re-runnable: rows are upserted by their Firestore id, so running it twice
// changes nothing. The source is the web config in firebase-applet-config.json
// (public by design: the same values ship in the old site's bundle).
// Building the JSON here, rather than typing it into a shell, avoids PowerShell
// 5.1 stripping the double quotes from arguments passed to npx.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const prod = process.argv.includes('--prod');
const config = JSON.parse(readFileSync(new URL('../firebase-applet-config.json', import.meta.url), 'utf8'));
const args = {
  source: { projectId: config.projectId, databaseId: config.firestoreDatabaseId, apiKey: config.apiKey },
  collections: ['menu', 'settings', 'orders'],
  ordersSinceDays: 7,
};

console.log(`Importing ${args.collections.join(', ')} into ${prod ? 'PRODUCTION' : 'dev'}…`);
// The CLI's own entry point under node, not npx: no shell, so no quoting.
const cli = fileURLToPath(new URL('../node_modules/convex/bin/main.js', import.meta.url));
const run = spawnSync(
  process.execPath,
  [cli, 'run', ...(prod ? ['--prod'] : []), 'migrations/firestoreImport:importPublicData', JSON.stringify(args)],
  { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'], maxBuffer: 16 * 1024 * 1024 },
);
if (run.status !== 0) {
  console.error(`convex run failed (exit ${run.status}).`);
  process.exit(run.status ?? 1);
}

const reports = JSON.parse(run.stdout);
let failed = 0;
for (const [name, r] of Object.entries(reports)) {
  failed += r.failed.length + (r.error ? 1 : 0);
  console.log(
    `${name.padEnd(9)} read ${r.read}, imported ${r.imported}, failed ${r.failed.length}` +
      (r.error ? `, ERROR ${r.error}` : ''),
  );
  for (const f of r.failed) console.log(`  ${f.id}: ${f.error}`);
}
console.log(failed === 0 ? 'OK: nothing failed.' : `${failed} problem(s) above — fix and re-run.`);
process.exit(failed === 0 ? 0 : 1);
