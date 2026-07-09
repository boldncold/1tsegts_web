/**
 * QPay callback_url diagnostic.
 *
 * Figures out *empirically* why `POST /v2/invoice` returns
 *   {"error":{"callback_url":{"type":"INVALID"}}}
 * by auth'ing with your real merchant creds and trying several callback_url
 * formats. It creates tiny throwaway invoices and cancels the ones that
 * succeed, so it's safe to run against sandbox; avoid spamming PROD.
 *
 * It NEVER prints your secrets — the callback token is masked as <TOKEN> in
 * output, so you can paste the results back verbatim.
 *
 * ── How to run ────────────────────────────────────────────────────────────
 * The script reads config from env vars. Pull them from Firebase secrets into
 * your shell first (you're authorized for this; I'm not):
 *
 *   PID=ai-studio-applet-webapp-730e3
 *   export QPAY_BASE_URL=$(firebase functions:secrets:access QPAY_BASE_URL --project $PID)
 *   export QPAY_USERNAME=$(firebase functions:secrets:access QPAY_USERNAME --project $PID)
 *   export QPAY_PASSWORD=$(firebase functions:secrets:access QPAY_PASSWORD --project $PID)
 *   export QPAY_INVOICE_CODE=$(firebase functions:secrets:access QPAY_INVOICE_CODE --project $PID)
 *   export QPAY_CALLBACK_TOKEN=$(firebase functions:secrets:access QPAY_CALLBACK_TOKEN --project $PID)
 *   export QPAY_WEBHOOK_URL=$(firebase functions:secrets:access QPAY_WEBHOOK_URL --project $PID)
 *   node functions/scripts/diagnose-qpay.mjs
 *
 * (PowerShell: use  $env:QPAY_BASE_URL = firebase functions:secrets:access ... )
 */

const env = (k) => process.env[k];

const required = [
  'QPAY_BASE_URL',
  'QPAY_USERNAME',
  'QPAY_PASSWORD',
  'QPAY_INVOICE_CODE',
  'QPAY_CALLBACK_TOKEN',
  'QPAY_WEBHOOK_URL',
];
const missing = required.filter((k) => !env(k));
if (missing.length) {
  console.error('Missing env vars:', missing.join(', '));
  console.error('See the header of this file for how to set them.');
  process.exit(1);
}

const BASE = env('QPAY_BASE_URL').trim().replace(/\/+$/, '');
const TOKEN = env('QPAY_CALLBACK_TOKEN');
const RAW_WEBHOOK = env('QPAY_WEBHOOK_URL');

// ── Inspect the webhook secret for the usual gremlins ──────────────────────
console.log('\n=== QPAY_WEBHOOK_URL inspection ===');
console.log('raw length        :', JSON.stringify(RAW_WEBHOOK).length, '(JSON-quoted)');
console.log('has leading/trailing whitespace:', RAW_WEBHOOK !== RAW_WEBHOOK.trim());
console.log('contains newline  :', /\r|\n/.test(RAW_WEBHOOK));
console.log('starts with https :', /^https:\/\//i.test(RAW_WEBHOOK.trim()));
console.log('startsWith http(s):', /^https?:\/\//i.test(RAW_WEBHOOK.trim()));
let webhookBase = RAW_WEBHOOK.trim();
if (!/^https?:\/\//i.test(webhookBase)) webhookBase = 'https://' + webhookBase;
try {
  const u = new URL(webhookBase);
  webhookBase = `${u.origin}${u.pathname.replace(/\/+$/, '')}`;
  console.log('normalized base   :', webhookBase);
} catch {
  console.log('normalized base   : <NOT A VALID URL>');
}

const mask = (s) => s.split(encodeURIComponent(TOKEN)).join('<TOKEN>').split(TOKEN).join('<TOKEN>');

async function auth() {
  const basic = Buffer.from(`${env('QPAY_USERNAME')}:${env('QPAY_PASSWORD')}`).toString('base64');
  const res = await fetch(`${BASE}/v2/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`auth HTTP ${res.status} — ${body}`);
  return JSON.parse(body).access_token;
}

async function tryInvoice(token, label, callbackUrl) {
  const senderInvoiceNo = `diag-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const res = await fetch(`${BASE}/v2/invoice`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoice_code: env('QPAY_INVOICE_CODE'),
      sender_invoice_no: senderInvoiceNo,
      invoice_receiver_code: 'terminal',
      invoice_description: 'qpay callback diagnostic',
      amount: 10,
      callback_url: callbackUrl,
    }),
  });
  const body = await res.text();
  console.log(`\n--- ${label} ---`);
  console.log('callback_url:', mask(callbackUrl));
  console.log('HTTP', res.status);
  if (res.ok) {
    console.log('RESULT: ✅ ACCEPTED');
    try {
      const inv = JSON.parse(body).invoice_id;
      if (inv) {
        await fetch(`${BASE}/v2/invoice/${inv}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log('cleaned up invoice', inv);
      }
    } catch { /* ignore cleanup errors */ }
  } else {
    console.log('RESULT: ❌ REJECTED —', body.slice(0, 300));
  }
}

(async () => {
  console.log('\n=== auth ===');
  console.log('base:', BASE);
  const token = await auth();
  console.log('auth OK');

  const oid = 'TESTORDER123';
  const t = encodeURIComponent(TOKEN);

  // The formats we want to compare:
  await tryInvoice(token, 'A. path-based  <base>/<token>/<orderId>', `${webhookBase}/${t}/${oid}`);
  await tryInvoice(token, 'B. query both  <base>?order_id&token',   `${webhookBase}?order_id=${oid}&token=${t}`);
  await tryInvoice(token, 'C. query one   <base>?payment_id (spec)', `${webhookBase}?payment_id=${oid}`);
  await tryInvoice(token, 'D. clean       <base> (no params)',       `${webhookBase}`);

  console.log('\n=== done. The format(s) marked ✅ are what QPay accepts. ===\n');
})().catch((e) => {
  console.error('\nFATAL:', e.message);
  process.exit(1);
});
