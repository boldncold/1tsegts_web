import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShoppingBag, Plus, Minus, Trash2, ArrowRight, CheckCircle } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useStoreSettings } from '../context/StoreSettingsContext';
import { db, collection, addDoc, updateDoc, doc, increment, deleteDoc } from '../firebase';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import ConfirmModal from './ConfirmModal';

export default function CartDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { cart, total, removeFromCart, updateQuantity, updatePackaging, clearCart, pendingOrderId, pendingOrderData, setPendingOrderId } = useCart();
  const { t, language } = useLanguage();
  const { storeOpen } = useStoreSettings();
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
    kioskNumber: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;
    if (!storeOpen) {
      toast.error(t('cart.closed'));
      return;
    }

    // Security Checks
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

    setIsSubmitting(true);
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
        total,
        customerName: formData.name || (formData.orderType === 'pickup' ? 'Pickup Customer' : 'Kiosk Customer'),
        phone: formData.phone || 'N/A',
        orderType: formData.orderType,
        orderNumber: generatedOrderNumber,
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      if (formData.orderType === 'kiosk') {
        order.kioskNumber = formData.kioskNumber;
      }

      if (formData.notes) {
        order.notes = formData.notes;
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
      toast.success(t('cart.success'));
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
            className="fixed top-0 right-0 bottom-0 z-[70] w-full max-w-md bg-white shadow-2xl flex flex-col border-l border-gray-100"
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-100 flex justify-between items-center">
              <div className="flex items-center space-x-3">
                <ShoppingBag className="text-[#D4AF37]" size={24} />
                <h2 className="text-xl font-medium text-stone-900">{t('cart.title')}</h2>
              </div>
              <button onClick={onClose} className="p-2 text-stone-400 hover:text-[#8B0000] transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {pendingOrderId && pendingOrderData && !orderComplete && (
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
                      </div>
                    </div>
                    <button
                      onClick={() => setShowCancelConfirm(true)}
                      className="p-2 text-stone-400 hover:text-red-400 transition-colors rounded-full hover:bg-stone-800"
                      title={language === 'en' ? "Cancel Order" : "Захиалга цуцлах"}
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  {/* Items + total + hint */}
                  <div className="bg-gray-50 px-5 py-4 space-y-3">
                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                      {pendingOrderData.items?.map((item: any, idx: number) => (
                        <div key={idx} className="flex justify-between text-xs text-stone-500">
                          <span className="flex-1 mr-2">{item.quantity}× {item.name}{item.selectedPortion?.name && <span className="text-[#D4AF37]/70"> ({item.selectedPortion.name})</span>}</span>
                          <span className="tabular-nums text-stone-700 font-medium">₮{((item.price * item.quantity) + (item.packagingPrice || 0) * item.quantity).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-2 border-t border-gray-200 flex justify-between items-center">
                      <span className="text-xs font-semibold text-stone-500 uppercase tracking-widest">{t('cart.total')}</span>
                      <span className="text-xl font-bold text-[#8B0000] tabular-nums">₮{Math.round(pendingOrderData.total).toLocaleString()}</span>
                    </div>
                    <p className="text-sm font-bold text-[#8B0000] text-center pt-1 tracking-wide">
                      {language === 'en'
                        ? 'Go to the cashier and show your order number'
                        : 'Кассанд очиж захиалгын дугаараа харуулна уу'}
                    </p>
                  </div>
                </div>
              )}

              {orderComplete ? (
                <div className="flex flex-col items-center text-center space-y-5 py-4">
                  {/* Success icon */}
                  <div className="w-20 h-20 bg-green-50 border-2 border-green-200 rounded-full flex items-center justify-center">
                    <CheckCircle size={44} className="text-green-500" />
                  </div>

                  <div className="space-y-1">
                    <h3 className="font-serif font-bold text-2xl text-stone-900">{t('cart.order_received')}</h3>
                    <p className="text-stone-400 text-sm">
                      {language === 'en' ? 'Your order is being prepared' : 'Таны захиалга бэлтгэгдэж байна'}
                    </p>
                  </div>

                  {/* Step-by-step instructions */}
                  {completedOrderType === 'pickup' ? (
                    <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-5 text-left space-y-4">
                      <h4 className="text-base font-bold text-amber-900 text-center">
                        {language === 'en' ? 'What to do next' : 'Дараагийн алхмууд'}
                      </h4>
                      <div className="space-y-3">
                        {(language === 'en'
                          ? ['Go to the cashier', 'Show your order number above', 'Pay and collect your food']
                          : ['Кассанд очно уу', 'Захиалгын дугаараа харуулна уу', 'Төлж, хоолоо авна уу']
                        ).map((step, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-amber-200 text-amber-900 font-bold text-sm flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <p className="text-sm font-semibold text-amber-900 leading-snug">{step}</p>
                          </div>
                        ))}
                      </div>
                      <div className="pt-3 border-t border-amber-200 text-center space-y-1">
                        <p className="text-xs text-amber-600">{language === 'en' ? 'Or call us at' : 'Эсвэл утасдана уу'}</p>
                        <a href="tel:99138866" className="text-xl font-bold text-[#8B0000] hover:underline">99138866</a>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full bg-blue-50 border border-blue-200 rounded-2xl p-5 text-left space-y-4">
                      <h4 className="text-base font-bold text-blue-900 text-center">
                        {language === 'en' ? 'What to do next' : 'Дараагийн алхмууд'}
                      </h4>
                      <div className="space-y-3">
                        {(language === 'en'
                          ? ['Scan the QR code at your kiosk to pay', 'Or call us to confirm & pay', 'Collect your food when ready']
                          : ['Киоскны QR кодыг сканнэж төлнө үү', 'Эсвэл утасдаж баталгаажуулаарай', 'Бэлэн болмогц хоолоо авна уу']
                        ).map((step, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="w-7 h-7 rounded-full bg-blue-200 text-blue-900 font-bold text-sm flex items-center justify-center flex-shrink-0">{i + 1}</span>
                            <p className="text-sm font-semibold text-blue-900 leading-snug">{step}</p>
                          </div>
                        ))}
                      </div>
                      <div className="pt-3 border-t border-blue-200 text-center space-y-1">
                        <p className="text-xs text-blue-600">{language === 'en' ? 'Call us at' : 'Утасны дугаар'}</p>
                        <a href="tel:99138866" className="text-xl font-bold text-[#8B0000] hover:underline">99138866</a>
                      </div>
                    </div>
                  )}

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
                      className="w-full py-3 bg-[#8B0000] text-white font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-[#6b0000] transition-all"
                    >
                      {t('cart.back_to_menu')}
                    </button>

                    {pendingOrderId && (
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
                  <ShoppingBag className="text-gray-300" size={64} />
                  <p className="text-stone-400 font-light italic">{t('cart.empty')}</p>
                  <button
                    onClick={onClose}
                    className="text-[#8B0000] font-semibold uppercase tracking-[0.15em] text-xs hover:underline"
                  >
                    {t('cart.start_adding')}
                  </button>
                </div>
              ) : isCheckingOut ? (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-lg font-medium text-stone-900">{t('cart.checkout_details')}</h3>
                    
                    {/* Order Type Toggle */}
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">{t('cart.order_option')}</label>
                      <div className="flex p-1 bg-gray-50 border border-gray-200 rounded-full">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, orderType: 'pickup' })}
                          className={cn(
                            "flex-1 py-2 text-[10px] uppercase tracking-[0.2em] font-semibold rounded-full transition-all",
                            formData.orderType === 'pickup' ? "bg-[#8B0000] text-white" : "text-stone-500"
                          )}
                        >
                          {t('cart.pickup')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, orderType: 'kiosk' })}
                          className={cn(
                            "flex-1 py-2 text-[10px] uppercase tracking-[0.2em] font-semibold rounded-full transition-all",
                            formData.orderType === 'kiosk' ? "bg-[#8B0000] text-white" : "text-stone-500"
                          )}
                        >
                          {t('cart.at_mall')}
                        </button>
                      </div>
                    </div>



                    {formData.orderType === 'kiosk' && (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">{t('cart.phone')}</label>
                          <input
                            required
                            type="text"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full bg-white border border-gray-200 rounded-full px-5 py-3 text-stone-900 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                            placeholder="+976 ..."
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">{t('cart.kiosk_number')}</label>
                          <input
                            required
                            type="text"
                            value={formData.kioskNumber}
                            onChange={(e) => setFormData({ ...formData, kioskNumber: e.target.value })}
                            className="w-full bg-white border border-gray-200 rounded-full px-5 py-3 text-stone-900 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all"
                            placeholder="e.g., Kiosk #12"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">{t('cart.special_notes')}</label>
                          <textarea
                            value={formData.notes}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            className="w-full bg-white border border-gray-200 rounded-2xl px-5 py-3 text-stone-900 focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] outline-none transition-all h-24 resize-none"
                            placeholder={language === 'en' ? "e.g., No onions, extra spicy..." : "Жишээ нь: Сонгиногүй, халуун ногоотой..."}
                          />
                        </div>
                      </div>
                    )}
                    <div className="p-4 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-xl">
                      <p className="text-xs text-[#D4AF37] leading-relaxed">
                        {t('cart.cash_only')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCheckingOut(false)}
                    className="w-full py-3 text-stone-400 font-semibold uppercase tracking-[0.15em] text-xs hover:text-stone-600 transition-colors"
                  >
                    {t('cart.back_to_cart')}
                  </button>
                </form>
              ) : (
                <div className="space-y-6">
                  {cart.map((item) => (
                    <div key={item.cartItemId} className="flex space-x-4 group">
                      <div className="w-24 h-24 md:w-20 md:h-20 rounded-2xl overflow-hidden flex-shrink-0 border border-gray-100 shadow-sm">
                        <img
                          src={item.image || `https://picsum.photos/seed/${item.name}/200/200`}
                          alt={item.name}
                          className="w-full h-full object-cover transition-transform group-hover:scale-110"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="text-stone-900 font-medium text-sm">{item.name}</h4>
                            {item.selectedPortion && (
                              <p className="text-xs text-[#D4AF37] font-semibold tracking-wide">{item.selectedPortion.name}</p>
                            )}
                          </div>
                          <button
                            onClick={() => removeFromCart(item.cartItemId)}
                            className="p-1.5 text-stone-400 hover:text-red-500 transition-colors bg-gray-50 rounded-full"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <p className="text-xs text-stone-500 font-light line-clamp-1">{item.category}</p>
                        
                        <div className="pt-2 mt-2 border-t border-gray-100">
                          <button
                            onClick={() => updatePackaging(item.cartItemId, !item.packaging)}
                            className={cn(
                              "flex items-center justify-between w-full px-3 py-2 rounded-xl border transition-all active:scale-[0.98]",
                              item.packaging 
                                ? "bg-[#D4AF37]/10 border-[#D4AF37]/50" 
                                : "bg-gray-50 border-gray-200 hover:border-gray-300"
                            )}
                          >
                            <div className="flex items-center space-x-2">
                              {item.packaging ? (
                                <CheckCircle size={16} className="text-[#D4AF37]" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-gray-300" />
                              )}
                              <span className={cn(
                                "text-xs font-medium",
                                item.packaging ? "text-[#D4AF37]" : "text-stone-500"
                              )}>
                                {t('cart.packaging')}
                              </span>
                            </div>
                            <span className={cn(
                              "text-xs font-semibold tabular-nums",
                              item.packaging ? "text-[#D4AF37]" : "text-stone-400"
                            )}>
                              +₮{(item.packagingPrice !== undefined ? item.packagingPrice : 0).toLocaleString()}
                            </span>
                          </button>
                        </div>

                        <div className="flex justify-between items-center pt-2">
                          <div className="flex items-center space-x-3 bg-gray-50 rounded-full px-2 py-1 border border-gray-200">
                            <button
                              onClick={() => updateQuantity(item.cartItemId, item.quantity - 1)}
                              className="p-1 text-stone-500 hover:text-[#8B0000] transition-colors"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="text-sm font-semibold text-stone-700 min-w-[20px] text-center tabular-nums">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.cartItemId, item.quantity + 1)}
                              className="p-1 text-stone-500 hover:text-[#8B0000] transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <span className="text-sm font-semibold tabular-nums text-[#8B0000]">₮{(Math.round(item.selectedPortion ? item.selectedPortion.price * item.quantity : item.price * item.quantity) + (item.packaging ? (item.packagingPrice !== undefined ? item.packagingPrice : 0) * item.quantity : 0)).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {!orderComplete && cart.length > 0 && (
              <div className="p-6 border-t border-gray-100 bg-gray-50 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-stone-500 uppercase tracking-[0.2em] text-xs font-semibold">{t('cart.subtotal')}</span>
                  <span className="text-2xl font-medium tabular-nums text-stone-900">₮{Math.round(total).toLocaleString()}</span>
                </div>
                {isBlocked && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                    <p className="text-xs text-red-600 font-semibold uppercase tracking-widest">{blockReason}</p>
                  </div>
                )}
                {pendingOrderId && (
                  <div className="p-4 bg-[#D4AF37]/5 border border-[#D4AF37]/20 rounded-xl text-center space-y-2">
                    <p className="text-xs text-[#D4AF37] font-semibold uppercase tracking-widest">
                      {language === 'en' ? 'Pending order must finish first' : 'Захиалга дуусахыг хүлээнэ үү'}
                    </p>
                    <p className="text-[10px] text-stone-500 font-light italic">
                      {language === 'en' ? 'You can cancel your current order above to place a new one.' : 'Та шинээр захиалга өгөхийн тулд дээрх захиалгыг цуцалж болно.'}
                    </p>
                  </div>
                )}
                {isCheckingOut ? (
                  <button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !storeOpen || isBlocked || !!pendingOrderId || (formData.orderType === 'kiosk' && (!formData.kioskNumber || !formData.phone))}
                    className={cn(
                      "w-full py-4 bg-[#8B0000] text-white font-semibold uppercase tracking-[0.15em] rounded-full flex items-center justify-center space-x-2 transition-all active:scale-95",
                      (isSubmitting || !storeOpen || isBlocked || !!pendingOrderId || (formData.orderType === 'kiosk' && (!formData.kioskNumber || !formData.phone))) && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {isSubmitting ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <span>{!storeOpen ? t('cart.closed') : t('cart.confirm_order')}</span>
                        {storeOpen && <ArrowRight size={18} />}
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => setIsCheckingOut(true)}
                    disabled={!storeOpen || !!pendingOrderId}
                    className={cn(
                      "w-full py-4 bg-[#8B0000] text-white font-semibold uppercase tracking-[0.15em] rounded-full flex items-center justify-center space-x-2 transition-all active:scale-95 shadow-lg shadow-red-900/20",
                      (!storeOpen || !!pendingOrderId) ? "opacity-50 cursor-not-allowed" : "hover:bg-[#6b0000]"
                    )}
                  >
                    <span>{!storeOpen ? t('cart.closed') : t('cart.proceed')}</span>
                    {storeOpen && <ArrowRight size={18} />}
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
