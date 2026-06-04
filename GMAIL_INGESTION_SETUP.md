# Gmail → Firestore Bank Transaction Ingestion

This doc sets up automatic ingestion of Khan Bank email notifications into the
`/bank_transactions` Firestore collection that the Bank History admin tab reads
from. Once deployed, every transaction email Khan Bank sends to
`battsetseg1977@gmail.com` will appear in the admin tab within ~5 minutes,
and any with a `GR-XXXXXX` reference code will be auto-matched to a pending
order with one-click confirmation.

**Architecture:** Google Apps Script attached to your Gmail polls every 5 minutes
for unread Khan Bank emails, parses them, and writes directly to Firestore via
the REST API authenticated as a Firebase service account. No Cloud Functions
deployment needed.

```
Khan Bank ──email──► battsetseg1977@gmail.com
                        │
                        ▼
            Apps Script time trigger (every 5 min)
                        │
                        ├─ search inbox: from:khanbank.mn label:unread
                        ├─ for each match: parse body
                        └─ POST to Firestore /bank_transactions
                                   │
                                   ▼
                  Admin opens Bank History tab → onSnapshot picks it up
```

---

## Prerequisites

- The Gmail account `battsetseg1977@gmail.com` (you have access)
- Khan iBank notification emails enabled (settings in iBank → Notifications →
  enable per-transaction emails to this address)
- Firebase project console access (you have it — `ai-studio-applet-webapp-730e3`)

---

## Step 1: Create a Firebase service account

1. Open https://console.firebase.google.com → select your project →
   **Project settings** → **Service accounts** tab.
2. Click **Generate new private key**. A JSON file downloads — keep it secret.
3. The file looks like:
   ```json
   {
     "type": "service_account",
     "project_id": "ai-studio-applet-webapp-730e3",
     "private_key_id": "...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
     "client_email": "firebase-adminsdk-xxxxx@ai-studio-applet-webapp-730e3.iam.gserviceaccount.com",
     ...
   }
   ```

You'll paste two fields from this into Apps Script in step 3:
`client_email` and `private_key`.

---

## Step 2: Allow service-account writes in Firestore rules

In `firestore.rules`, add (or confirm) that service-account writes to
`/bank_transactions` are allowed. Service accounts bypass standard rules
when using admin auth, but if your project uses request-level rules, add:

```
match /bank_transactions/{txId} {
  // Admin web app (admin user) can read; only the ingestion service writes.
  allow read: if request.auth != null && request.auth.token.admin == true
             || request.auth.token.email in [
                  'boldsaihanlolor@gmail.com',
                  'battsetseg1977@gmail.com'
                ];
  // Writes happen via service-account REST calls which carry no `request.auth`
  // for our purposes — the REST API uses the service account's GCP IAM
  // permissions (Cloud Datastore User role on the project), so we leave
  // client write blocked here.
  allow write: if false;
}
```

> If you don't have a `firestore.rules` file deployed yet, your default rules
> may already permit any authenticated user; in that case skip this step
> until you tighten security.

---

## Step 3: Open Apps Script in Gmail

1. Sign in to `battsetseg1977@gmail.com` → open
   https://script.google.com → **New Project**.
2. Rename it to **Khan Bank → Firestore**.
3. Delete the default `Code.gs` content and paste the script in
   [Step 4](#step-4-the-apps-script).
4. Open **Project Settings (gear icon)** → enable
   **"Show appsscript.json manifest file in editor"**.
5. In the editor, open `appsscript.json` and replace its contents with:
   ```json
   {
     "timeZone": "Asia/Ulaanbaatar",
     "dependencies": {},
     "exceptionLogging": "STACKDRIVER",
     "runtimeVersion": "V8"
   }
   ```

---

## Step 4: The Apps Script

Paste this into `Code.gs`. Replace the three `TODO` constants at the top
with values from the service account JSON.

```javascript
// ============================================================================
// Khan Bank → Firestore ingestion
// Polls Gmail for unread Khan Bank notification emails, parses them, writes to
// Firestore /bank_transactions. Runs on a 5-minute time trigger.
// ============================================================================

// TODO — paste from the service account JSON downloaded in step 1.
const SA_CLIENT_EMAIL = 'firebase-adminsdk-XXXXX@ai-studio-applet-webapp-730e3.iam.gserviceaccount.com';
const SA_PRIVATE_KEY  = '-----BEGIN PRIVATE KEY-----\nPASTE-HERE-PRESERVE-NEWLINES\n-----END PRIVATE KEY-----\n';
const PROJECT_ID      = 'ai-studio-applet-webapp-730e3';

// Firestore database id from firebase-applet-config.json (this project uses a
// non-default named database). If you ever migrate to (default), change this.
const FIRESTORE_DB_ID = 'ai-studio-c9d0a348-c974-424c-a7d7-b422ac0da613';

// Gmail search query — adjust the from: address to match Khan Bank's actual
// notification sender. Common candidates:
//   noreply@khanbank.com / notify@khanbank.mn / e-statement@khanbank.com
// We look at unread mail only so re-runs don't duplicate.
const GMAIL_QUERY = 'from:khanbank.com is:unread newer_than:7d';

// Reference-code pattern (must match generateReferenceCode in src/lib/referenceCode.ts)
const REF_REGEX = /GR-[A-Z2-9]{6}/;

// Skip ingest for credits below this amount — they're noise (refund fragments,
// wrong-account transfers, accidental tiny tests). Must mirror MIN_BANK_TRANSFER_AMOUNT
// in src/lib/bankConfig.ts so the auto-confirm threshold is consistent end-to-end.
const MIN_INGEST_AMOUNT_MNT = 5000;

// Entry point — wired to the time trigger.
function pollKhanBankEmails() {
  const threads = GmailApp.search(GMAIL_QUERY, 0, 50);
  Logger.log('Found %s threads', threads.length);

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      if (msg.isUnread()) {
        try {
          processMessage(msg);
          msg.markRead();   // mark read so we don't re-process
        } catch (e) {
          Logger.log('Failed to process message %s: %s', msg.getId(), e);
          // Don't mark read — try again next tick
        }
      }
    }
  }
}

function processMessage(msg) {
  const body = msg.getPlainBody() || htmlToText(msg.getBody());
  const parsed = parseKhanEmail(body, msg);
  if (!parsed) {
    Logger.log('Not a transaction email: %s', msg.getSubject());
    return;
  }
  if (parsed.direction !== 'credit') {
    Logger.log('Skipping non-credit: %s', parsed.bankTxId);
    return;
  }
  if (parsed.amountMnt < MIN_INGEST_AMOUNT_MNT) {
    Logger.log('Skipping below-minimum credit: %s MNT', parsed.amountMnt);
    return;
  }
  const docId = parsed.bankTxId || msg.getId();  // bank tx id is best dedup key
  upsertBankTransaction(docId, {
    source: 'gmail_apps_script',
    amountMnt: parsed.amountMnt,
    direction: parsed.direction,
    description: parsed.description,
    referenceCode: extractRef(parsed.description),
    bankTxId: parsed.bankTxId || null,
    senderName: parsed.senderName || '',
    senderAccount: parsed.senderAccount || '',
    postedAt: parsed.postedAt.toISOString(),
    receivedAt: new Date().toISOString(),
    matchStatus: 'unmatched',
    rawEmailSnippet: body.slice(0, 200),
  });
}

// ----------------------------------------------------------------------------
// Parser — REPLACE this with the actual Khan Bank email format.
// To calibrate: forward a real Khan Bank notification email's body to yourself,
// inspect the structure, then update the regexes below.
// ----------------------------------------------------------------------------
function parseKhanEmail(body, msg) {
  // PLACEHOLDER patterns — these will not match a real email until you've
  // updated them against an actual Khan Bank message.
  const amountRe   = /(?:Amount|Дүн)[:\s]*([\d,]+(?:\.\d+)?)\s*(?:MNT|₮)/i;
  const txIdRe     = /(?:Transaction\s*(?:ID|No\.?)|Гүйлгээний\s*дугаар)[:\s]*(\S+)/i;
  const descRe     = /(?:Description|Утга)[:\s]*(.+?)(?:\n|$)/i;
  const senderRe   = /(?:From|Илгээгч)[:\s]*(.+?)(?:\n|$)/i;
  const dirRe      = /(?:credit|debit|орлого|зарлага)/i;

  const amountMatch = body.match(amountRe);
  if (!amountMatch) return null;

  const amountMnt = parseInt(amountMatch[1].replace(/[,.]/g, ''), 10);
  const direction = (body.match(dirRe)?.[0] ?? 'credit').toLowerCase().match(/credit|орлого/) ? 'credit' : 'debit';

  return {
    amountMnt,
    direction,
    description: body.match(descRe)?.[1]?.trim() ?? '',
    bankTxId:    body.match(txIdRe)?.[1]?.trim() ?? null,
    senderName:  body.match(senderRe)?.[1]?.trim() ?? '',
    senderAccount: '',
    postedAt:    msg.getDate(),
  };
}

function extractRef(description) {
  const m = description?.match(REF_REGEX);
  return m ? m[0].toUpperCase() : null;
}

function htmlToText(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

// ----------------------------------------------------------------------------
// Firestore REST upsert (PATCH = create-or-update by document id)
// ----------------------------------------------------------------------------
function upsertBankTransaction(docId, fields) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}` +
              `/databases/${FIRESTORE_DB_ID}/documents/bank_transactions/${docId}`;

  const response = UrlFetchApp.fetch(url, {
    method: 'patch',
    headers: { Authorization: 'Bearer ' + getAccessToken() },
    contentType: 'application/json',
    payload: JSON.stringify({ fields: toFirestoreFields(fields) }),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() >= 300) {
    throw new Error('Firestore PATCH failed: ' + response.getContentText());
  }
  Logger.log('Wrote tx %s', docId);
}

function toFirestoreFields(obj) {
  const out = {};
  for (const k in obj) {
    const v = obj[k];
    if (v === null || v === undefined) {
      out[k] = { nullValue: null };
    } else if (typeof v === 'string') {
      out[k] = { stringValue: v };
    } else if (typeof v === 'number') {
      out[k] = Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
    } else if (typeof v === 'boolean') {
      out[k] = { booleanValue: v };
    }
  }
  return out;
}

// ----------------------------------------------------------------------------
// Service-account JWT → access token
// ----------------------------------------------------------------------------
function getAccessToken() {
  const cached = CacheService.getScriptCache().get('sa_token');
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: SA_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  const header = { alg: 'RS256', typ: 'JWT' };
  const enc = (o) => Utilities.base64EncodeWebSafe(JSON.stringify(o)).replace(/=+$/, '');
  const signingInput = enc(header) + '.' + enc(claim);
  const signature = Utilities.computeRsaSha256Signature(signingInput, SA_PRIVATE_KEY);
  const jwt = signingInput + '.' + Utilities.base64EncodeWebSafe(signature).replace(/=+$/, '');

  const resp = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    },
  });
  const token = JSON.parse(resp.getContentText()).access_token;
  CacheService.getScriptCache().put('sa_token', token, 3500); // <1h
  return token;
}

// ----------------------------------------------------------------------------
// Manual test — run this from the editor to verify everything wires up
// ----------------------------------------------------------------------------
function testWriteFakeTransaction() {
  upsertBankTransaction('test-' + Date.now(), {
    source: 'gmail_apps_script',
    amountMnt: 12345,
    direction: 'credit',
    description: 'Test from Apps Script GR-TESTAB',
    referenceCode: 'GR-TESTAB',
    bankTxId: null,
    senderName: 'Apps Script Test',
    senderAccount: '',
    postedAt: new Date().toISOString(),
    receivedAt: new Date().toISOString(),
    matchStatus: 'unmatched',
    rawEmailSnippet: '(test)',
  });
}
```

---

## Step 5: Test the Firestore connection

1. In the script editor, choose function **`testWriteFakeTransaction`** from
   the dropdown → click **Run**.
2. Apps Script will prompt for permissions to call external services on first
   run — accept.
3. If successful, the **Logs** show `Wrote tx test-...`.
4. Open the admin Bank History tab in your web app — you should see the test
   transaction appear within seconds.
5. Delete the test transaction from Firestore console.

If you get an auth error: re-check `SA_CLIENT_EMAIL`, `SA_PRIVATE_KEY` (newlines
must be `\n` literally), and that the service account has the **Cloud Datastore
User** role in Google Cloud IAM.

---

## Step 6: Calibrate the Khan Bank parser

The parser regexes in `parseKhanEmail()` are placeholders. To finalize:

1. Send yourself ₮100 from any other account with description `GR-TEST01`.
2. When the Khan Bank notification email arrives in `battsetseg1977@gmail.com`,
   open it, copy the **plain-text body**, and paste it into a comment at the
   top of the script.
3. Update the regexes (`amountRe`, `descRe`, `txIdRe`, etc.) to match the actual
   field labels Khan uses. They likely use Mongolian field names like:
   - `Дүн:` for amount
   - `Гүйлгээний утга:` for description
   - `Илгээгч:` for sender
   - `Гүйлгээний дугаар:` for transaction id
4. Run `pollKhanBankEmails` manually and check that your test email gets parsed
   correctly. If it does, mark the email read so it doesn't re-process.

---

## Step 7: Schedule the trigger

1. In the script editor, click **Triggers** (clock icon, left sidebar) →
   **Add Trigger**.
2. Configure:
   - Function: `pollKhanBankEmails`
   - Event source: **Time-driven**
   - Type: **Minutes timer**
   - Interval: **Every 5 minutes**
   - Failure notification: **Notify me daily** (so you find out if it breaks)
3. Save.

The script will now run every 5 minutes, even when nobody's signed into Gmail.

---

## Step 8: Verify end-to-end

1. Send yourself another ₮100 transfer with description `GR-TEST02`.
2. Within 5 minutes the entry should appear in your admin Bank History tab,
   with `GR-TEST02` highlighted in amber and the source labelled "Email".
3. Place a real test order in the customer flow with payment method
   "Bank Transfer" — note the generated reference code (say `GR-AB12CD`).
4. Send a transfer with that exact code in the description.
5. The bank tx arrives in the admin tab with a yellow "Matched" badge and a
   linked order number.
6. Click **₮ Confirm Order** on that row → the order's `paymentStatus` flips
   to `CONFIRMED`, the customer's screen updates live, the kitchen can now
   click "Start Preparing".

---

## Failure modes & monitoring

| Failure | Symptom | Recovery |
|---|---|---|
| Parser regex stops matching after Khan changes their template | New transactions stop appearing in admin tab | Re-calibrate regexes against a fresh email; emails sit unread in inbox so nothing is lost |
| Gmail goes down / quota exceeded | Apps Script logs errors | Apps Script daily failure email pings you; processing resumes when Gmail is back |
| Service account key compromised | Unauthorized writes possible | Rotate the service account in Firebase console; update Apps Script with new key |
| Apps Script quota (daily UrlFetch limit ≈ 20,000) | New txs stop ingesting after limit | Volume should be << limit (a few per day); if hit, switch to Cloud Function instead |
| Sender address changes / Khan splits notification by transaction type | Some emails miss the search query | Broaden `GMAIL_QUERY` (e.g. `(from:khanbank.com OR from:notify.khanbank.mn) is:unread`) |

**Build a heartbeat:** add a second time-trigger for a function that checks
`bank_transactions` was written to in the last N hours during business time
and emails you if not. (Optional v2.)

---

## Security notes

- `SA_PRIVATE_KEY` lives in plain text inside the Apps Script. Apps Script
  source is only viewable by authenticated owners/editors of the project, but
  treat it like a deployed secret. For tighter security, store the private key
  in **Script Properties** and read it via `PropertiesService` instead of
  embedding inline.
- The service account has **Cloud Datastore User** scope on your whole project.
  Limit it to write only `/bank_transactions/*` if your security rules support
  collection-level IAM (most don't — rules are the right place).
- Don't share the script project with anyone you don't trust with full
  Firestore write access.

---

## What's left

After this is set up, the v0 system is fully automated for Khan Bank-paid
orders: customer pays → email arrives → script ingests → admin sees match →
clicks one button → customer's order is confirmed and the kitchen starts.

The remaining manual step (the "Confirm Order" button click) is intentional
for v0.5 — it's a safety net while we're confident the parser is reliable.
Once you've run this for a couple of weeks with no false positives, we can
drop a `setting.autoConfirmMatchedTransactions = true` flag and skip that
step entirely.
