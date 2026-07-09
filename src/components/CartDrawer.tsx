import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight, CheckCircle, Copy, Banknote, Building2, Clock, QrCode, ChevronDown, ChevronUp } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useStoreSettings } from '../context/StoreSettingsContext';
import { useAuth } from '../context/AuthContext';
import { db, collection, addDoc, updateDoc, doc, increment, deleteDoc, functions, httpsCallable } from '../firebase';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import ConfirmModal from './ConfirmModal';
import { generateReferenceCode } from '../lib/referenceCode';
import { BANK_DETAILS, PAYMENT_WINDOW_MINUTES } from '../lib/bankConfig';
import { QPAY_ENABLED, QPAY_PAYMENT_WINDOW_MINUTES } from '../lib/qpayConfig';
import { isMobileDevice } from '../lib/device';
import QpayPaymentPanel from './QpayPaymentPanel';
import type { PaymentMethod } from '../types';

/**
 * Bank-transfer payment instructions panel.
 *
 * Shown when the customer's pending order is paymentMethod=bank_transfer and
 * paymentStatus=AWAITING_PAYMENT. The customer reads off the account number,
 * makes the transfer in their banking app with the reference code in the
 * description, then waits — the admin will mark the order paid in the admin
 * dashboard, which flips paymentStatus to CONFIRMED, which the existing
 * onSnapshot listener in CartContext picks up and surfaces as a toast.
 */
function BankPaymentPanel({ order }: { order: any }) {
  const { language } = useLanguage();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [, forceTick] = useState(0);

  // Re-render every 30s so the countdown updates.
  React.useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const copy = async (value: string, field: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      toast.success(language === 'en' ? 'Copied!' : 'Хуулагдлаа');
      setTimeout(() => setCopiedField(null), 1500);
    } catch {
      // clipboard can fail on http or older browsers — fall back to selection
      toast.error(language === 'en' ? 'Copy failed — long-press to copy' : 'Хуулж чадсангүй');
    }
  };

  const minutesLeft = order.paymentExpiresAt
    ? Math.max(
        0,
        Math.ceil((new Date(order.paymentExpiresAt).getTime() - Date.now()) / 60_000)
      )
    : null;

  const Row = ({ label, value, field, mono = false }: {
    label: string; value: string; field: string; mono?: boolean;
  }) => (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-stone-200 last:border-b-0">
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-0.5">{label}</p>
        <p className={cn(
          "text-stone-900 font-semibold truncate",
          mono ? "tabular-nums text-base" : "text-sm"
        )}>{value}</p>
      </div>
      <button
        type="button"
        onClick={() => copy(value, field)}
        className={cn(
          "px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-full border transition-all flex items-center gap-1.5 shrink-0",
          copiedField === field
            ? "bg-green-50 text-green-700 border-green-200"
            : "bg-stone-50 text-stone-600 border-stone-200 hover:bg-stone-900 hover:text-white hover:border-stone-900"
        )}
      >
        {copiedField === field ? <CheckCircle size={12} /> : <Copy size={12} />}
        {language === 'en'
          ? (copiedField === field ? 'Copied' : 'Copy')
          : (copiedField === field ? 'Хуулсан' : 'Хуулах')}
      </button>
    </div>
  );

  return (
    <div className="rounded-2xl overflow-hidden border-2 border-amber-400 shadow-xl">
      {/* Status banner */}
      <div className="bg-amber-400 px-5 py-3 flex items-center gap-3">
        <Banknote size={22} className="text-stone-900" />
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-900/70">
            {language === 'en' ? 'Awaiting Payment' : 'Төлбөр хүлээгдэж байна'}
          </p>
          <p className="text-sm font-bold text-stone-900">
            {language === 'en'
              ? `Transfer ₮${order.amountMnt?.toLocaleString()} to confirm your order`
              : `Захиалгаа баталгаажуулахын тулд ₮${order.amountMnt?.toLocaleString()} шилжүүлнэ үү`}
          </p>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-white px-5 py-4 space-y-3">
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <Building2 size={16} className="text-amber-700 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-900 leading-snug">
            {language === 'en'
              ? 'Open your Khan Bank app, transfer the exact amount below, and put the reference code in the description.'
              : 'Хаан банкны аппликейшнаа нээж, доорх дансанд яг тэгдэг дүнг шилжүүлээд, гүйлгээний утгад жишиг кодыг бичнэ үү.'}
          </p>
        </div>

        <div className="bg-stone-50 border border-stone-200 rounded-xl px-4 py-1">
          <Row
            label={language === 'en' ? 'Bank' : 'Банк'}
            value={BANK_DETAILS.bankName[language]}
            field="bank"
          />
          <Row
            label={language === 'en' ? 'Account Number' : 'Дансны дугаар'}
            value={BANK_DETAILS.accountNumber}
            field="account"
            mono
          />
          <Row
            label={language === 'en' ? 'Account Holder' : 'Дансны эзэн'}
            value={BANK_DETAILS.accountHolder}
            field="holder"
          />
          <Row
            label={language === 'en' ? 'Amount (MNT)' : 'Шилжүүлэх дүн (₮)'}
            value={order.amountMnt?.toLocaleString() ?? ''}
            field="amount"
            mono
          />
          <Row
            label={language === 'en' ? 'Reference Code' : 'Гүйлгээний утга'}
            value={order.referenceCode ?? ''}
            field="ref"
            mono
          />
        </div>

        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
          <span className="text-xs text-red-700 leading-snug">
            <strong>
              {language === 'en' ? 'Important: ' : 'Анхаар: '}
            </strong>
            {language === 'en'
              ? `Without the reference code "${order.referenceCode}" in the description, we cannot match your transfer.`
              : `Гүйлгээний утгад "${order.referenceCode}" гэж бичээгүй бол шилжүүлгийг тань таних боломжгүй.`}
          </span>
        </div>

        {minutesLeft !== null && (
          <div className="flex items-center justify-center gap-2 px-3 py-2 bg-stone-100 rounded-full">
            <Clock size={14} className="text-stone-600" />
            <span className="text-xs font-semibold text-stone-700">
              {language === 'en' ? 'Payment window: ' : 'Хугацаа: '}
              <span className="tabular-nums">{minutesLeft} {language === 'en' ? 'min left' : 'минут'}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function CartDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { cart, total, removeFromCart, updateQuantity, updatePackaging, clearCart, pendingOrderId, pendingOrderData, setPendingOrderId, pendingOrderExpired } = useCart();
  const { t, language } = useLanguage();
  const { storeOpen } = useStoreSettings();
  const { isAdmin } = useAuth();
  // Admins testing the customer flow bypass all the gates (store hours,
  // cancellation block, pending-order lock) and get a custom-discount input.
  const effectiveStoreOpen = storeOpen || isAdmin;
  const [adminDiscount, setAdminDiscount] = useState(0);
  const clampedDiscount = Math.max(0, Math.min(adminDiscount, Math.floor(total)));
  const chargedTotal = Math.max(0, total - clampedDiscount);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);
  const [orderNumber, setOrderNumber] = useState<string | null>(null);
  const [completedOrderType, setCompletedOrderType] = useState<'pickup' | 'kiosk'>('pickup');
  const [isBlocked, setIsBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    notes: '',
    orderType: 'pickup' as 'pickup' | 'kiosk',
    kioskNumber: '',
    // QPay is the primary payment method. Falls back to cash if the QPAY_ENABLED
    // feature flag is off (e.g. during a soft-rollback).
    paymentMethod: (QPAY_ENABLED ? 'qpay' : 'cash') as PaymentMethod
  });
  const [showOtherPaymentMethods, setShowOtherPaymentMethods] = useState(false);

  // Online (QPay / bank-transfer) order whose payment has been verified
  // server-side — drives the "already paid" copy instead of pay-at-cashier.
  const paidOnline =
    !!pendingOrderData &&
    (pendingOrderData.paymentMethod === 'qpay' ||
      pendingOrderData.paymentMethod === 'bank_transfer') &&
    pendingOrderData.paymentStatus === 'CONFIRMED';

  // Pre-warm the QPay invoice function while the customer fills the checkout
  // form: absorbs the Cloud Function cold start and any QPay token re-auth,
  // so the real call at "Confirm order" only pays for the invoice itself.
  // Best-effort and fire-once — a failed warmup just means a cold start.
  const qpayWarmupFired = React.useRef(false);
  React.useEffect(() => {
    if (!isCheckingOut || !QPAY_ENABLED || qpayWarmupFired.current) return;
    qpayWarmupFired.current = true;
    httpsCallable(functions, 'createQpayInvoice')({ warmup: true }).catch(() => {});
  }, [isCheckingOut]);

  // Online order whose money hasn't landed yet. The completion screen must NOT
  // claim "Order received" here — nothing is confirmed until the webhook flips
  // paymentStatus. Show a "waiting for payment" state instead.
  const awaitingOnlinePayment =
    !!pendingOrderData &&
    (pendingOrderData.paymentMethod === 'qpay' ||
      pendingOrderData.paymentMethod === 'bank_transfer') &&
    pendingOrderData.paymentStatus === 'AWAITING_PAYMENT';

  // Sticky version of paidOnline: pendingOrderData clears once the kitchen
  // advances the order, but the completion screen can still be on screen — it
  // must not fall back to "pay at the cashier" copy for an order already paid.
  const [completedWasPaid, setCompletedWasPaid] = useState(false);
  React.useEffect(() => {
    if (paidOnline) setCompletedWasPaid(true);
  }, [paidOnline]);
  const showPaidCopy = paidOnline || completedWasPaid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    if (!storeOpen && !isAdmin) {
      toast.error(t('cart.closed'));
      return;
    }

    if (!isAdmin) {
      // Security Checks — skipped for admins testing the flow.
      const blockUntil = localStorage.getItem('grand_block_until');
      if (blockUntil && new Date(blockUntil) > new Date()) {
        const timeLeft = Math.ceil((new Date(blockUntil).getTime() - new Date().getTime()) / 60000);
        toast.error(language === 'en'
          ? `You are temporarily blocked from ordering for ${timeLeft} more minutes due to multiple cancellations.`
          : `Та олон удаа захиалга цуцалсан тул ${timeLeft} минутын турш захиалга өгөх боломжгүй байна.`);
        return;
      }

      if (pendingOrderId) {
        toast.error(language === 'en'
          ? "You already have a pending order. Please wait for it to be processed."
          : "Танд хүлээгдэж буй захиалга байна. Түр хүлээнэ үү.");
        return;
      }
    }

    setIsSubmitting(true);
    setCompletedWasPaid(false);
    try {
      const generatedOrderNumber = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      
      const order: any = {
        items: cart.map(item => {
          const mappedItem: any = {
            id: item.id,
            name: item.name,
            price: item.selectedPortion ? item.selectedPortion.price : item.price,
            quantity: item.quantity,
            packagingPrice: item.packagingPrice !== undefined ? item.packagingPrice : 0
          };
          if (item.packaging !== undefined) mappedItem.packaging = item.packaging;
          if (item.selectedPortion !== undefined) mappedItem.selectedPortion = item.selectedPortion;
          return mappedItem;
        }),
        total: chargedTotal,
        customerName: formData.name || (formData.orderType === 'pickup' ? 'Pickup Customer' : 'Kiosk Customer'),
        phone: formData.phone || 'N/A',
        orderType: formData.orderType,
        orderNumber: generatedOrderNumber,
        status: 'pending',
        timestamp: new Date().toISOString(),
        paymentMethod: formData.paymentMethod,
      };

      if (isAdmin) {
        order.isTest = true;
        if (clampedDiscount > 0) order.adminDiscountMnt = clampedDiscount;
      }

      if (formData.orderType === 'kiosk') {
        order.kioskNumber = formData.kioskNumber;
      }

      if (formData.notes) {
        order.notes = formData.notes;
      }

      // Admin test mode with a full discount (chargedTotal === 0) skips the
      // payment-provider round trip — QPay/bank-transfer would reject a
      // zero-amount invoice anyway.
      const skipPayment = isAdmin && chargedTotal === 0;

      if (skipPayment) {
        order.paymentStatus = 'CONFIRMED';
        order.paidVia = 'admin_manual';
        order.amountMnt = 0;
        order.paidAt = new Date().toISOString();
      } else if (formData.paymentMethod === 'bank_transfer') {
        // Bank-transfer-specific fields. For cash orders these stay absent so
        // the existing "go to cashier" flow runs unchanged.
        order.paymentStatus = 'AWAITING_PAYMENT';
        order.referenceCode = generateReferenceCode();
        order.amountMnt = Math.round(chargedTotal);
        order.paymentExpiresAt = new Date(
          Date.now() + PAYMENT_WINDOW_MINUTES * 60_000
        ).toISOString();
      } else if (formData.paymentMethod === 'qpay') {
        // QPay flow: order is created in AWAITING_PAYMENT, the createQpayInvoice
        // cloud function (called by QpayPaymentPanel on mount) fills in
        // qpayInvoiceId / qpayQrText / etc.
        order.paymentStatus = 'AWAITING_PAYMENT';
        order.amountMnt = Math.round(chargedTotal);
        order.paymentExpiresAt = new Date(
          Date.now() + QPAY_PAYMENT_WINDOW_MINUTES * 60_000
        ).toISOString();
      }

      const docRef = await addDoc(collection(db, 'orders'), order);
      
      // Set pending order in context
      setPendingOrderId(docRef.id);

      // Increment orderCount for each item
      for (const item of cart) {
        try {
          await updateDoc(doc(db, 'menu', item.id), {
            orderCount: increment(item.quantity)
          });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `menu/${item.id}`);
        }
      }

      setOrderNumber(generatedOrderNumber);
      setCompletedOrderType(formData.orderType);
      setOrderComplete(true);
      clearCart();
      setAdminDiscount(0);
      // Non-cash orders aren't "placed successfully" until payment verifies —
      // only cash / zero-charge orders get the success toast here.
      const isOnlinePayment =
        !skipPayment &&
        (formData.paymentMethod === 'qpay' ||
          formData.paymentMethod === 'bank_transfer');
      if (isOnlinePayment) {
        toast.info(language === 'en'
          ? 'Order created — complete payment to confirm'
          : 'Захиалга үүслээ — баталгаажуулахын тулд төлбөрөө төлнө үү');
      } else {
        toast.success(t('cart.success'));
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Check block status on mount and periodically
  React.useEffect(() => {
    const checkBlock = () => {
      const blockUntil = localStorage.getItem('grand_block_until');
      if (blockUntil) {
        if (new Date(blockUntil) > new Date()) {
          setIsBlocked(true);
          const timeLeft = Math.ceil((new Date(blockUntil).getTime() - new Date().getTime()) / 60000);
          setBlockReason(language === 'en' 
            ? `Blocked for ${timeLeft} more mins` 
            : `${timeLeft} минут блоктой`);
        } else {
          setIsBlocked(false);
          setBlockReason(null);
          localStorage.removeItem('grand_block_until');
        }
      }
    };

    checkBlock();
    const interval = setInterval(checkBlock, 30000);
    return () => clearInterval(interval);
  }, [language]);

  const drawerContent = (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Static backdrop for performance - avoiding heavy blur animations */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
          />

          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
            className="fixed top-0 right-0 bottom-0 z-[70] w-full max-w-md bg-[var(--stone-950)] shadow-2xl flex flex-col border-l border-[rgba(212,175,55,0.15)]"
          >
            {/* Header */}
            <div className="p-6 border-b border-white/[0.06] flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <ShoppingBag className="text-[#D4AF37]" size={24} />
                <h2 className="text-xl font-medium text-white">{t('cart.title')}</h2>
              </div>
              <button onClick={onClose} className="p-2 text-white/45 hover:text-[#D4AF37] transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* QPay order awaiting payment: show QR + bank deeplinks. */}
              {pendingOrderId && pendingOrderData && !orderComplete &&
                pendingOrderData.paymentMethod === 'qpay' &&
                pendingOrderData.paymentStatus === 'AWAITING_PAYMENT' && (
                <div className="mb-6">
                  <QpayPaymentPanel order={{ ...pendingOrderData, id: pendingOrderId }} />
                </div>
              )}

              {/* Bank-transfer order awaiting payment: show bank instructions
                  instead of the "go to cashier" panel. */}
              {pendingOrderId && pendingOrderData && !orderComplete &&
                pendingOrderData.paymentMethod === 'bank_transfer' &&
                pendingOrderData.paymentStatus === 'AWAITING_PAYMENT' && (
                <div className="mb-6">
                  <BankPaymentPanel order={pendingOrderData} />
                </div>
              )}

              {/* Cancel while awaiting payment — without this, an unpaid order
                  reopened from the cart could only be abandoned by waiting out
                  the payment window. */}
              {pendingOrderId && pendingOrderData && !orderComplete &&
                (pendingOrderData.paymentMethod === 'qpay' ||
                 pendingOrderData.paymentMethod === 'bank_transfer') &&
                pendingOrderData.paymentStatus === 'AWAITING_PAYMENT' && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full mb-6 py-3 bg-red-500/10 border border-red-500/50 text-red-500 font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-red-500 hover:text-white transition-all text-xs"
                >
                  {language === 'en' ? 'Cancel Order' : 'Захиалга цуцлах'}
                </button>
              )}

              {/* Active-order panel: shown for cash orders and for non-cash orders
                  (QPay, bank-transfer) whose payment has already been confirmed. */}
              {pendingOrderId && pendingOrderData && !orderComplete &&
                ((pendingOrderData.paymentMethod !== 'bank_transfer' &&
                  pendingOrderData.paymentMethod !== 'qpay') ||
                 pendingOrderData.paymentStatus === 'CONFIRMED') && (
                <div className="mb-6 rounded-2xl overflow-hidden border border-[#D4AF37]/30 shadow-lg">
                  {/* Header bar */}
                  <div className="bg-stone-900 px-5 py-4 flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#D4AF37] mb-1">
                        {language === 'en' ? 'Active Order' : 'Идэвхтэй захиалга'}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-3xl font-bold text-white tabular-nums">#{pendingOrderData.orderNumber}</span>
                        <span className={cn(
                          "px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-widest animate-pulse",
                          pendingOrderData.status === 'pending' ? "bg-[#D4AF37] text-stone-900" : "bg-green-500 text-white"
                        )}>
                          {pendingOrderData.status === 'pending'
                            ? (language === 'en' ? 'Preparing' : 'Бэлтгэж байна')
                            : (language === 'en' ? 'Ready!' : 'Бэлэн!')}
                        </span>
                        {paidOnline && (
                          <span className="px-2.5 py-1 text-[10px] font-bold rounded-full uppercase tracking-widest bg-green-500/15 text-green-400 border border-green-500/30 whitespace-nowrap">
                            ₮ {language === 'en' ? 'Paid' : 'Төлөгдсөн'}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Self-serve cancel deletes the order doc — fine while no
                        money has moved, but a paid order must be cancelled by
                        the restaurant (refund needed), so hide it once paid. */}
                    {!paidOnline && (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="p-2 text-stone-400 hover:text-red-400 transition-colors rounded-full hover:bg-stone-800"
                        title={language === 'en' ? "Cancel Order" : "Захиалга цуцлах"}
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>

                  {/* Items + total + hint */}
                  <div className="bg-[var(--espresso)] px-5 py-4 space-y-3">
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                      {pendingOrderData.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs text-white/50">
                          <span className="flex-1 mr-2">{item.quantity}× {item.name}{item.selectedPortion?.name && <span className="text-[#D4AF37]/70"> ({item.selectedPortion.name})</span>}</span>
                          <span className="tabular-nums text-white/70 font-medium">₮{((item.price * item.quantity) + (item.packagingPrice || 0) * item.quantity).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-white/[0.06] flex justify-between items-center">
                      <span className="text-xs font-semibold text-white/45 uppercase tracking-widest">{t('cart.total')}</span>
                      <span className="text-xl font-bold text-[#D4AF37] tabular-nums">₮{Math.round(pendingOrderData.total).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-bold text-[#D4AF37] text-center pt-1 tracking-wide">
                      {paidOnline
                        ? (language === 'en'
                            ? 'Paid — show your order number when collecting your food'
                            : 'Төлбөр төлөгдсөн — хоолоо авахдаа захиалгын дугаараа харуулна уу')
                        : (language === 'en'
                            ? 'Go to the cashier and show your order number'
                            : 'Кассанд очиж захиалгын дугаараа харуулна уу')}
                    </p>
                  </div>
                </div>
              )}

              {orderComplete && pendingOrderExpired && !pendingOrderData ? (
                /* Payment window ran out before the customer paid — the order
                   never reached the kitchen. Replace the stale success screen
                   with an explicit expired state + a way to restart. */
                <div className="flex flex-col items-center text-center space-y-5 py-4">
                  <div className="w-20 h-20 bg-red-500/10 border-2 border-red-500/30 rounded-full flex items-center justify-center">
                    <Clock size={44} className="text-red-400" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-serif font-bold text-2xl text-white">
                      {language === 'en' ? 'Payment window expired' : 'Төлбөрийн хугацаа дууслаа'}
                    </h3>
                    <p className="text-white/45 text-sm leading-relaxed">
                      {language === 'en'
                        ? "We didn't receive your payment in time, so this order was not sent to the kitchen. Please place it again."
                        : 'Төлбөр хугацаандаа хийгдээгүй тул захиалга гал тогоонд илгээгдээгүй. Дахин захиалга өгнө үү.'}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setOrderComplete(false);
                      setIsCheckingOut(false);
                    }}
                    className="w-full py-3 bg-[#D4AF37] text-[#080606] font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-[#C5A028] transition-all"
                  >
                    {language === 'en' ? 'Order again' : 'Дахин захиалах'}
                  </button>
                </div>
              ) : orderComplete ? (
                <div className="flex flex-col items-center text-center space-y-5 py-4">
                  {/* Status icon — amber "waiting" until payment is verified,
                      green check only once the money is in (or for cash). */}
                  {awaitingOnlinePayment ? (
                    <div className="w-20 h-20 bg-amber-500/10 border-2 border-amber-500/30 rounded-full flex items-center justify-center">
                      <Clock size={44} className="text-amber-400 animate-pulse" />
                    </div>
                  ) : (
                    <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center">
                      <CheckCircle size={44} className="text-green-500" />
                    </div>
                  )}

                  <div className="space-y-1">
                    <h3 className="font-serif font-bold text-2xl text-white">
                      {awaitingOnlinePayment
                        ? (language === 'en' ? 'Waiting for payment' : 'Төлбөр хүлээгдэж байна')
                        : t('cart.order_received')}
                    </h3>
                    <p className="text-white/45 text-sm">
                      {pendingOrderData?.paymentMethod === 'qpay' &&
                       pendingOrderData?.paymentStatus === 'AWAITING_PAYMENT'
                        ? (isMobileDevice()
                            ? (language === 'en'
                                ? 'Tap below to pay in your bank app'
                                : 'Доорх товчийг дарж банкны аппаараа төлнө үү')
                            : (language === 'en'
                                ? 'Scan the QR below to pay with any bank app'
                                : 'Доорх QR-г аль ч банкны аппаар сканнэж төлнө үү'))
                        : pendingOrderData?.paymentMethod === 'bank_transfer' &&
                          pendingOrderData?.paymentStatus === 'AWAITING_PAYMENT'
                          ? (language === 'en'
                              ? 'Complete the bank transfer below to confirm'
                              : 'Захиалгаа баталгаажуулахын тулд доорх дансаар шилжүүлнэ үү')
                          : showPaidCopy
                            ? (language === 'en'
                                ? 'Payment received — your order is being prepared'
                                : 'Төлбөр баталгаажлаа — захиалга бэлтгэгдэж байна')
                            : (language === 'en'
                                ? 'Your order is being prepared'
                                : 'Таны захиалга бэлтгэгдэж байна')}
                    </p>
                  </div>

                  {/* QPay panel — shown when this is a QPay order awaiting payment. */}
                  {pendingOrderData?.paymentMethod === 'qpay' &&
                   pendingOrderData?.paymentStatus === 'AWAITING_PAYMENT' && (
                    <div className="w-full">
                      <QpayPaymentPanel order={{ ...pendingOrderData, id: pendingOrderId }} />
                    </div>
                  )}

                  {/* Bank-transfer instructions panel — only when awaiting payment.
                      Replaces the "go to cashier" steps below. */}
                  {pendingOrderData?.paymentMethod === 'bank_transfer' &&
                   pendingOrderData?.paymentStatus === 'AWAITING_PAYMENT' && (
                    <div className="w-full">
                      <BankPaymentPanel order={pendingOrderData} />
                    </div>
                  )}

                  {/* Step-by-step instructions — only for cash orders or post-payment.
                      Hidden while QPay/bank-transfer are awaiting payment. */}
                  {!((pendingOrderData?.paymentMethod === 'bank_transfer' ||
                      pendingOrderData?.paymentMethod === 'qpay') &&
                     pendingOrderData?.paymentStatus === 'AWAITING_PAYMENT') &&
                   (completedOrderType === 'pickup' ? (
                    <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-5 text-left space-y-4">
                      <h4 className="text-base font-bold text-amber-900 text-center">
                        {language === 'en' ? 'What to do next' : 'Дараагийн алхмууд'}
                      </h4>
                      <div className="space-y-3">
                        {(showPaidCopy
                          ? (language === 'en'
                              ? ['Wait while we prepare your order', 'Show your order number at the counter', 'Collect your food — already paid']
                              : ['Захиалга бэлтгэгдэхийг түр хүлээнэ үү', 'Кассанд захиалгын дугаараа харуулна уу', 'Хоолоо аваарай — төлбөр төлөгдсөн'])
                          : (language === 'en'
                              ? ['Go to the cashier', 'Show your order number above', 'Pay and collect your food']
                              : ['Кассанд очно уу', 'Захиалгын дугаараа харуулна уу', 'Төлж, хоолоо авна уу'])
                        ).map((step, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-amber-200 text-amber-900 font-bold text-sm flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <p className="text-sm font-semibold text-amber-900 leading-snug">{step}</p>
                          </div>
                        ))}
                      </div>
                      <div className="pt-3 border-t border-amber-200 text-center space-y-1">
                        <p className="text-xs text-amber-600">{language === 'en' ? 'Or call us at' : 'Эсвэл утасдана уу'}</p>
                        <a href="tel:99138866" className="text-xl font-bold text-[#D4AF37] hover:underline">99138866</a>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full bg-blue-50 border border-blue-200 rounded-2xl p-5 text-left space-y-4">
                      <h4 className="text-base font-bold text-blue-900 text-center">
                        {language === 'en' ? 'What to do next' : 'Дараагийн алхмууд'}
                      </h4>
                      <div className="space-y-3">
                        {(showPaidCopy
                          ? (language === 'en'
                              ? ['Payment received — the kitchen is on it', 'Stay at your kiosk', 'Collect your food when ready']
                              : ['Төлбөр баталгаажлаа — гал тогоо бэлтгэж байна', 'Киоскдээ хүлээнэ үү', 'Бэлэн болмогц хоолоо авна уу'])
                          : (language === 'en'
                              ? ['Scan the QR code at your kiosk to pay', 'Or call us to confirm & pay', 'Collect your food when ready']
                              : ['Киоскны QR кодыг сканнэж төлнө үү', 'Эсвэл утасдаж баталгаажуулаарай', 'Бэлэн болмогц хоолоо авна уу'])
                        ).map((step, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-blue-200 text-blue-900 font-bold text-sm flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <p className="text-sm font-semibold text-blue-900 leading-snug">{step}</p>
                          </div>
                        ))}
                      </div>
                      <div className="pt-3 border-t border-blue-200 text-center space-y-1">
                        <p className="text-xs text-blue-600">{language === 'en' ? 'Call us at' : 'Утасны дугаар'}</p>
                        <a href="tel:99138866" className="text-xl font-bold text-[#D4AF37] hover:underline">99138866</a>
                      </div>
                    </div>
                  ))}

                  {/* Order number — large & prominent */}
                  {orderNumber && (
                    <div className="w-full bg-stone-900 rounded-2xl p-6 text-center">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-stone-400 mb-2">{t('cart.order_number')}</p>
                      <p className="font-serif font-bold leading-none tabular-nums" style={{ fontSize: '96px' }}>
                        <span className="text-[#D4AF37]">{orderNumber[0]}</span>
                        <span className="text-white">{orderNumber.slice(1)}</span>
                      </p>
                      {pendingOrderData && (
                        <>
                          <div className="mt-4 pt-3 border-t border-stone-700 space-y-1.5 max-h-28 overflow-y-auto pr-1 custom-scrollbar text-left">
                            {pendingOrderData.items?.map((item: any, idx: number) => (
                              <div key={idx} className="flex justify-between text-xs text-stone-400">
                                <span className="flex-1 mr-2">{item.quantity}× {item.name}{item.selectedPortion?.name && <span className="text-[#D4AF37]/60"> ({item.selectedPortion.name})</span>}</span>
                                <span className="tabular-nums text-stone-300">₮{((item.price * item.quantity) + (item.packagingPrice || 0) * item.quantity).toLocaleString()}</span>
                              </div>
                            ))}
                          </div>
                          <div className="mt-3 pt-3 border-t border-stone-700 flex justify-between items-center">
                            <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest">{t('cart.total')}</span>
                            <span className="text-2xl font-bold text-[#D4AF37] tabular-nums">₮{Math.round(pendingOrderData.total).toLocaleString()}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  {/* Estimated time */}
                  <div className="flex items-center gap-2 px-5 py-2.5 bg-[#D4AF37]/10 border border-[#D4AF37]/25 rounded-full">
                    <span className="text-sm font-bold text-[#D4AF37]">
                      {language === 'en' ? '⏱ Est. 15–20 mins' : '⏱ Хүлээлт: 15–20 минут'}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col w-full gap-3 pb-2">
                    <button
                      onClick={() => {
                        setOrderComplete(false);
                        setIsCheckingOut(false);
                        onClose();
                      }}
                      className="w-full py-3 bg-[#D4AF37] text-[#080606] font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-[#C5A028] transition-all"
                    >
                      {t('cart.back_to_menu')}
                    </button>

                    {pendingOrderId && !paidOnline && (
                      <button
                        onClick={() => setShowCancelConfirm(true)}
                        className="w-full py-3 bg-red-500/10 border border-red-500/50 text-red-500 font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-red-500 hover:text-white transition-all text-xs"
                      >
                        {language === 'en' ? 'Cancel Order' : 'Захиалга цуцлах'}
                      </button>
                    )}
                  </div>
                </div>
              ) : (cart.length === 0 && !pendingOrderId) ? (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                  <ShoppingBag className="text-[#D4AF37]/40" size={64} />
                  <p className="text-white/45 font-light italic">{t('cart.empty')}</p>
                  <button
                    onClick={onClose}
                    className="text-[#D4AF37] font-semibold uppercase tracking-[0.15em] text-xs hover:underline"
                  >
                    {t('cart.start_adding')}
                  </button>
                </div>
              ) : isCheckingOut ? (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-white">{t('cart.checkout_details')}</h3>
                    
                    {/* Order Type Toggle */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">{t('cart.order_option')}</label>
                      <div className="flex p-1 bg-white/[0.04] border border-white/15 rounded-full">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, orderType: 'pickup' })}
                          className={cn(
                            "flex-1 py-2 text-[10px] uppercase tracking-[0.2em] font-semibold rounded-full transition-all",
                            formData.orderType === 'pickup' ? "bg-[#D4AF37] text-[#080606]" : "text-white/50"
                          )}
                        >
                          {t('cart.pickup')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, orderType: 'kiosk' })}
                          className={cn(
                            "flex-1 py-2 text-[10px] uppercase tracking-[0.2em] font-semibold rounded-full transition-all",
                            formData.orderType === 'kiosk' ? "bg-[#D4AF37] text-[#080606]" : "text-white/50"
                          )}
                        >
                          {t('cart.at_mall')}
                        </button>
                      </div>
                    </div>



                    {formData.orderType === 'kiosk' && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">{t('cart.phone')}</label>
                          <input
                            required
                            type="text"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full bg-white/[0.04] border border-white/15 rounded-full px-5 py-3 text-white placeholder:text-white/35 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                            placeholder="+976 ..."
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">{t('cart.kiosk_number')}</label>
                          <input
                            required
                            type="text"
                            value={formData.kioskNumber}
                            onChange={(e) => setFormData({ ...formData, kioskNumber: e.target.value })}
                            className="w-full bg-white/[0.04] border border-white/15 rounded-full px-5 py-3 text-white placeholder:text-white/35 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                            placeholder="e.g., Kiosk #12"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">{t('cart.special_notes')}</label>
                          <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full bg-white/[0.04] border border-white/15 rounded-2xl px-5 py-3 text-white placeholder:text-white/35 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all h-24 resize-none"
                            placeholder={language === 'en' ? "e.g., No onions, extra spicy..." : "Жишээ нь: Сонгиногүй, халуун ногоотой..."}
                          />
                        </div>
                      </div>
                    )}
                    {isAdmin && (
                      <div className="space-y-2">
                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[10px] uppercase tracking-[0.2em] text-amber-800 font-semibold text-center">
                          {t('cart.admin.test_mode_hint')}
                        </div>
                        <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">
                          {t('cart.admin.discount_label')}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={Math.floor(total)}
                          step={100}
                          value={adminDiscount}
                          onChange={(e) => setAdminDiscount(Math.max(0, parseInt(e.target.value || '0', 10) || 0))}
                          className="w-full bg-white/[0.04] border border-amber-300/50 rounded-full px-5 py-3 text-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all tabular-nums"
                          placeholder="0"
                        />
                        {chargedTotal === 0 && clampedDiscount > 0 && (
                          <p className="text-[11px] text-amber-700 italic px-1">
                            {t('cart.admin.zero_charge_hint')}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Payment method picker — QPay is primary, cash + bank
                        transfer collapse into an "other methods" section. */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] text-white/40 font-semibold">
                        {t('cart.payment_method')}
                      </label>

                      {/* Primary: QPay (only shown when the feature flag is on) */}
                      {QPAY_ENABLED && (
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, paymentMethod: 'qpay' })}
                          className={cn(
                            "w-full p-4 rounded-2xl border-2 text-left transition-all flex items-center gap-3 relative",
                            formData.paymentMethod === 'qpay'
                              ? "bg-[#D4AF37] text-[#080606] border-[#D4AF37] shadow-[var(--shadow-btn-gold)]"
                              : "bg-white/[0.04] text-white border-[#D4AF37]/40 hover:border-[#D4AF37]"
                          )}
                        >
                          <span className={cn(
                            "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                            formData.paymentMethod === 'qpay' ? "bg-[#080606]/15" : "bg-[#D4AF37]/15"
                          )}>
                            <QrCode size={22} className={formData.paymentMethod === 'qpay' ? 'text-[#080606]' : 'text-[#D4AF37]'} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-base">{t('cart.payment.qpay')}</p>
                              <span className={cn(
                                "text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full",
                                formData.paymentMethod === 'qpay'
                                  ? "bg-[#080606]/15 text-[#080606]"
                                  : "bg-[#D4AF37] text-stone-900"
                              )}>
                                {language === 'en' ? 'Recommended' : 'Санал болгож буй'}
                              </span>
                            </div>
                            <p className={cn(
                              "text-xs mt-0.5",
                              formData.paymentMethod === 'qpay' ? "text-[#080606]/70" : "text-white/45"
                            )}>
                              {language === 'en'
                                ? 'One-tap pay from any bank app'
                                : 'Аль ч банкны аппаас нэг товшилтоор'}
                            </p>
                          </div>
                          {formData.paymentMethod === 'qpay' && <CheckCircle size={18} className="text-[#080606] shrink-0" />}
                        </button>
                      )}

                      {/* Collapsible — other payment methods */}
                      <button
                        type="button"
                        onClick={() => setShowOtherPaymentMethods((v) => !v)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-white/45 font-semibold hover:text-[#D4AF37] transition-colors"
                      >
                        <span>
                          {language === 'en' ? 'Other payment methods' : 'Бусад төлбөрийн арга'}
                        </span>
                        {showOtherPaymentMethods ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>

                      {showOtherPaymentMethods && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, paymentMethod: 'cash' })}
                            className={cn(
                              "py-3 px-3 rounded-2xl border-2 text-xs font-semibold uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2",
                              formData.paymentMethod === 'cash'
                                ? "bg-[#D4AF37] text-[#080606] border-[#D4AF37]"
                                : "bg-white/[0.04] text-white/50 border-white/15 hover:border-[#D4AF37]"
                            )}
                          >
                            <Banknote size={16} />
                            {t('cart.payment.cash')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, paymentMethod: 'bank_transfer' })}
                            className={cn(
                              "py-3 px-3 rounded-2xl border-2 text-xs font-semibold uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2",
                              formData.paymentMethod === 'bank_transfer'
                                ? "bg-[#D4AF37] text-[#080606] border-[#D4AF37]"
                                : "bg-white/[0.04] text-white/50 border-white/15 hover:border-[#D4AF37]"
                            )}
                          >
                            <Building2 size={16} />
                            {t('cart.payment.bank')}
                          </button>
                        </div>
                      )}
                      {formData.paymentMethod === 'bank_transfer' && (
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl mt-2">
                          <p className="text-xs text-amber-800 leading-relaxed">
                            {language === 'en'
                              ? `After confirming, you'll get bank details + a reference code. Transfer the exact amount to ${BANK_DETAILS.bankName.en} with the reference in the description. We confirm your order once we see the transfer.`
                              : `Захиалгаа баталгаажуулсны дараа дансны мэдээлэл болон жишиг кодыг харуулна. ${BANK_DETAILS.bankName.mn}-ны данс руу яг тэгдэг дүнг гүйлгээний утганд жишиг кодтойгоо хамт шилжүүлнэ үү. Гүйлгээг харсны дараа баталгаажуулна.`}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCheckingOut(false)}
                    className="w-full py-3 text-white/45 font-semibold uppercase tracking-[0.15em] text-xs hover:text-[#D4AF37] transition-colors"
                  >
                    {t('cart.back_to_cart')}
                  </button>
                </form>
              ) : (
                <div className="space-y-6">
                  {cart.map((item) => (
                    <div key={item.cartItemId} className="flex space-x-4 group">
                      <div className="w-24 h-24 md:w-20 md:h-20 rounded-2xl overflow-hidden flex-shrink-0 border border-white/[0.06] shadow-sm bg-[var(--dish-fallback-bg)]">
                        {item.image && (
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover transition-transform group-hover:scale-110"
                            referrerPolicy="no-referrer"
                          />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-white font-medium text-sm">{item.name}</h4>
                            {item.selectedPortion && (
                              <p className="text-xs text-[#D4AF37] font-semibold tracking-wide">{item.selectedPortion.name}</p>
                            )}
                          </div>
                          <button
                            onClick={() => removeFromCart(item.cartItemId)}
                            className="p-1.5 text-white/40 hover:text-red-500 transition-colors bg-white/[0.04] rounded-full"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <p className="text-xs text-white/45 font-light line-clamp-1">{item.category}</p>

                        <div className="pt-2 mt-2 border-t border-white/[0.06]">
                          <button
                            onClick={() => updatePackaging(item.cartItemId, !item.packaging)}
                            className={cn(
                              "flex items-center justify-between w-full px-3 py-2 rounded-xl border transition-all active:scale-[0.98]",
                              item.packaging
                                ? "bg-[#D4AF37]/10 border-[#D4AF37]/50"
                                : "bg-white/[0.04] border-white/15 hover:border-white/30"
                            )}
                          >
                            <div className="flex items-center space-x-2">
                              {item.packaging ? (
                                <CheckCircle size={16} className="text-[#D4AF37]" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-white/20" />
                              )}
                              <span className={cn(
                                "text-xs font-medium",
                                item.packaging ? "text-[#D4AF37]" : "text-white/50"
                              )}>
                                {t('cart.packaging')}
                              </span>
                            </div>
                            <span className={cn(
                              "text-xs font-semibold tabular-nums",
                              item.packaging ? "text-[#D4AF37]" : "text-white/40"
                            )}>
                              +₮{(item.packagingPrice !== undefined ? item.packagingPrice : 0).toLocaleString()}
                            </span>
                          </button>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                          <div className="flex items-center space-x-3 bg-[var(--espresso)] rounded-full px-2 py-1 border border-white/15">
                            <button
                              onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                              className="p-1 text-white/50 hover:text-[#D4AF37] transition-colors"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="text-sm font-semibold text-white min-w-[20px] text-center tabular-nums">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                              className="p-1 text-white/50 hover:text-[#D4AF37] transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-[#D4AF37]">₮{(Math.round(item.selectedPortion ? item.selectedPortion.price * item.quantity : item.price * item.quantity) + (item.packaging ? (item.packagingPrice !== undefined ? item.packagingPrice : 0) * item.quantity : 0)).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {!orderComplete && cart.length > 0 && (
              <div className="p-6 border-t border-white/[0.06] bg-[var(--espresso)] space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-white/45 uppercase tracking-[0.2em] text-xs font-semibold">{t('cart.subtotal')}</span>
                  <span className={cn(
                    "tabular-nums",
                    isAdmin && clampedDiscount > 0
                      ? "text-base font-medium text-white/45 line-through"
                      : "text-2xl font-medium text-white"
                  )}>₮{Math.round(total).toLocaleString()}</span>
                </div>
                {isAdmin && clampedDiscount > 0 && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-amber-700 uppercase tracking-[0.2em] text-xs font-semibold">
                        {t('cart.admin.discount_label')}
                      </span>
                      <span className="tabular-nums text-amber-700 font-semibold">
                        –₮{clampedDiscount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-white uppercase tracking-[0.2em] text-xs font-bold">
                        {language === 'en' ? 'Charged' : 'Төлбөр'}
                      </span>
                      <span className="text-2xl font-bold tabular-nums text-[#D4AF37]">
                        ₮{Math.round(chargedTotal).toLocaleString()}
                      </span>
                    </div>
                  </>
                )}
                {isBlocked && !isAdmin && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                    <p className="text-xs text-red-600 font-semibold uppercase tracking-widest">{blockReason}</p>
                  </div>
                )}
                {pendingOrderId && !isAdmin && (
                  <div className="p-4 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-xl text-center space-y-2">
                    <p className="text-xs text-[#D4AF37] font-semibold uppercase tracking-widest">
                      {language === 'en' ? 'Pending order must finish first' : 'Захиалга дуусахыг хүлээнэ үү'}
                    </p>
                    <p className="text-[10px] text-white/45 font-light italic">
                      {language === 'en' ? 'You can cancel your current order above to place a new one.' : 'Та шинээр захиалга өгөхийн тулд дээрх захиалгыг цуцалж болно.'}
                    </p>
                  </div>
                )}
                {isCheckingOut ? (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !effectiveStoreOpen || (!isAdmin && (isBlocked || !!pendingOrderId)) || (formData.orderType === 'kiosk' && (!formData.kioskNumber || !formData.phone))}
                    className={cn(
                      "w-full py-4 bg-[#D4AF37] text-[#080606] font-semibold uppercase tracking-[0.15em] rounded-full flex items-center justify-center space-x-2 transition-all active:scale-95 hover:bg-[#C5A028]",
                      (isSubmitting || !effectiveStoreOpen || (!isAdmin && (isBlocked || !!pendingOrderId)) || (formData.orderType === 'kiosk' && (!formData.kioskNumber || !formData.phone))) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <span>{!effectiveStoreOpen ? t('cart.closed') : t('cart.confirm_order')}</span>
                        {effectiveStoreOpen && <ArrowRight size={18} />}
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCheckingOut(true)}
                    disabled={!effectiveStoreOpen || (!isAdmin && !!pendingOrderId)}
                    className={cn(
                      "w-full py-4 bg-[#D4AF37] text-[#080606] font-semibold uppercase tracking-[0.15em] rounded-full flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-[var(--shadow-btn-gold)]",
                      (!effectiveStoreOpen || (!isAdmin && !!pendingOrderId)) ? "opacity-50 cursor-not-allowed" : "hover:bg-[#C5A028]"
                    )}
                  >
                    <span>{!effectiveStoreOpen ? t('cart.closed') : t('cart.proceed')}</span>
                    {effectiveStoreOpen && <ArrowRight size={18} />}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {createPortal(drawerContent, document.body)}

      <ConfirmModal
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={async () => {
          if (pendingOrderId) {
            // Hard guard (the buttons are already hidden): never delete an
            // online-paid order client-side — the payment record would vanish
            // with no refund. Those cancellations go through the restaurant.
            if (paidOnline) {
              toast.error(language === 'en'
                ? 'This order is already paid — call us at 99138866 to cancel and refund.'
                : 'Төлбөр төлөгдсөн захиалгыг цуцлахын тулд 99138866 дугаарт залгана уу.');
              return;
            }
            try {
              const strikes = parseInt(localStorage.getItem('grand_strikes') || '0') + 1;
              localStorage.setItem('grand_strikes', strikes.toString());
              
              if (strikes >= 2) {
                const blockUntil = new Date();
                blockUntil.setHours(blockUntil.getHours() + 1);
                localStorage.setItem('grand_block_until', blockUntil.toISOString());
                localStorage.setItem('grand_strikes', '0');
                toast.error(language === 'en' 
                  ? "Your order was cancelled. Due to multiple cancellations, you are blocked for 1 hour."
                  : "Таны захиалга цуцлагдлаа. Олон удаа цуцалсан тул та 1 цагийн турш захиалга өгөх боломжгүй боллоо.");
              } else {
                toast.warning(language === 'en'
                  ? "Your order was cancelled. Please note that multiple cancellations will result in a temporary block."
                  : "Таны захиалга цуцлагдлаа. Дахин цуцалбал захиалга өгөх эрх түр хаагдахыг анхаарна уу.");
              }

              await deleteDoc(doc(db, 'orders', pendingOrderId));
              setOrderComplete(false);
              setIsCheckingOut(false);
            } catch (error) {
              handleFirestoreError(error, OperationType.DELETE, `orders/${pendingOrderId}`);
            }
          }
        }}
        title={language === 'en' ? "Cancel Order" : "Захиалга цуцлах"}
        message={language === 'en' ? "Are you sure you want to cancel your order? This action cannot be undone." : "Та захиалгаа цуцлахдаа итгэлтэй байна уу? Энэ үйлдлийг буцаах боломжгүй."}
        confirmText={language === 'en' ? "Yes, Cancel" : "Тийм, цуцлах"}
        cancelText={language === 'en' ? "No, Keep it" : "Үгүй"}
      />
    </>
  );
}
