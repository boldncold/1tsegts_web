import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, Menu as MenuIcon, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { db, doc, deleteDoc } from '../firebase';
import { toast } from 'sonner';
import ConfirmModal from './ConfirmModal';

export default function Navbar({ onCartOpen }: { onCartOpen: () => void }) {
  const { itemCount, pendingOrderId } = useCart();
  const { language, setLanguage, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const location = useLocation();

  const mainLinks = [
    { name: t('nav.home'), path: '/' },
    { name: t('nav.menu'), path: '/menu' },
  ];

  const fullLinks = [
    { name: t('nav.home'), path: '/' },
    { name: t('nav.menu'), path: '/menu' },
    { name: t('nav.about'), path: '/about' },
    { name: t('nav.contact'), path: '/contact' },
  ];

  const bottomLinks = [
    { name: t('footer.admin'), path: '/admin' },
    { name: language === 'en' ? 'Privacy' : 'Нууцлал', path: '#' },
    { name: language === 'en' ? 'Terms' : 'Нөхцөл', path: '#' },
  ];

  const handleLinkClick = (path: string) => {
    if (location.pathname === path) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    setIsOpen(false);
  };

  // High-performance portal-rendered sidebar
  const sideDrawer = typeof document !== 'undefined' && createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Static backdrop for better performance than animated opacity on large surfaces */}
          <div 
            className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm cursor-pointer"
            onClick={() => setIsOpen(false)}
          />
          
          <motion.aside
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'tween', duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="fixed top-0 right-0 bottom-0 z-[101] w-[85%] max-w-[400px] bg-white shadow-2xl flex flex-col"
          >
            {/* Drawer Header */}
            <div className="flex justify-between items-center h-20 px-8 border-b border-stone-100">
              <span className="text-xl font-serif font-bold tracking-tighter text-[#8B0000]">
                МЕНЮ
              </span>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 text-stone-400 hover:text-[#8B0000] transition-colors"
              >
                <X size={24} />
              </button>
            </div>

            {/* Main Links */}
            <div className="flex-1 overflow-y-auto px-8 py-10">
              <nav className="space-y-2">
                {fullLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => handleLinkClick(link.path)}
                    className={cn(
                      "block text-2xl font-medium tracking-tight py-4 transition-all active:scale-95",
                      location.pathname === link.path 
                        ? "text-[#8B0000] font-bold" 
                        : "text-stone-700 hover:text-[#D4AF37] hover:bg-stone-50"
                    )}
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>

              {/* Language switcher */}
              <div className="mt-10 pt-8 border-t border-stone-100">
                <p className="text-[10px] uppercase tracking-[0.3em] text-stone-400 font-bold mb-4">
                  {language === 'en' ? 'Language' : 'Хэл'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLanguage('mn')}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-sm font-bold transition-all border",
                      language === 'mn'
                        ? "bg-[#8B0000] text-white border-[#8B0000] shadow-sm"
                        : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                    )}
                  >
                    Монгол
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    className={cn(
                      "flex-1 py-3 rounded-xl text-sm font-bold transition-all border",
                      language === 'en'
                        ? "bg-[#8B0000] text-white border-[#8B0000] shadow-sm"
                        : "bg-white text-stone-500 border-stone-200 hover:border-stone-400"
                    )}
                  >
                    English
                  </button>
                </div>
              </div>

              {pendingOrderId && (
                <div className="mt-8">
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setShowCancelConfirm(true);
                    }}
                    className="w-full px-6 py-4 bg-red-50 text-red-600 border border-red-100 font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-red-600 hover:text-white transition-all"
                  >
                    {language === 'en' ? 'Cancel Current Order' : 'Захиалга цуцлах'}
                  </button>
                </div>
              )}
            </div>

            {/* Drawer footer */}
            <div className="px-8 py-5 border-t border-stone-100 bg-stone-50 shrink-0">
              <div className="flex items-center gap-4 mb-3">
                {bottomLinks.map((link) => (
                  <Link
                    key={link.name}
                    to={link.path}
                    onClick={() => handleLinkClick(link.path)}
                    className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
                  >
                    {link.name}
                  </Link>
                ))}
              </div>
              <p className="text-[10px] text-stone-400 tracking-wider">© 2026 1ЦЭГЦ</p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-b border-gray-100/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex-1 flex justify-start">
              <Link 
                to="/" 
                onClick={() => handleLinkClick('/')}
                className="flex items-center group"
              >
                <span className="text-2xl font-serif font-bold tracking-tighter flex items-baseline">
                  <span className="text-[#D4AF37] text-4xl mr-1 leading-none transition-transform group-hover:scale-110">1</span>
                  <span className="text-[#8B0000]">ЦЭГЦ</span>
                </span>
              </Link>
            </div>

            {/* Center Nav - Home & Menu */}
            <div className="hidden md:flex items-center gap-8 lg:gap-12">
              {mainLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => handleLinkClick(link.path)}
                  className={cn(
                    "text-xs uppercase tracking-[0.2em] transition-colors hover:text-[#D4AF37]",
                    location.pathname === link.path ? "text-[#8B0000] font-bold" : "text-stone-600"
                  )}
                >
                  {link.name}
                </Link>
              ))}
            </div>

            {/* Actions */}
            <div className="flex-1 flex justify-end items-center gap-1 sm:gap-3">
              <button
                onClick={onCartOpen}
                className="relative p-2 text-stone-600 hover:text-[#D4AF37] transition-colors"
              >
                <ShoppingCart size={22} />
                {itemCount > 0 && (
                  <span className="absolute top-0 right-0 bg-[#8B0000] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                    {itemCount}
                  </span>
                )}
                {pendingOrderId && (
                  <span className="absolute -bottom-1 -right-1 bg-[#D4AF37] text-white text-[7px] font-bold px-1 py-0.5 rounded-full uppercase tracking-tighter animate-pulse">
                    {language === 'en' ? 'Active' : 'Идэвхтэй'}
                  </span>
                )}
              </button>

              {pendingOrderId && (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="hidden sm:block px-3 py-1.5 bg-red-50 text-red-600 border border-red-200 text-[9px] font-bold uppercase tracking-widest rounded-full hover:bg-red-600 hover:text-white hover:border-red-600 transition-all"
                >
                  {language === 'en' ? 'Cancel' : 'Цуцлах'}
                </button>
              )}

              <button
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 text-stone-600 hover:text-[#D4AF37] transition-colors"
                aria-label="Toggle menu"
              >
                <MenuIcon size={24} />
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Portal-rendered side drawer */}
      {sideDrawer}

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
    </>
  );
}
