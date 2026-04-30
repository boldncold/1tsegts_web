import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ShoppingCart, Menu as MenuIcon, X, ChevronRight } from 'lucide-react';
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
  const [scrolled, setScrolled] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const fullLinks = [
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

  const navBg = scrolled
    ? 'bg-[rgba(26,21,16,0.92)] border-b border-[rgba(212,175,55,0.18)]'
    : 'bg-[rgba(26,21,16,0.55)] border-b border-transparent';

  const sideDrawer = typeof document !== 'undefined' && createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[100] bg-black/55 backdrop-blur-sm cursor-pointer"
            onClick={() => setIsOpen(false)}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'tween', duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
            className="fixed top-0 left-0 bottom-0 z-[101] w-[280px] bg-[#1a1510] shadow-2xl flex flex-col border-r border-[rgba(212,175,55,0.15)]"
          >
            {/* Drawer header */}
            <div className="flex justify-between items-center px-6 py-6">
              <span className="font-serif font-bold text-lg tracking-tighter flex items-baseline">
                <span className="text-[#D4AF37] text-2xl leading-none mr-0.5">1</span>
                <span className="text-[#8B0000]">ЦЭГЦ</span>
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-white/60 hover:text-white transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 px-6 pt-2 overflow-y-auto">
              {fullLinks.map((link) => (
                <Link
                  key={link.path}
                  to={link.path}
                  onClick={() => handleLinkClick(link.path)}
                  className={cn(
                    'flex justify-between items-center py-[14px] font-serif text-[17px] border-b border-white/[0.06] transition-colors',
                    location.pathname === link.path
                      ? 'text-[#D4AF37]'
                      : 'text-white hover:text-[#D4AF37]'
                  )}
                >
                  <span>{link.name}</span>
                  <ChevronRight size={16} className="text-[#D4AF37] opacity-60" />
                </Link>
              ))}

              {/* Language switcher */}
              <div className="mt-8 pt-6 border-t border-white/[0.06]">
                <p className="text-[10px] uppercase tracking-[0.3em] text-white/40 font-bold mb-3">
                  {language === 'en' ? 'Language' : 'Хэл'}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setLanguage('mn')}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border',
                      language === 'mn'
                        ? 'bg-[#8B0000] text-white border-[#8B0000]'
                        : 'bg-transparent text-white/50 border-white/15 hover:border-white/30'
                    )}
                  >
                    Монгол
                  </button>
                  <button
                    onClick={() => setLanguage('en')}
                    className={cn(
                      'flex-1 py-2.5 rounded-xl text-sm font-bold transition-all border',
                      language === 'en'
                        ? 'bg-[#8B0000] text-white border-[#8B0000]'
                        : 'bg-transparent text-white/50 border-white/15 hover:border-white/30'
                    )}
                  >
                    English
                  </button>
                </div>
              </div>

              {pendingOrderId && (
                <div className="mt-6">
                  <button
                    onClick={() => { setIsOpen(false); setShowCancelConfirm(true); }}
                    className="w-full px-6 py-3.5 bg-red-900/30 text-red-400 border border-red-900/40 font-bold uppercase tracking-widest text-xs rounded-xl hover:bg-red-600 hover:text-white transition-all"
                  >
                    {language === 'en' ? 'Cancel Current Order' : 'Захиалга цуцлах'}
                  </button>
                </div>
              )}
            </nav>

            {/* Drawer footer */}
            <div className="px-6 py-5 border-t border-white/[0.06]">
              <Link
                to="/admin"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2.5 text-white/40 hover:text-[#D4AF37] transition-colors text-[11px] font-bold uppercase tracking-[0.2em]"
              >
                <span>Admin</span>
              </Link>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );

  return (
    <>
      <nav className={cn(
        'fixed top-0 left-0 right-0 z-50 backdrop-blur-md transition-all duration-250',
        navBg
      )}>
        <div className="max-w-[1280px] mx-auto px-5 h-[56px] flex items-center justify-between">
          {/* Left: hamburger */}
          <button
            onClick={() => setIsOpen(true)}
            className="p-1.5 text-white hover:text-[#D4AF37] transition-colors"
            aria-label="Menu"
          >
            <MenuIcon size={22} />
          </button>

          {/* Center: wordmark — 1 is 2× ЦЭГЦ per brand spec */}
          <Link
            to="/"
            onClick={() => handleLinkClick('/')}
            className="font-serif font-bold tracking-tighter flex items-baseline leading-none"
          >
            <span className="text-[#D4AF37] text-[36px] leading-none mr-0.5">1</span>
            <span className="text-[#8B0000] text-[18px]">ЦЭГЦ</span>
          </Link>

          {/* Right: lang toggle + cart */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLanguage(language === 'en' ? 'mn' : 'en')}
              className="text-[#D4AF37] text-[11px] font-bold tracking-[0.18em] uppercase px-1.5 py-1 hover:text-white transition-colors"
            >
              {language === 'en' ? 'EN' : 'MN'}
            </button>
            <button
              onClick={onCartOpen}
              className="relative p-2 border border-[rgba(212,175,55,0.35)] text-[#D4AF37] rounded-full hover:border-[#D4AF37] transition-colors"
              aria-label="Cart"
            >
              <ShoppingCart size={18} />
              {itemCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#8B0000] text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                  {itemCount}
                </span>
              )}
              {pendingOrderId && (
                <span className="absolute -bottom-1 -right-1 bg-[#D4AF37] text-[#1a1510] text-[7px] font-bold px-1 py-0.5 rounded-full uppercase tracking-tighter animate-pulse">
                  {language === 'en' ? 'Active' : 'Идэвхтэй'}
                </span>
              )}
            </button>
          </div>
        </div>
      </nav>

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
                  ? 'Your order was cancelled. Due to multiple cancellations, you are blocked for 1 hour.'
                  : 'Таны захиалга цуцлагдлаа. Олон удаа цуцалсан тул та 1 цагийн турш захиалга өгөх боломжгүй боллоо.');
              } else {
                toast.warning(language === 'en'
                  ? 'Your order was cancelled. Please note that multiple cancellations will result in a temporary block.'
                  : 'Таны захиалга цуцлагдлаа. Дахин цуцалбал захиалга өгөх эрх түр хаагдахыг анхаарна уу.');
              }

              await deleteDoc(doc(db, 'orders', pendingOrderId));
              setIsOpen(false);
            } catch (error) {
              handleFirestoreError(error, OperationType.DELETE, `orders/${pendingOrderId}`);
            }
          }
        }}
        title={language === 'en' ? 'Cancel Order' : 'Захиалга цуцлах'}
        message={language === 'en' ? 'Are you sure you want to cancel your current pending order? This action cannot be undone.' : 'Та хүлээгдэж буй захиалгаа цуцлахдаа итгэлтэй байна уу? Энэ үйлдлийг буцаах боломжгүй.'}
        confirmText={language === 'en' ? 'Yes, Cancel' : 'Тийм, цуцлах'}
        cancelText={language === 'en' ? 'No, Keep it' : 'Үгүй'}
      />
    </>
  );
}
