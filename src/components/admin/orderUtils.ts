import { Order } from '../../types';

/** yyyy-mm-dd in the restaurant's timezone (Asia/Ulaanbaatar). */
export function getUBDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ulaanbaatar',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Single source of truth for the Orders-tab list filter (date + search text +
 * hides cancelled). Was previously copy-pasted inline in two places, which is
 * exactly how the two lists drift apart.
 */
export function orderMatchesFilter(
  order: Order,
  selectedDate: string,
  query: string,
): boolean {
  if (getUBDateString(new Date(order.timestamp)) !== selectedDate) return false;
  if (order.status === 'cancelled') return false;
  const q = query.toLowerCase();
  return (
    (order.customerName || '').toLowerCase().includes(q) ||
    order.id.toLowerCase().includes(q) ||
    (order.phone || '').toLowerCase().includes(q) ||
    (!!order.orderNumber && order.orderNumber.toString().includes(query)) ||
    (!!order.kioskNumber && order.kioskNumber.toString().includes(query))
  );
}
