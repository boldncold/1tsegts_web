import React, { useEffect, useState } from 'react';
import { QrCode, Clock, Copy, CheckCircle, ExternalLink, AlertCircle, Smartphone, ChevronDown, ChevronUp } from 'lucide-react';
import { functions, httpsCallable } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { QPAY_BANK_DISPLAY_ORDER, buildQpayUniversalLink } from '../lib/qpayConfig';
import { isMobileDevice } from '../lib/device';
import type { QpayBankDeeplink } from '../types';

/**
 * QPay payment panel — shown to the customer after they create a 'qpay' order.
 *
 * On mount, calls the `createQpayInvoice` Cloud Function with the order id.
 * QPay returns a QR image (base64 PNG), a short URL, and a deeplink per bank.
 * The customer either scans the QR with any QPay-supported bank app, or taps
 * a bank button to launch that app directly.
 *
 * The order's paymentStatus flips to CONFIRMED via the qpayWebhook Cloud
 * Function once the customer pays. CartContext's existing onSnapshot picks
 * that up — this component doesn't need to poll.
 */

interface QpayInvoiceResponse {
  invoice_id: string;
  qr_text: string;
  qr_image: string;
  qPay_shortUrl: string;
  qPay_deeplink: QpayBankDeeplink[];
}

export default function QpayPaymentPanel({ order }: { order: any }) {
  const { language } = useLanguage();
  const [invoice, setInvoice] = useState<QpayInvoiceResponse | null>(() =>
    order.qpayInvoiceId
      ? {
          invoice_id: order.qpayInvoiceId,
          qr_text: order.qpayQrText ?? '',
          qr_image: order.qpayQrImage ?? '',
          qPay_shortUrl: order.qpayShortUrl ?? '',
          qPay_deeplink: order.qpayDeeplinks ?? [],
        }
      : null,
  );
  const [loading, setLoading] = useState(!invoice);
  const [error, setError] = useState<string | null>(null);
  const [, forceTick] = useState(0);
  const [copiedShortUrl, setCopiedShortUrl] = useState(false);

  // Device-aware primary action: on a phone the point is to OPEN the bank app
  // (a QR shown on this same phone can't be scanned by it), on desktop the QR
  // is the payment. Mobile users can still opt into the QR via a toggle to pay
  // from a second device.
  const isMobile = React.useMemo(() => isMobileDevice(), []);
  const [showQr, setShowQr] = useState(false);

  // Re-render the countdown every 30s.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch the QR + deeplinks on mount unless already cached on the order doc.
  useEffect(() => {
    if (invoice) return;
    // Don't mint a fresh invoice for an order whose payment window already
    // lapsed — the server-side expiry job is about to flip it EXPIRED anyway.
    if (
      order.paymentExpiresAt &&
      new Date(order.paymentExpiresAt).getTime() <= Date.now()
    ) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const fn = httpsCallable<{ orderId: string }, QpayInvoiceResponse>(
          functions,
          'createQpayInvoice',
        );
        const res = await fn({ orderId: order.id });
        if (!cancelled) setInvoice(res.data);
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load QPay invoice');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.id, invoice]);

  const minutesLeft = order.paymentExpiresAt
    ? Math.max(
        0,
        Math.ceil((new Date(order.paymentExpiresAt).getTime() - Date.now()) / 60_000),
      )
    : null;

  const copyShortUrl = async () => {
    if (!invoice?.qPay_shortUrl) return;
    try {
      await navigator.clipboard.writeText(invoice.qPay_shortUrl);
      setCopiedShortUrl(true);
      toast.success(language === 'en' ? 'Link copied' : 'Холбоос хуулагдлаа');
      setTimeout(() => setCopiedShortUrl(false), 1500);
    } catch {
      toast.error(language === 'en' ? 'Copy failed' : 'Хуулж чадсангүй');
    }
  };

  const sortedBanks = React.useMemo(() => {
    if (!invoice?.qPay_deeplink) return [];
    const order = QPAY_BANK_DISPLAY_ORDER;
    return [...invoice.qPay_deeplink].sort((a, b) => {
      const ai = order.indexOf(a.name);
      const bi = order.indexOf(b.name);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [invoice]);

  // Window lapsed client-side: stop offering the QR/deeplinks so the customer
  // can't pay into an order the server is about to expire. The 30s tick above
  // flips this without a reload; CartContext handles the EXPIRED transition.
  if (minutesLeft === 0) {
    return (
      <div className="rounded-2xl border-2 border-stone-300 bg-stone-50 p-5 space-y-2">
        <div className="flex items-center gap-2 text-stone-700">
          <Clock size={18} />
          <p className="font-bold text-sm uppercase tracking-widest">
            {language === 'en' ? 'Payment window expired' : 'Төлбөрийн хугацаа дууссан'}
          </p>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed">
          {language === 'en'
            ? 'This QR is no longer valid. Please place your order again.'
            : 'Энэ QR хүчингүй болсон. Захиалгаа дахин өгнө үү.'}
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-stone-200 bg-white p-8 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-900 rounded-full animate-spin" />
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">
          {isMobile
            ? (language === 'en' ? 'Preparing payment…' : 'Төлбөр бэлтгэж байна…')
            : (language === 'en' ? 'Generating QR…' : 'QR үүсгэж байна…')}
        </p>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-5 space-y-2">
        <div className="flex items-center gap-2 text-red-700">
          <AlertCircle size={18} />
          <p className="font-bold text-sm uppercase tracking-widest">
            {language === 'en' ? 'QPay unavailable' : 'QPay ажиллахгүй байна'}
          </p>
        </div>
        <p className="text-xs text-red-700/80 leading-relaxed">
          {language === 'en'
            ? 'We could not reach QPay. Please cancel this order and try cash or bank transfer.'
            : 'QPay-тэй холбогдох боломжгүй байна. Захиалгаа цуцалж, бэлэн мөнгө эсвэл данс шилжүүлгээр дахин оролдоно уу.'}
        </p>
        {error && (
          <p className="text-[10px] text-red-700/60 font-mono break-words">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-[#D4AF37] shadow-xl">
      {/* Status banner */}
      <div className="bg-[#D4AF37] px-5 py-3 flex items-center gap-3">
        <QrCode size={22} className="text-stone-900" />
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-900/70">
            {language === 'en' ? 'Awaiting QPay payment' : 'QPay төлбөр хүлээгдэж байна'}
          </p>
          <p className="text-sm font-bold text-stone-900">
            {language === 'en'
              ? `Pay ₮${order.amountMnt?.toLocaleString()} to confirm your order`
              : `Захиалгаа баталгаажуулахын тулд ₮${order.amountMnt?.toLocaleString()} төлнө үү`}
          </p>
        </div>
      </div>

      {/* QR image */}
      <div className="bg-white px-5 py-5 space-y-4">
        {/* Mobile primary action: open the QPay app / bank chooser directly
            via the universal deeplink — pay in-app, no QR involved. */}
        {isMobile && invoice.qr_text && (
          <div className="space-y-1.5">
            <a
              href={buildQpayUniversalLink(invoice.qr_text)}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-[#8B0000] text-white font-bold uppercase tracking-[0.15em] text-sm hover:bg-[#6b0000] transition-all active:scale-95 shadow-lg shadow-red-900/20"
            >
              <Smartphone size={18} />
              {language === 'en' ? 'Pay in QPay app' : 'QPay аппаар төлөх'}
            </a>
            <p className="text-[11px] text-stone-400 text-center">
              {language === 'en'
                ? 'Opens your bank app on this phone'
                : 'Энэ утсан дээрх банкны аппыг нээнэ'}
            </p>
          </div>
        )}

        {/* Bank deeplinks — mobile only; custom URL schemes like khanbank://
            do nothing in a desktop browser. */}
        {isMobile && sortedBanks.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-2">
              {language === 'en' ? 'Or open your bank' : 'Эсвэл банкаа сонгоно уу'}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {sortedBanks.map((bank) => (
                <a
                  key={bank.name}
                  href={bank.link}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl border border-stone-200 hover:border-stone-900 hover:bg-stone-50 transition-all active:scale-95"
                >
                  {bank.logo ? (
                    <img
                      src={bank.logo}
                      alt={bank.name}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-lg object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                      }}
                    />
                  ) : (
                    <ExternalLink size={20} className="text-stone-500" />
                  )}
                  <span className="text-[10px] text-stone-700 font-semibold truncate w-full text-center">
                    {language === 'en' ? bank.name : bank.description || bank.name}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* On mobile the QR is opt-in (pay from a second device); on desktop
            it IS the payment, so it's always visible. Also forced visible if
            QPay returned no qr_text to build the app link from. */}
        {isMobile && invoice.qr_text && (
          <button
            type="button"
            onClick={() => setShowQr((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-stone-500 font-semibold hover:text-stone-900 transition-colors"
          >
            {showQr
              ? (language === 'en' ? 'Hide QR code' : 'QR кодыг нуух')
              : (language === 'en' ? 'Pay with QR instead' : 'QR кодоор төлөх')}
            {showQr ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        )}

        {(!isMobile || showQr || !invoice.qr_text) && (
        <div className="flex flex-col items-center gap-3">
          {invoice.qr_image ? (
            <img
              src={`data:image/png;base64,${invoice.qr_image}`}
              alt="QPay QR"
              className="w-56 h-56 rounded-xl border border-stone-200"
            />
          ) : (
            <div className="w-56 h-56 rounded-xl border border-stone-200 flex items-center justify-center text-stone-400 text-xs">
              {language === 'en' ? 'QR not available' : 'QR байхгүй'}
            </div>
          )}
          <p className="text-xs text-stone-500 text-center leading-snug max-w-xs">
            {isMobile
              ? (language === 'en'
                  ? 'Scan from another device, or screenshot this QR and open it in your bank app.'
                  : 'Өөр төхөөрөмжөөс сканнердах, эсвэл дэлгэцийн зураг дарж банкны аппаараа уншуулна уу.')
              : (language === 'en'
                  ? 'Scan this QR with any bank app on your phone.'
                  : 'Энэ QR-г утасныхаа аль ч банкны аппаар сканнердана уу.')}
          </p>
        </div>
        )}

        {/* Short URL copy */}
        {invoice.qPay_shortUrl && (
          <button
            type="button"
            onClick={copyShortUrl}
            className={cn(
              'w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border transition-all',
              copiedShortUrl
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-stone-50 border-stone-200 text-stone-700 hover:bg-stone-900 hover:text-white hover:border-stone-900',
            )}
          >
            <span className="text-[10px] uppercase tracking-widest font-bold">
              {language === 'en' ? 'Share link' : 'Линк хуваалцах'}
            </span>
            <span className="flex items-center gap-1.5 text-xs font-semibold truncate max-w-[180px]">
              {invoice.qPay_shortUrl}
              {copiedShortUrl ? <CheckCircle size={14} /> : <Copy size={14} />}
            </span>
          </button>
        )}

        {/* Countdown */}
        {minutesLeft !== null && (
          <div className="flex items-center justify-center gap-2 px-3 py-2 bg-stone-100 rounded-full">
            <Clock size={14} className="text-stone-600" />
            <span className="text-xs font-semibold text-stone-700">
              {language === 'en' ? 'Payment window: ' : 'Хугацаа: '}
              <span className="tabular-nums">
                {minutesLeft} {language === 'en' ? 'min left' : 'минут'}
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
