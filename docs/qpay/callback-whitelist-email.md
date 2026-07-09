# Email — Callback URL whitelist хүсэлт

**To:** tergel.t@qpay.mn
**Cc:** support@qpay.mn
**Subject:** 1TSEGTS — Callback URL хост whitelist-д нэмэх хүсэлт

---

## How to paste into Gmail

1. Paste the whole block below into Gmail's compose window.
2. Select the three indented lines marked **[MONOSPACE]** below (the hostname line, the URL line, and the two merchant-info lines).
3. In Gmail's formatting toolbar, change the font from "Sans Serif" to **Monospace**.

You can delete the `[MONOSPACE]` markers themselves — they're just guides for you.

---

## Email body (paste this part)

Сайн байна уу, Тэргэл-ээ,

QPay V2 холболтоо хийж эхэлсэн боловч production орчинд invoice үүсгэх үед callback URL-ийг "INVALID" гэж буцааж байна.

Манайх төлбөрийн callback URL-ийг Firebase Cloud Functions (Google Cloud) дээр host хийсэн. Доорх хостыг таны системийн callback URL whitelist-д нэмж өгөхийг хүсэж байна:

[MONOSPACE] asia-east1-ai-studio-applet-webapp-730e3.cloudfunctions.net

Бид callback URL-ийг дараах форматаар бүртгүүлэх болно (query string биш, path сегментээр):

[MONOSPACE] https://asia-east1-ai-studio-applet-webapp-730e3.cloudfunctions.net/qpayWebhook/<token>/<order_id>

Мерчантын мэдээлэл:

[MONOSPACE] Username:     1TSEGTS
[MONOSPACE] Invoice code: 1TSEGTS_INVOICE

Whitelist хийсний дараа баталгаажуулж эргэж хариу өгнө үү. Хэдий хугацаанд хийгдэхийг урьдчилан мэдэгдэх боломжтой бол баярлалаа.

Хүндэтгэсэн,
Болдсайхан
