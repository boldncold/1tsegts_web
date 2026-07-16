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
      ? 'bg-[var(--admin-ok-soft)] text-[var(--admin-ok)] border-transparent'
      : status === 'REFUNDED'
      ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
      : status === 'MANUAL_REVIEW'
      ? 'bg-[var(--admin-danger-soft)] text-[var(--admin-danger)] border-transparent animate-pulse'
      : status === 'EXPIRED'
      ? 'bg-[var(--white-06)] text-[var(--white-40)] border-transparent'
      : 'bg-[var(--gold-soft-15)] text-[var(--gold)] border-transparent animate-pulse';
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
