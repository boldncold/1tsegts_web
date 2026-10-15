// Round-trip latency from this machine to candidate backend regions, for
// choosing where the Convex deployment lives (there is no Asia region).
//
//   node scripts/convex-latency.mjs [rounds]
//
// Run it from a Mongolian connection — the customers' network is the point.
// "cold" = first request (DNS + TCP + TLS + request), what a fresh page load
// pays once; "warm" = later requests on the kept-alive connection, roughly what
// every query/mutation round trip costs after that.

import { readFileSync } from 'node:fs';

const rounds = Number(process.argv[2] ?? 15);

function convexSiteUrl() {
  if (process.env.VITE_CONVEX_SITE_URL) return process.env.VITE_CONVEX_SITE_URL;
  try {
    const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    return env.match(/^VITE_CONVEX_SITE_URL=(\S+)/m)?.[1];
  } catch {
    return undefined;
  }
}

const site = convexSiteUrl();
const targets = [
  ...(site ? [{ label: 'Convex US (actual, /ping)', url: `${site}/ping` }] : []),
  // Convex EU runs on AWS eu-west-1 (Dublin). AWS's regional health endpoint is
  // a proxy for it; the us-east-1 one calibrates the proxy against Convex US.
  { label: 'AWS us-east-1 (proxy)', url: 'https://dynamodb.us-east-1.amazonaws.com/ping' },
  { label: 'AWS eu-west-1 (proxy for Convex EU)', url: 'https://dynamodb.eu-west-1.amazonaws.com/ping' },
  // Today's backend. A GET is rejected by the callable before any handler code
  // runs: no database read, no QPay call.
  {
    label: 'Firebase asia-east1 (today)',
    url: 'https://asia-east1-ai-studio-applet-webapp-730e3.cloudfunctions.net/createQpayInvoice',
  },
];

async function time(url) {
  const start = performance.now();
  const res = await fetch(url, { cache: 'no-store' });
  await res.arrayBuffer(); // drain so the connection is reused
  return performance.now() - start;
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

console.log(`${rounds} warm rounds per target\n`);
console.log('target'.padEnd(38), 'cold'.padStart(7), 'min'.padStart(7), 'median'.padStart(7), 'p90'.padStart(7));
for (const { label, url } of targets) {
  try {
    const cold = await time(url);
    const warm = [];
    for (let i = 0; i < rounds; i++) warm.push(await time(url));
    warm.sort((a, b) => a - b);
    const ms = (n) => `${Math.round(n)}ms`.padStart(7);
    console.log(label.padEnd(38), ms(cold), ms(warm[0]), ms(pct(warm, 0.5)), ms(pct(warm, 0.9)));
  } catch (err) {
    console.log(label.padEnd(38), `failed: ${err.message}`);
  }
}
