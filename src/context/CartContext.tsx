import React, { createContext, useContext, useState, useEffect } from 'react';
import { CartItem, MenuItem, Portion } from '../types';
import { db, doc, onSnapshot } from '../firebase';
import { toast } from 'sonner';
import { useLanguage } from './LanguageContext';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';

interface CartContextType {
  cart: CartItem[];
  addToCart: (item: MenuItem, selectedPortion?: Portion, quantity?: number) => void;
  removeFromCart: (cartItemId: string) => void;
  updateQuantity: (cartItemId: string, quantity: number) => void;
  updatePackaging: (cartItemId: string, packaging: boolean) => void;
  clearCart: () => void;
  total: number;
  itemCount: number;
  pendingOrderId: string | null;
  pendingOrderData: any | null;
  setPendingOrderId: (id: string | null) => void;
  /** True when the last pending order died because its payment window expired.
      Cleared as soon as a new order is placed. Lets the UI show a proper
      "expired — order again" state instead of a stale success screen. */
  pendingOrderExpired: boolean;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { language } = useLanguage();
  const [cart, setCart] = useState<CartItem[]>(() => {
    const saved = localStorage.getItem('cart');
    return saved ? JSON.parse(saved) : [];
  });

  const [pendingOrderId, setPendingOrderIdState] = useState<string | null>(() => localStorage.getItem('grand_pending_order_id'));
  const [pendingOrderData, setPendingOrderData] = useState<any | null>(null);
  const [pendingOrderExpired, setPendingOrderExpired] = useState(false);

  const setPendingOrderId = (id: string | null) => {
    if (id) {
      localStorage.setItem('grand_pending_order_id', id);
      localStorage.setItem('grand_pending_order_time', new Date().toISOString());
      setPendingOrderExpired(false);
    } else {
      localStorage.removeItem('grand_pending_order_id');
      localStorage.removeItem('grand_pending_order_time');
    }
    setPendingOrderIdState(id);
  };

  useEffect(() => {
    if (!pendingOrderId) return;

    // Stretch the local cleanup to 35 min for bank-transfer orders (the server-side
    // PAYMENT_WINDOW_MINUTES is 30; +5 buffer so we don't drop a still-valid pending order).
    // Cash orders keep the original 20-min cleanup.
    const orderTime = localStorage.getItem('grand_pending_order_time');
    if (orderTime) {
      const diff = (new Date().getTime() - new Date(orderTime).getTime()) / 60000;
      if (diff >= 35) {
        setPendingOrderId(null);
        return;
      }
    }

    // Track previous paymentStatus so we only toast on the transition, not every snapshot.
    let prevPaymentStatus: string | undefined;

    const unsubscribe = onSnapshot(doc(db, 'orders', pendingOrderId), (snapshot) => {
      if (!snapshot.exists()) {
        setPendingOrderId(null);
        setPendingOrderData(null);
        return;
      }

      const orderData = snapshot.data();
      setPendingOrderData(orderData);

      // Payment status transitions — both QPay and bank-transfer flows go
      // through AWAITING_PAYMENT → CONFIRMED (or EXPIRED).
      const newPaymentStatus = orderData.paymentStatus;
      const isNonCashPayment =
        orderData.paymentMethod === 'qpay' ||
        orderData.paymentMethod === 'bank_transfer';
      if (isNonCashPayment && newPaymentStatus !== prevPaymentStatus) {
        if (newPaymentStatus === 'CONFIRMED') {
          if (orderData.paymentMethod === 'qpay') {
            toast.success(language === 'en'
              ? 'QPay payment confirmed! Your order is being prepared.'
              : 'QPay төлбөр амжилттай! Захиалга бэлтгэгдэж байна.');
          } else {
            toast.success(language === 'en'
              ? 'Payment confirmed! Your order is being prepared.'
              : 'Төлбөр баталгаажлаа! Захиалга бэлтгэгдэж байна.');
          }
        } else if (newPaymentStatus === 'EXPIRED') {
          toast.error(language === 'en'
            ? 'Payment window expired. Please reorder.'
            : 'Төлбөрийн хугацаа дууслаа. Захиалгаа дахин өгнө үү.');
          setPendingOrderExpired(true);
          setPendingOrderId(null);
          setPendingOrderData(null);
          return;
        }
      }
      prevPaymentStatus = newPaymentStatus;

      if (orderData.status !== 'pending') {
        setPendingOrderId(null);
        setPendingOrderData(null);

        if (orderData.status === 'cancelled') {
          toast.error(language === 'en'
            ? "Your order was cancelled by the restaurant."
            : "Таны захиалгыг ресторан цуцаллаа.");
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `orders/${pendingOrderId}`);
    });

    return () => unsubscribe();
  }, [pendingOrderId]);

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const addToCart = (item: MenuItem, selectedPortion?: Portion, quantity: number = 1) => {
    setCart(prev => {
      const cartItemId = `${item.id}-${selectedPortion?.name || 'default'}`;
      const existing = prev.find(i => i.cartItemId === cartItemId);
      if (existing) {
        return prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + quantity } : i);
      }
      return [...prev, { ...item, cartItemId, quantity, packaging: false, selectedPortion }];
    });
  };

  const removeFromCart = (cartItemId: string) => {
    setCart(prev => prev.filter(i => i.cartItemId !== cartItemId));
  };

  const updateQuantity = (cartItemId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(cartItemId);
      return;
    }
    setCart(prev => prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity } : i));
  };

  const updatePackaging = (cartItemId: string, packaging: boolean) => {
    setCart(prev => prev.map(i => i.cartItemId === cartItemId ? { ...i, packaging } : i));
  };

  const clearCart = () => setCart([]);

  const total = cart.reduce((acc, item) => {
    const itemPrice = item.selectedPortion ? item.selectedPortion.price : item.price;
    const itemTotal = itemPrice * item.quantity;
    const packagingPrice = item.packagingPrice !== undefined ? item.packagingPrice : 0;
    const packagingTotal = item.packaging ? packagingPrice * item.quantity : 0;
    return acc + itemTotal + packagingTotal;
  }, 0);
  const itemCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <CartContext.Provider value={{ 
      cart, 
      addToCart, 
      removeFromCart, 
      updateQuantity, 
      updatePackaging, 
      clearCart, 
      total, 
      itemCount,
      pendingOrderId,
      pendingOrderData,
      setPendingOrderId,
      pendingOrderExpired
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within a CartProvider');
  return context;
}
