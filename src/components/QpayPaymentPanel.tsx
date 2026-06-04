import React, { useEffect, useState } from 'react';
import { QrCode, Clock, Copy, CheckCircle, ExternalLink, AlertCircle } from 'lucide-react';
import { functions, httpsCallable } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { QPAY_BANK_DISPLAY_ORDER } from '../lib/qpayConfig';
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

  // Re-render the countdown every 30s.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Fetch the QR + deeplinks on mount unless already cached on the order doc.
  useEffect(() => {
    if (invoice) return;
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

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-stone-200 bg-white p-8 flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-stone-300 border-t-stone-900 rounded-full animate-spin" />
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">
          {language === 'en' ? 'Generating QR…' : 'QR үүсгэж байна…'}
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
            {language === 'en'
              ? 'Scan this QR with any bank app, or tap your bank below to open it directly.'
              : 'Энэ QR-г аль ч банкны аппликейшнаар сканнердах, эсвэл доорх банкаа дарж шууд нээнэ үү.'}
          </p>
        </div>

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

        {/* Bank deeplinks */}
        {sortedBanks.length > 0 && (
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
