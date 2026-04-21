import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, Menu as MenuIcon, X, Globe } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import ConfirmModal from './ConfirmModal';

export default function Navbar({ onCartOpen }: { onCartOpen: () => void }) {
  const { itemCount, pendingOrderId } = useCart();
  const { language, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const location = useLocation();

  const navLinks = [
    { name: t('nav.home'), path: '/' },
    { name: t('nav.menu'), path: '/menu' },
    { name: t('nav.about'), path: '/about' },
    { name: t('nav.contact'), path: '/contact' },
  ];

  const handleLinkClick = (path: string) => {
    if (location.pathname === path) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setIsOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b border-gray-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link 
            to="/" 
            onClick={() => handleLinkClick('/')}
            className="flex items-center space-x-2"
          >
            <span className="text-2xl font-serif font-bold tracking-tighter flex items-baseline">
              <span className="text-[#D4AF37] text-4xl mr-1 leading-none">1</span>
              <span className="text-[#8B0000]">ЦЭГЦ</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-8">
            {navLinks.map((link) => (
              <Link
                key={link.path}
                to={link.path}
                onClick={() => handleLinkClick(link.path)}
                className={cn(
                  "text-sm uppercase tracking-widest transition-colors hover:text-[#D4AF37]",
                  location.pathname === link.path ? "text-[#8B0000] font-semibold" : "text-stone-600"
                )}
              >
                {link.name}
              </Link>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-4">
            {/* Language Switcher */}
            <div className="flex items-center bg-gray-100 rounded-full p-1 border border-gray-200">
              <button
                onClick={() => setLanguage('mn')}
                className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                  language === 'mn' ? "bg-[#8B0000] text-white" : "text-stone-500 hover:text-stone-800"
                )}
              >
                MN
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={cn(
                  "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                  language === 'en' ? "bg-[#8B0000] text-white" : "text-stone-500 hover:text-stone-800"
                )}
              >
                EN
              </button>
            </div>

            <button
              onClick={onCartOpen}
              className="relative p-2 text-stone-600 hover:text-[#D4AF37] transition-colors"
            >
              <ShoppingCart size={24} />
              {itemCount > 0 && (
                <span className="absolute top-0 right-0 bg-[#8B0000] text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                  {itemCount}
                </span>
              )}
              {pendingOrderId && (
                <span className="absolute -bottom-1 -right-1 bg-[#D4AF37] text-white text-[8px] font-bold px-1 py-0.5 rounded-full uppercase tracking-tighter animate-pulse">
                  {language === 'en' ? 'Active' : 'Идэвхтэй'}
                </span>
              )}
            </button>

            {pendingOrderId && (
              <button
                onClick={() => setShowCancelConfirm(true)}
                className="hidden sm:block px-3 py-1.5 bg-red-500/10 border border-red-500/50 text-red-500 text-[10px] font-bold uppercase tracking-widest rounded-full hover:bg-red-500 hover:text-white transition-all"
              >
                {language === 'en' ? 'Cancel Order' : 'Цуцлах'}
              </button>
            )}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="md:hidden p-2 text-stone-600 hover:text-[#D4AF37] transition-colors"
            >
              {isOpen ? <X size={24} /> : <MenuIcon size={24} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-b border-gray-100 overflow-hidden"
          >
            <div className="px-4 pt-2 pb-6 space-y-4">
              {navLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => handleLinkClick(link.path)}
                  className={cn(
                    "block text-lg uppercase tracking-widest transition-colors hover:text-[#D4AF37]",
                    location.pathname === link.path ? "text-[#8B0000] font-semibold" : "text-stone-600"
                  )}
                >
                  {link.name}
                </Link>
              ))}

              {pendingOrderId && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="w-full px-4 py-3 bg-red-500/10 border border-red-500/50 text-red-500 text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-red-500 hover:text-white transition-all text-center"
                >
                  {language === 'en' ? 'Cancel Current Order' : 'Захиалга цуцлах'}
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={async () => {
          if (pendingOrderId) {
            const { db, doc, deleteDoc } = await import('../firebase');
            const { toast } = await import('sonner');
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
              setIsOpen(false);
            } catch (error) {
              handleFirestoreError(error, OperationType.DELETE, `orders/${pendingOrderId}`);
            }
          }
        }}
        title={language === 'en' ? "Cancel Order" : "Захиалга цуцлах"}
        message={language === 'en' ? "Are you sure you want to cancel your current pending order? This action cannot be undone." : "Та хүлээгдэж буй захиалгаа цуцлахдаа итгэлтэй байна уу? Энэ үйлдлийг буцаах боломжгүй."}
        confirmText={language === 'en' ? "Yes, Cancel" : "Тийм, цуцлах"}
        cancelText={language === 'en' ? "No, Keep it" : "Үгүй"}
      />
    </nav>
  );
}
