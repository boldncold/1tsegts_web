export type Category = 'European' | 'Asian' | 'Drinks' | 'Mongolian' | 'Draft';
export type ItemStatus = 'available' | 'sold_out_today' | 'hidden' | 'daily_special'; // daily_special kept for backward compat

export interface Portion {
  name: string;
  price: number;
  available?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  sideImages?: string[];
  category: Category;
  tags: string[];
  available: boolean; // Legacy, kept for backward compatibility
  status?: ItemStatus;
  statusUntil?: number;
  scheduledDays?: number[];  // 0=Sun, 1=Mon … 6=Sat; recurring weekly schedule
  todayOnly?: boolean;       // visible today only, resets at midnight
  featured?: boolean;
  orderCount?: number;
  packagingPrice?: number;
  portions?: Portion[];
  pool?: 'specials';
}

export interface CartItem extends MenuItem {
  cartItemId: string;
  quantity: number;
  packaging?: boolean;
  selectedPortion?: Portion;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type OrderType = 'pickup' | 'kiosk';

// Payment-method + payment-status are kept SEPARATE from kitchen `status`.
// An order can be paymentStatus=CONFIRMED while status=preparing; the kitchen
// should never start cooking a non-cash order until paymentStatus is CONFIRMED.
// For cash orders the payment fields stay default (paymentStatus stays undefined
// or 'CONFIRMED' if you want to require any explicit ack).
//
// 'qpay' is the primary payment method (one-tap pay via QPay-supported bank
// apps). 'cash' and 'bank_transfer' are kept as side options.
export type PaymentMethod = 'qpay' | 'cash' | 'bank_transfer';
export type PaymentStatus =
  | 'AWAITING_PAYMENT'   // QR shown / ref code shown to customer, waiting for payment
  | 'CONFIRMED'          // QPay webhook confirmed, OR admin verified bank credit
  | 'EXPIRED'            // payment window passed, order auto-cancelled
  | 'MANUAL_REVIEW'      // ambiguous — wrong amount, missing ref, etc.
  | 'REFUNDED';

/** A bank deeplink entry from QPay's `qPay_deeplink` array. */
export interface QpayBankDeeplink {
  name: string;          // "Khan bank"
  description: string;   // "Хаан банк"
  logo: string;          // CDN logo URL
  link: string;          // bank-app-specific deeplink (khanbank://q?qPay_QRcode=...)
}

export interface Order {
  id: string;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
    // Written by CartDrawer at checkout; older orders may lack them.
    packaging?: boolean;        // customer chose takeaway packaging
    packagingPrice?: number;    // ₮ per unit when packed to go
    selectedPortion?: Portion;  // portion variant, when the item has portions
  }[];
  total: number;
  customerName?: string;
  phone?: string;
  orderType: OrderType;
  kioskNumber?: string;
  orderNumber?: string;
  notes?: string;
  status: OrderStatus;
  timestamp: string;

  // Payment fields — all optional so the existing cash flow keeps working unchanged.
  paymentMethod?: PaymentMethod;
  paymentStatus?: PaymentStatus;
  referenceCode?: string;        // e.g. "GR-K7P3M9", appears in bank memo
  amountMnt?: number;            // mirror of `total` rounded to integer MNT
  paymentExpiresAt?: string;     // ISO timestamp; client expires after this
  matchedTxId?: string;          // id of the matched bank_transactions doc
  paidAt?: string;               // ISO timestamp set when payment confirmed
  // Mirrors PaidSource in functions/src/markOrderPaid.ts — the server is the only
  // writer. Historical docs may still carry 'email_parse' / 'auto_email_match'
  // from the removed Gmail path; nothing reads this field, it is audit data.
  paidVia?: 'qpay' | 'admin_manual' | 'monpay';

  // QPay-specific fields (set when createQpayInvoice cloud function returns)
  qpayInvoiceId?: string;        // QPay invoice uuid — passed to /payment/check
  qpayPaymentId?: string;        // QPay payment id, set by webhook on PAID
  qpayPaymentType?: string;      // 'P2P' | 'CARD' — captured at confirm; refunds are CARD-only
  qpayPaymentWallet?: string;    // bank/app the customer paid from
  qpayQrText?: string;           // EMV-MPM QR payload string
  qpayQrImage?: string;          // base64 PNG
  qpayShortUrl?: string;         // https://s.qpay.mn/... — short link, opens QPay
  qpayDeeplinks?: QpayBankDeeplink[];

  // Refund fields (set by the refundQpayPayment cloud function)
  refundedAt?: string;           // ISO timestamp when the refund succeeded
  refundedVia?: 'qpay';
  refundNote?: string;

  // Manual-review fields (set by qpayWebhook when real money can't be auto-confirmed)
  paymentReviewReason?: string;        // e.g. 'qpay_amount_mismatch'
  paymentReviewExpectedMnt?: number;   // what we billed
  paymentReviewObservedMnt?: number;   // what QPay reported as paid
  flaggedForReviewAt?: string;         // ISO timestamp

  // Admin test-mode fields
  isTest?: boolean;              // placed by an admin while signed in, bypassing customer gates
  adminDiscountMnt?: number;     // ₮ subtracted from cart subtotal before charging
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
}

/**
 * Bank credit notifications, entered by an admin in the Bank History tab.
 *
 * Gmail ingestion (a Khan Bank email → Apps Script pipeline) was an experiment
 * and has been removed; every transaction is now typed by a human, which is why
 * nothing auto-confirms — an admin verifies the transfer and clicks Confirm.
 */
export type BankTxSource = 'manual';
export type BankTxDirection = 'credit' | 'debit';
export type BankTxMatchStatus =
  | 'unmatched'         // no order ref code in description
  | 'matched'           // ref code matches an AWAITING_PAYMENT order with same amount
  | 'amount_mismatch'   // ref code matches an order but amount differs
  | 'unknown_ref'       // looks like a ref code but no order has it
  | 'reconciled';       // tx has been linked to an order that's now CONFIRMED

export interface BankTransaction {
  id: string;
  source: BankTxSource;
  amountMnt: number;            // integer MNT
  direction: BankTxDirection;   // we mostly care about 'credit'
  description: string;          // memo text, as typed from the bank statement
  referenceCode?: string;       // extracted GR-XXXXXX if found in description
  bankTxId?: string;            // bank's own transaction reference number
  senderName?: string;
  senderAccount?: string;
  postedAt: string;             // ISO timestamp of the transfer
  receivedAt: string;           // ISO timestamp when the entry was created
  // The order this currently matches — written by the server matcher, so it is
  // NOT proof of payment on its own. Pair it with matchStatus === 'reconciled'.
  matchedOrderId?: string;
  matchStatus: BankTxMatchStatus;
}

export interface StoreSettings {
  openHour: number;
  closeHour: number;
  closedDays: number[];      // 0=Sun … 6=Sat
  closedUntil: string | null;       // YYYY-MM-DD — store closed through this date
  noClosedDayUntil: string | null;  // YYYY-MM-DD — closed-day rule suspended through this date
}
