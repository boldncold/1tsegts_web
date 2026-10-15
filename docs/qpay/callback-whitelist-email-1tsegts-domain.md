# Email — Callback URL хост солих (1tsegts.com) хүсэлт

**To:** tergel.t@qpay.mn
**Cc:** support@qpay.mn
**Subject:** 1TSEGTS — Callback URL хост whitelist-д нэмэх хүсэлт (1tsegts.com)

Why: the payment backend is moving from Firebase to Convex. QPay production
only accepts whitelisted callback hosts, so the new host must be approved
**before** the cutover — otherwise every invoice fails with
`callback_url: INVALID`. We ask for our own domain rather than a Convex
hostname, so a future backend move never needs another whitelist request
(`/api/qpay/callback/*` on 1tsegts.com is proxied to the backend by Vercel).
The old Firebase host must stay whitelisted until late callbacks for invoices
created before the cutover have stopped (about two weeks).

Format the three `[MONOSPACE]` blocks in monospace, as with the first email.
Review the wording before sending.

> **Sent 2026-10-14 as below (asking for `1tsegts.com`).** The site's canonical
> host turned out to be **`www.1tsegts.com`** — `1tsegts.com` 307-redirects every
> path to it — so callbacks go to `https://www.1tsegts.com/api/qpay/callback/...`
> and a follow-up asks QPay to whitelist `www.1tsegts.com` too.

> **QPay's answer (2026-10-15, support@qpay.mn):** they can't add hosts on their
> side; send the new callback in the invoice-create request instead. So there was
> nothing to whitelist, and the "Why" above was an assumption. The real check is
> one production invoice with the `www` callback — `docs/CONVEX_CUTOVER.md`, 0.1.

---

## Email body (paste this part)

Сайн байна уу, Тэргэл-ээ,

Манай төлбөрийн backend-ийг Firebase Cloud Functions-ээс шинэ систем рүү шилжүүлж байгаа тул callback URL-ийн хост өөрчлөгдөх гэж байна. Доорх хостыг callback URL whitelist-д нэмж өгөхийг хүсэж байна:

[MONOSPACE] 1tsegts.com

Шинэ callback URL-ийн формат (query string биш, path сегментээр):

[MONOSPACE] https://1tsegts.com/api/qpay/callback/<token>/<order_id>

Шилжилтийн үед өмнө үүссэн нэхэмжлэхүүдийн callback хуучин хост руу очих тул одоогийн хост (asia-east1-ai-studio-applet-webapp-730e3.cloudfunctions.net) ойролцоогоор хоёр долоо хоног whitelist-д хэвээр байх шаардлагатай.

Мерчантын мэдээлэл:

[MONOSPACE] Username:     1TSEGTS
[MONOSPACE] Invoice code: 1TSEGTS_INVOICE

Whitelist-д нэмсний дараа баталгаажуулж хариу өгнө үү. Хэдий хугацаанд хийгдэхийг урьдчилан мэдэгдэх боломжтой бол баярлалаа.

Хүндэтгэсэн,
Болдсайхан
