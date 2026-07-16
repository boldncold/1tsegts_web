import { AlertTriangle, Banknote, Clock, Flame, ShoppingBag } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { cn } from '../../lib/utils';
import { BankTransaction, BankTxMatchStatus, MenuItem, Order, OrderStatus } from '../../types';
import PaymentBadge from './PaymentBadge';
import { getUBDateString } from './orderUtils';

type OverviewDestination = 'menu' | 'orders' | 'bank_history';

interface OverviewTabProps {
  orders: Order[];
  menuItems: MenuItem[];
  bankTransactions: BankTransaction[];
  storeOpen: boolean;
  getBankMatchStatus: (transaction: BankTransaction) => { status: BankTxMatchStatus; orderId?: string };
  onNavigate: (destination: OverviewDestination) => void;
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
}

function formatMoney(value: number): string {
  return `₮${Math.round(value).toLocaleString()}`;
}

function canStartPreparing(order: Order): boolean {
  if (order.paymentMethod !== 'qpay' && order.paymentMethod !== 'bank_transfer') return true;
  return order.paymentStatus === 'CONFIRMED';
}

function StatCard({ label, value, detail, tone }: {
  label: string;
  value: string | number;
  detail?: string;
  tone?: 'gold' | 'danger';
}) {
  return (
    <article className="admin-card min-w-0 p-4 lg:p-5">
      <p className="micro-label !text-[var(--white-40)] !tracking-[0.22em]">{label}</p>
      <p className={cn(
        'mt-2 font-serif text-[30px] font-semibold leading-none tabular-nums',
        tone === 'gold' && 'text-[var(--gold)]',
        tone === 'danger' && 'text-[var(--admin-danger)]',
      )}>
        {value}
      </p>
      {detail && <p className="mt-2 truncate text-[11px] text-[var(--white-40)]">{detail}</p>}
    </article>
  );
}

function StatusPill({ children, tone = 'muted' }: {
  children: ReactNode;
  tone?: 'gold' | 'ok' | 'danger' | 'muted';
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em]',
      tone === 'gold' && 'bg-[var(--gold-soft-15)] text-[var(--gold)]',
      tone === 'ok' && 'bg-[var(--admin-ok-soft)] text-[var(--admin-ok)]',
      tone === 'danger' && 'bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]',
      tone === 'muted' && 'bg-[var(--white-06)] text-[var(--white-45)]',
    )}>
      <span className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

export default function OverviewTab({
  orders,
  menuItems,
  bankTransactions,
  storeOpen,
  getBankMatchStatus,
  onNavigate,
  onUpdateStatus,
}: OverviewTabProps) {
  const { language, t } = useLanguage();
  const today = getUBDateString(new Date());
  const todayOrders = orders.filter((order) => getUBDateString(new Date(order.timestamp)) === today && !order.isTest);
  const confirmedOrders = todayOrders.filter((order) => {
    if (order.status === 'cancelled') return false;
    if (order.paymentMethod !== 'qpay' && order.paymentMethod !== 'bank_transfer') return true;
    return order.paymentStatus === 'CONFIRMED';
  });
  const revenue = confirmedOrders.reduce((sum, order) => sum + Math.round(order.total), 0);
  const liveOrders = orders.filter((order) => ['pending', 'preparing', 'ready'].includes(order.status));
  const awaitingPayment = orders.filter((order) =>
    order.status !== 'cancelled' &&
    (order.paymentMethod === 'qpay' || order.paymentMethod === 'bank_transfer') &&
    order.paymentStatus === 'AWAITING_PAYMENT',
  );
  const soldOut = menuItems.filter((item) => item.status === 'sold_out_today');
  const bankAttention = bankTransactions.filter((transaction) => {
    const status = getBankMatchStatus(transaction).status;
    return status === 'matched' || status === 'unknown_ref' || status === 'amount_mismatch';
  });
  const dateLabel = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'mn-MN', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Ulaanbaatar',
  }).format(new Date());

  const statusLabel: Record<'pending' | 'preparing' | 'ready', string> = {
    pending: t('admin.orders.status.pending'),
    preparing: t('admin.orders.status.preparing'),
    ready: t('admin.orders.status.ready'),
  };
  const actionLabel: Record<'pending' | 'preparing' | 'ready', string> = {
    pending: t('admin.orders.action.start'),
    preparing: t('admin.orders.action.ready'),
    ready: t('admin.orders.action.complete'),
  };
  const nextStatus: Record<'pending' | 'preparing' | 'ready', OrderStatus> = {
    pending: 'preparing',
    preparing: 'ready',
    ready: 'completed',
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-normal text-white lg:text-[32px]">
            {language === 'en' ? 'Overview' : 'Тойм'}
          </h1>
          <p className="mt-1 text-sm capitalize text-[var(--white-45)]">{dateLabel}</p>
        </div>
        <StatusPill tone={storeOpen ? 'ok' : 'danger'}>
          {storeOpen
            ? (language === 'en' ? 'Accepting orders' : 'Захиалга авч байна')
            : (language === 'en' ? 'Closed' : 'Хаалттай')}
        </StatusPill>
      </header>

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4 xl:gap-4" aria-label={language === 'en' ? 'Today summary' : 'Өнөөдрийн тойм'}>
        <StatCard
          label={language === 'en' ? "Today's revenue" : 'Өнөөдрийн орлого'}
          value={formatMoney(revenue)}
          detail={`${confirmedOrders.length} ${language === 'en' ? 'confirmed orders' : 'баталгаажсан захиалга'}`}
          tone="gold"
        />
        <StatCard
          label={language === 'en' ? 'Live queue' : 'Идэвхтэй захиалга'}
          value={liveOrders.length}
          detail={`${liveOrders.filter((order) => order.status === 'pending').length} ${language === 'en' ? 'new' : 'шинэ'}`}
        />
        <StatCard
          label={language === 'en' ? 'Awaiting payment' : 'Төлбөр хүлээгдэж буй'}
          value={awaitingPayment.length}
          tone={awaitingPayment.length ? 'danger' : undefined}
        />
        <StatCard
          label={language === 'en' ? 'Sold out dishes' : 'Дууссан хоол'}
          value={soldOut.length}
          detail={soldOut.map((item) => item.name).join(', ') || undefined}
          tone={soldOut.length ? 'danger' : undefined}
        />
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(300px,2fr)]">
        <section className="admin-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <p className="micro-label !text-[var(--gold)] !tracking-[0.22em]">
              {language === 'en' ? 'Live queue' : 'Идэвхтэй захиалга'}
            </p>
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="rounded-full bg-[var(--white-06)] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--white-50)] transition-colors hover:text-[var(--gold)]"
            >
              {t('admin.nav.orders')} →
            </button>
          </div>

          {liveOrders.length === 0 ? (
            <div className="border-t border-[var(--white-06)] px-4 py-8 text-center text-sm text-[var(--white-40)]">
              <ShoppingBag className="mx-auto mb-2" size={20} />
              {language === 'en' ? 'All quiet for now.' : 'Одоогоор идэвхтэй захиалга алга.'}
            </div>
          ) : liveOrders.map((order) => {
            const activeStatus = order.status as 'pending' | 'preparing' | 'ready';
            const canAdvance = activeStatus !== 'pending' || canStartPreparing(order);
            return (
              <div key={order.id} className="flex flex-wrap items-center gap-3 border-t border-[var(--white-06)] px-4 py-3">
                <span className="w-14 shrink-0 font-serif text-lg font-semibold text-[var(--gold)] tabular-nums">
                  {order.orderNumber ? `#${order.orderNumber}` : `#${order.id.slice(-4)}`}
                </span>
                <div className="min-w-[150px] flex-1">
                  <p className="truncate text-[13px] font-semibold text-white">
                    {order.items.map((item) => `${item.quantity}× ${item.name}`).join(' · ')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--white-40)]">
                    {order.orderType === 'kiosk' ? `Kiosk ${order.kioskNumber || ''}` : t('admin.orders.type.pickup')}
                    {' · '}{formatMoney(order.total)}
                  </p>
                </div>
                <PaymentBadge order={order} />
                <StatusPill tone={activeStatus === 'ready' ? 'ok' : activeStatus === 'preparing' ? 'gold' : 'muted'}>
                  {statusLabel[activeStatus]}
                </StatusPill>
                <button
                  type="button"
                  disabled={!canAdvance}
                  onClick={() => onUpdateStatus(order.id, nextStatus[activeStatus])}
                  className={cn(
                    'min-h-8 rounded-full border px-3 text-[10px] font-bold uppercase tracking-[0.12em] transition-colors',
                    canAdvance
                      ? 'border-[var(--gold-soft-40)] text-[var(--gold)] hover:border-[var(--gold)] hover:bg-[var(--gold-soft-10)]'
                      : 'cursor-not-allowed border-[var(--white-06)] text-[var(--white-40)]',
                  )}
                >
                  {canAdvance ? actionLabel[activeStatus] : t('admin.orders.payment.awaiting')}
                </button>
              </div>
            );
          })}
        </section>

        <section className="admin-card overflow-hidden">
          <div className="px-4 py-3">
            <p className="micro-label !text-[var(--gold)] !tracking-[0.22em]">
              {language === 'en' ? 'Needs attention' : 'Анхаарах'}
            </p>
          </div>

          {bankAttention.length === 0 && awaitingPayment.length === 0 && soldOut.length === 0 ? (
            <p className="border-t border-[var(--white-06)] px-4 py-8 text-center text-sm text-[var(--white-40)]">
              {language === 'en' ? 'All quiet for now.' : 'Одоогоор анхаарах зүйл алга.'}
            </p>
          ) : (
            <div>
              {bankAttention.map((transaction) => {
                const match = getBankMatchStatus(transaction);
                const isMatched = match.status === 'matched';
                return (
                  <button
                    type="button"
                    key={transaction.id}
                    onClick={() => onNavigate('bank_history')}
                    className="flex w-full items-center gap-3 border-t border-[var(--white-06)] px-4 py-3 text-left transition-colors hover:bg-[var(--white-04)]"
                  >
                    {isMatched
                      ? <Banknote className="shrink-0 text-[var(--gold)]" size={16} />
                      : <AlertTriangle className="shrink-0 text-[var(--admin-danger)]" size={16} />}
                    <span className="flex-1 text-[12px] leading-relaxed text-[var(--white-72)]">
                      {isMatched
                        ? `${formatMoney(transaction.amountMnt)} ${language === 'en' ? 'transfer is ready to confirm.' : 'гүйлгээ баталгаажуулахад бэлэн.'}`
                        : `${formatMoney(transaction.amountMnt)} ${language === 'en' ? 'transfer needs review.' : 'гүйлгээг шалгах шаардлагатай.'}`}
                    </span>
                  </button>
                );
              })}
              {awaitingPayment.slice(0, 4).map((order) => (
                <button
                  type="button"
                  key={order.id}
                  onClick={() => onNavigate('orders')}
                  className="flex w-full items-center gap-3 border-t border-[var(--white-06)] px-4 py-3 text-left transition-colors hover:bg-[var(--white-04)]"
                >
                  <Clock className="shrink-0 text-[var(--gold)]" size={16} />
                  <span className="flex-1 text-[12px] leading-relaxed text-[var(--white-72)]">
                    #{order.orderNumber || order.id.slice(-4)} · {formatMoney(order.total)} · {t('admin.orders.payment.awaiting')}
                  </span>
                </button>
              ))}
              {soldOut.slice(0, 4).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onNavigate('menu')}
                  className="flex w-full items-center gap-3 border-t border-[var(--white-06)] px-4 py-3 text-left transition-colors hover:bg-[var(--white-04)]"
                >
                  <Flame className="shrink-0 text-[var(--admin-danger)]" size={16} />
                  <span className="flex-1 text-[12px] leading-relaxed text-[var(--white-72)]">
                    {item.name} · {language === 'en' ? 'sold out today' : 'өнөөдөр дууссан'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
