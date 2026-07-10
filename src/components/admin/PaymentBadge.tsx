import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';

/**
 * Payment-status pill for non-cash orders (QPay / bank transfer). Cash orders
 * render nothing so the pay-at-cashier flow stays uncluttered.
 *
 * Order is typed loosely because payment fields are still reaching this
 * component through `(order as any)` casts upstream — tightening that is part
 * of the dashboard refactor, not this badge.
 */
export default function PaymentBadge({ order }: { order: any }) {
  const { t } = useLanguage();
  if (order.paymentMethod !== 'bank_transfer' && order.paymentMethod !== 'qpay') {
    return null;
  }

  const status: string = order.paymentStatus;
  const style =
    status === 'CONFIRMED'
      ? 'bg-green-500/10 text-green-400 border-green-500/30'
      : status === 'REFUNDED'
      ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
      : status === 'MANUAL_REVIEW'
      ? 'bg-red-500/15 text-red-300 border-red-500/40 animate-pulse'
      : status === 'EXPIRED'
      ? 'bg-stone-800 text-stone-500 border-stone-700'
      : 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40 animate-pulse';
  const label =
    status === 'CONFIRMED'
      ? t('admin.orders.payment.confirmed')
      : status === 'REFUNDED'
      ? t('admin.orders.payment.refunded')
      : status === 'MANUAL_REVIEW'
      ? t('admin.orders.payment.review')
      : status === 'EXPIRED'
      ? t('admin.orders.payment.expired')
      : t('admin.orders.payment.awaiting');

  return (
    <span
      className={cn(
        // 11px minimum — 9px uppercase was unreadable on a counter tablet.
        'text-[11px] uppercase font-bold tracking-[0.18em] px-2.5 py-1 rounded-full border whitespace-nowrap',
        style,
      )}
    >
      ₮ {label}
    </span>
  );
}
