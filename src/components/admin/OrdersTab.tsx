import React, { useEffect, useState } from 'react';
import { Search, Plus, XCircle, Trash2, Package, ShoppingBag, AlertTriangle, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { Order, OrderStatus } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';
import PaymentBadge from './PaymentBadge';
import { orderMatchesFilter } from './orderUtils';

/**
 * Service-mode Orders tab.
 *
 * Design goals (see dashboard critique):
 *  - Payments needing a human land in a pinned red strip, not buried in a grid.
 *  - Orders group by kitchen status (new → preparing → ready) — the kitchen's
 *    question is "what do I do now", not "was this pickup or kiosk".
 *  - Cards lead with the order number (what the customer answers to), show
 *    elapsed time with aging colors, and offer ONE primary next action.
 */

interface OrdersTabProps {
  orders: Order[];
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  last7Days: string[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  onNewOrder: () => void;
  onMarkPaid: (orderId: string) => void;
  onRefund: (orderId: string) => void;
  refundingId: string | null;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
  onDelete: (orderId: string) => void;
}

const AGE_WARN_MIN = 10;
const AGE_LATE_MIN = 20;

/** "N мин" chip that yellows at 10 min and reddens at 20 — kitchen aging. */
function ElapsedChip({ timestamp }: { timestamp: string }) {
  const { language } = useLanguage();
  const mins = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60_000));
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full tabular-nums',
        mins >= AGE_LATE_MIN
          ? 'bg-red-500/15 text-red-400 border border-red-500/30'
          : mins >= AGE_WARN_MIN
          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
          : 'bg-stone-800 text-stone-400 border border-stone-700',
      )}
    >
      <Clock size={11} />
      {mins} {language === 'en' ? 'min' : 'мин'}
    </span>
  );
}

/** Non-cash orders must be payment-CONFIRMED before the kitchen starts. */
function canStartPreparing(order: Order): boolean {
  const method = (order as any).paymentMethod;
  if (method !== 'bank_transfer' && method !== 'qpay') return true;
  return (order as any).paymentStatus === 'CONFIRMED';
}

export default function OrdersTab({
  orders,
  selectedDate,
  setSelectedDate,
  last7Days,
  searchQuery,
  setSearchQuery,
  onNewOrder,
  onMarkPaid,
  onRefund,
  refundingId,
  onUpdateStatus,
  onDelete,
}: OrdersTabProps) {
  const { t, language } = useLanguage();
  const [showCompleted, setShowCompleted] = useState(false);
  const [, forceTick] = useState(0);

  // Re-render every 30s so the elapsed-time chips age without interaction.
  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  // Needs-attention: real money that couldn't be auto-confirmed. Deliberately
  // ignores the date filter — a mismatch from yesterday still needs a human.
  const reviewOrders = orders.filter(
    (o) => (o as any).paymentStatus === 'MANUAL_REVIEW' && o.status !== 'cancelled',
  );

  const filtered = orders.filter((o) => orderMatchesFilter(o, selectedDate, searchQuery));

  // Day summary for the selected date — computed from orders already in
  // memory, zero extra Firestore reads. "Confirmed revenue" counts cash
  // orders (money changes hands at the counter) plus online orders whose
  // payment the server verified; awaiting/expired/refunded are excluded,
  // as are admin test orders.
  const dayOrders = orders.filter(
    (o) => orderMatchesFilter(o, selectedDate, '') && !(o as any).isTest,
  );
  const confirmedOrders = dayOrders.filter((o) => {
    const method = (o as any).paymentMethod;
    if (method !== 'qpay' && method !== 'bank_transfer') return true;
    return (o as any).paymentStatus === 'CONFIRMED';
  });
  const revenue = confirmedOrders.reduce((sum, o) => sum + Math.round(o.total), 0);
  const avgTicket = confirmedOrders.length > 0 ? Math.round(revenue / confirmedOrders.length) : 0;

  const active: Record<'pending' | 'preparing' | 'ready', Order[]> = {
    pending: filtered.filter((o) => o.status === 'pending'),
    preparing: filtered.filter((o) => o.status === 'preparing'),
    ready: filtered.filter((o) => o.status === 'ready'),
  };
  const completed = filtered.filter((o) => o.status === 'completed');

  const sectionMeta: Record<keyof typeof active, { dot: string; title: string }> = {
    pending: { dot: 'bg-amber-500', title: t('admin.orders.status.pending') },
    preparing: { dot: 'bg-blue-500', title: t('admin.orders.status.preparing') },
    ready: { dot: 'bg-green-500', title: t('admin.orders.status.ready') },
  };

  const renderCard = (order: Order) => {
    const o = order as any;
    return (
      <div key={order.id} className="admin-card flex flex-col gap-3 p-4">
        {/* Identity row: the order number is what the customer answers to. */}
        <div className="flex justify-between items-start gap-2">
          <div className="flex items-baseline gap-2 min-w-0">
            <span className="text-3xl font-bold text-amber-500 tabular-nums leading-none">
              {order.orderNumber ? `#${order.orderNumber}` : order.id.slice(-4)}
            </span>
            <span
              className={cn(
                'text-[11px] uppercase font-semibold tracking-[0.15em] px-2 py-0.5 rounded-md border whitespace-nowrap',
                order.orderType === 'pickup'
                  ? 'bg-stone-800 text-stone-400 border-stone-700'
                  : 'bg-amber-500/10 text-amber-500 border-amber-500/20',
              )}
            >
              {order.orderType === 'pickup' ? t('admin.orders.type.pickup') : t('admin.orders.type.kiosk')}
              {order.orderType === 'kiosk' && order.kioskNumber ? ` #${order.kioskNumber}` : ''}
            </span>
            {o.isTest && (
              <span className="text-[11px] uppercase font-bold tracking-[0.15em] px-2 py-0.5 rounded-md bg-amber-200 text-amber-900 border border-amber-300">
                {t('admin.orders.test_badge')}
              </span>
            )}
          </div>
          {(order.status === 'pending' || order.status === 'preparing') && (
            <ElapsedChip timestamp={order.timestamp} />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PaymentBadge order={order} />
          <span className="text-sm text-stone-400 truncate">
            {order.customerName || '—'}
            {order.phone && order.phone !== 'N/A' ? ` · ${order.phone}` : ''}
          </span>
        </div>

        {/* Bank-transfer reference — what the admin looks for in the bank app. */}
        {o.paymentMethod === 'bank_transfer' && o.referenceCode && o.paymentStatus === 'AWAITING_PAYMENT' && (
          <div className="p-2.5 bg-yellow-500/5 border border-yellow-500/20 rounded-xl flex items-center justify-between gap-2">
            <span className="text-[11px] uppercase tracking-[0.2em] text-yellow-400/70 font-semibold">
              {t('admin.orders.payment.ref')}
            </span>
            <span className="font-mono font-bold text-yellow-300 tracking-widest">{o.referenceCode}</span>
          </div>
        )}

        {order.notes && (
          <p className="text-xs text-stone-400 italic bg-stone-950 border border-stone-800 rounded-xl p-2.5">
            "{order.notes}"
          </p>
        )}

        {/* Items */}
        <div className="space-y-1.5 border-t border-stone-800 pt-3">
          {order.items.map((item, idx) => (
            <div key={idx} className="flex justify-between text-sm gap-2">
              <div className="min-w-0">
                <span className="text-stone-300 font-medium">
                  <span className="font-semibold tabular-nums text-amber-500 mr-1">{item.quantity}×</span>
                  {item.name}
                </span>
                {item.selectedPortion && (
                  <span className="text-xs text-stone-500 ml-2">({item.selectedPortion.name})</span>
                )}
                {item.packaging && (
                  <span className="text-xs text-stone-500 ml-2">
                    +₮<span className="tabular-nums">{(item.packagingPrice ?? 0).toLocaleString()}</span>
                  </span>
                )}
              </div>
              <span className="text-stone-500 font-semibold tabular-nums shrink-0">
                ₮{((Math.round(item.price) + (item.packaging ? item.packagingPrice ?? 0 : 0)) * item.quantity).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center border-t border-stone-800 pt-3">
          <span className="text-lg font-medium tabular-nums">₮{Math.round(order.total).toLocaleString()}</span>
          {o.adminDiscountMnt > 0 && (
            <span className="text-xs text-amber-300 tabular-nums">–₮{o.adminDiscountMnt.toLocaleString()}</span>
          )}
          <span className="text-xs text-stone-500">
            {new Date(order.timestamp).toLocaleTimeString(language === 'en' ? 'en-US' : 'mn-MN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>

        {/* Actions: exactly one primary next step, payment actions secondary,
            destructive ones as quiet icons. */}
        <div className="flex items-center gap-2">
          {order.status === 'pending' && canStartPreparing(order) && (
            <button
              onClick={() => onUpdateStatus(order.id, 'preparing')}
              className="flex-1 py-2.5 bg-blue-500 text-white text-sm font-bold uppercase tracking-[0.12em] rounded-full hover:bg-blue-400 transition-all"
            >
              {t('admin.orders.action.start')}
            </button>
          )}
          {order.status === 'pending' && !canStartPreparing(order) && (
            <span className="flex-1 py-2.5 text-center text-[11px] uppercase tracking-[0.15em] text-stone-500 bg-stone-950 border border-stone-800 rounded-full">
              {t('admin.orders.payment.awaiting')}
            </span>
          )}
          {order.status === 'preparing' && (
            <button
              onClick={() => onUpdateStatus(order.id, 'ready')}
              className="flex-1 py-2.5 bg-green-500 text-white text-sm font-bold uppercase tracking-[0.12em] rounded-full hover:bg-green-400 transition-all"
            >
              {t('admin.orders.action.ready')}
            </button>
          )}
          {order.status === 'ready' && (
            <button
              onClick={() => onUpdateStatus(order.id, 'completed')}
              className="flex-1 py-2.5 bg-stone-100 text-stone-900 text-sm font-bold uppercase tracking-[0.12em] rounded-full hover:bg-white transition-all"
            >
              {t('admin.orders.action.complete')}
            </button>
          )}
          {order.status !== 'completed' && order.status !== 'cancelled' && (
            <button
              onClick={() => onUpdateStatus(order.id, 'cancelled')}
              className="p-2.5 text-stone-500 hover:text-amber-500 transition-colors"
              title={language === 'en' ? 'Cancel order' : 'Захиалга цуцлах'}
            >
              <XCircle size={20} />
            </button>
          )}
          <button
            onClick={() => onDelete(order.id)}
            className="p-2.5 text-stone-500 hover:text-red-500 transition-colors"
            title={language === 'en' ? 'Delete order' : 'Захиалга устгах'}
          >
            <Trash2 size={20} />
          </button>
        </div>

        {/* Payment side-actions, when applicable */}
        {(o.paymentMethod === 'bank_transfer' && o.paymentStatus === 'AWAITING_PAYMENT') && (
          <button
            onClick={() => onMarkPaid(order.id)}
            className="w-full py-2 bg-yellow-500 text-stone-900 text-xs font-bold uppercase tracking-[0.15em] rounded-full hover:bg-yellow-400 transition-all"
            title={t('admin.orders.confirm_paid')}
          >
            ₮ {t('admin.orders.action.mark_paid')}
          </button>
        )}
        {/* Cash is collected at the counter, so a cash order has no
            paymentStatus until a cashier records it. */}
        {(o.paymentMethod === 'cash' && !o.paymentStatus) && (
          <button
            onClick={() => onMarkPaid(order.id)}
            className="w-full py-2 bg-emerald-500 text-stone-900 text-xs font-bold uppercase tracking-[0.15em] rounded-full hover:bg-emerald-400 transition-all"
            title={t('admin.orders.confirm_cash')}
          >
            ₮ {t('admin.orders.action.mark_cash_paid')}
          </button>
        )}
        {/* Who took the money. Absent on QPay orders — those confirm themselves. */}
        {o.paidBy && (
          <p className="text-[10px] text-stone-500 text-center">
            {t('admin.orders.paid_by')}: <span className="text-stone-400">{o.paidBy}</span>
          </p>
        )}
        {(o.paymentMethod === 'qpay' && o.paymentStatus === 'CONFIRMED') && (
          <button
            onClick={() => onRefund(order.id)}
            disabled={refundingId === order.id}
            className={cn(
              'w-full py-2 bg-purple-600/80 text-white text-xs font-bold uppercase tracking-[0.15em] rounded-full hover:bg-purple-500 transition-all',
              refundingId === order.id && 'opacity-50 cursor-not-allowed',
            )}
            title={t('admin.orders.confirm_refund')}
          >
            {refundingId === order.id ? '…' : t('admin.orders.action.refund')}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header: title + search + new order */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold tracking-normal">{t('admin.orders.title')}</h2>
          <p className="mt-1 text-sm text-[var(--white-45)]">{t('admin.orders.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <input
              type="text"
              placeholder={t('admin.orders.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="admin-control w-full rounded-[10px] px-10 py-2 text-sm"
            />
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
          </div>
          <button
            onClick={onNewOrder}
            className="flex min-h-9 shrink-0 items-center gap-2 rounded-full bg-[var(--gold)] px-5 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--stone-950)] transition-colors hover:bg-[var(--gold-hover)]"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">{t('admin.orders.new_order')}</span>
          </button>
        </div>
      </div>

      {/* Needs attention — pinned above everything, ignores the date filter. */}
      {reviewOrders.length > 0 && (
        <div className="space-y-3 rounded-[14px] border border-[var(--admin-danger)] bg-[var(--admin-danger-soft)] p-4">
          <div className="flex items-center gap-2 text-red-400">
            <AlertTriangle size={18} />
            <h3 className="font-bold text-sm uppercase tracking-[0.15em]">
              {t('admin.orders.attention.title')} ({reviewOrders.length})
            </h3>
          </div>
          {reviewOrders.map((order) => {
            const o = order as any;
            return (
              <div key={order.id} className="bg-stone-900 border border-red-500/20 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-bold text-amber-500 tabular-nums">
                      {order.orderNumber ? `#${order.orderNumber}` : order.id.slice(-6)}
                    </span>
                    <span className="text-sm text-stone-400 truncate">
                      {order.customerName || '—'}{order.phone && order.phone !== 'N/A' ? ` · ${order.phone}` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-stone-400">
                    {t('admin.orders.attention.expected')}:{' '}
                    <span className="font-bold text-stone-200 tabular-nums">₮{(o.paymentReviewExpectedMnt ?? Math.round(order.total)).toLocaleString()}</span>
                    {' · '}
                    {t('admin.orders.attention.observed')}:{' '}
                    <span className="font-bold text-red-300 tabular-nums">₮{(o.paymentReviewObservedMnt ?? 0).toLocaleString()}</span>
                    {o.paymentReviewReason ? ` · ${o.paymentReviewReason}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onMarkPaid(order.id)}
                    className="px-4 py-2 bg-yellow-500 text-stone-900 text-xs font-bold uppercase tracking-[0.12em] rounded-full hover:bg-yellow-400 transition-all"
                  >
                    ₮ {t('admin.orders.action.mark_paid')}
                  </button>
                  <button
                    onClick={() => onUpdateStatus(order.id, 'cancelled')}
                    className="p-2 text-stone-500 hover:text-amber-500 transition-colors"
                    title={language === 'en' ? 'Cancel order' : 'Захиалга цуцлах'}
                  >
                    <XCircle size={20} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Date chips */}
      <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
        {last7Days.map((date) => {
          const d = new Date(date);
          const label =
            date === last7Days[0]
              ? t('admin.orders.today')
              : d.toLocaleDateString(language === 'en' ? 'en-US' : 'mn-MN', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                });
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className={cn(
                'px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all',
                selectedDate === date
                  ? 'bg-amber-500 text-stone-900'
                  : 'bg-stone-900 text-stone-400 hover:bg-stone-800 border border-stone-800',
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Day summary: what the owner glances at between rushes. */}
      <div className="grid grid-cols-3 gap-3">
        <div className="admin-card p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-semibold">
            {t('admin.orders.stats.orders')}
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1">{dayOrders.length}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-semibold">
            {t('admin.orders.stats.revenue')}
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-amber-500">₮{revenue.toLocaleString()}</p>
        </div>
        <div className="admin-card p-4">
          <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500 font-semibold">
            {t('admin.orders.stats.avg')}
          </p>
          <p className="text-2xl font-bold tabular-nums mt-1">₮{avgTicket.toLocaleString()}</p>
        </div>
      </div>

      {/* Status sections: the kitchen pipeline, in work order. */}
      {filtered.length === 0 ? (
        <div className="admin-card p-20 text-center">
          <ShoppingBag className="mx-auto text-stone-800 mb-4" size={64} />
          <p className="text-stone-500 italic">{t('admin.orders.empty')}</p>
        </div>
      ) : (
        <>
          {(Object.keys(active) as Array<keyof typeof active>).map((status) => {
            const group = active[status];
            if (group.length === 0) return null;
            return (
              <section key={status} className="space-y-4">
                <h3 className="text-lg font-bold text-stone-300 flex items-center gap-2.5">
                  <span className={cn('w-2.5 h-2.5 rounded-full', sectionMeta[status].dot)} />
                  {sectionMeta[status].title}
                  <span className="text-xs bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full tabular-nums">
                    {group.length}
                  </span>
                </h3>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-start">
                  {group.map(renderCard)}
                </div>
              </section>
            );
          })}

          {completed.length > 0 && (
            <section className="space-y-4">
              <button
                onClick={() => setShowCompleted((v) => !v)}
                className="text-lg font-bold text-stone-500 flex items-center gap-2.5 hover:text-stone-300 transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-stone-600" />
                {t('admin.orders.status.completed')}
                <span className="text-xs bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full tabular-nums">
                  {completed.length}
                </span>
                {showCompleted ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showCompleted && (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 items-start opacity-70">
                  {completed.map(renderCard)}
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
