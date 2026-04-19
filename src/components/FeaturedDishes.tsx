import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, collection, onSnapshot, query, where, orderBy, limit } from '../firebase';
import { MenuItem } from '../types';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn } from '../lib/utils';

export default function FeaturedDishes() {
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { addToCart } = useCart();
  const { t, language } = useLanguage();

  useEffect(() => {
    const featuredQuery = query(
      collection(db, 'menu'),
      where('available', '==', true),
      where('featured', '==', true),
      limit(5)
    );

    const unsubscribe = onSnapshot(featuredQuery, (snapshot) => {
      if (!snapshot.empty) {
        const items = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as MenuItem[];
        setFeaturedItems(items);
      } else {
        const mostOrderedQuery = query(
          collection(db, 'menu'),
          where('available', '==', true),
          orderBy('orderCount', 'desc'),
          limit(5)
        );

        onSnapshot(mostOrderedQuery, (mostOrderedSnapshot) => {
          if (!mostOrderedSnapshot.empty) {
            const items = mostOrderedSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as MenuItem[];
            setFeaturedItems(items);
          } else {
            const fallbackQuery = query(collection(db, 'menu'), limit(5));
            onSnapshot(fallbackQuery, (fallbackSnapshot) => {
              const items = fallbackSnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              })) as MenuItem[];
              setFeaturedItems(items);
            });
          }
        });
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (featuredItems.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
    }, 7000);
    return () => clearInterval(timer);
  }, [featuredItems.length]);

  const next = () => setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + featuredItems.length) % featuredItems.length);

  if (featuredItems.length === 0) return null;

  const currentItem = featuredItems[currentIndex];

  return (
    <section className="relative h-[100svh] w-full overflow-hidden bg-stone-950">
      {/* Hero — Full-bleed food photo */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentItem.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
          className="absolute inset-0"
        >
          <img
            src={currentItem.image || `https://picsum.photos/seed/${currentItem.name}/1920/1080`}
            alt={currentItem.name}
            className="h-full w-full object-cover object-center"
            referrerPolicy="no-referrer"
          />
          {/* Subtle gradient overlay — bottom weighted to protect the food view */}
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/30 to-transparent" />
        </motion.div>
      </AnimatePresence>

      {/* Content Overlay */}
      <div className="relative h-full flex flex-col justify-end px-6 sm:px-12 pb-24 sm:pb-32">
        <div className="max-w-3xl space-y-8">
          <motion.div
            key={currentItem.id + '-text'}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="space-y-4"
          >
            {/* Serif Tagline */}
            <div className="space-y-2">
              <p className="text-[#D4AF37] text-xs uppercase tracking-[0.4em] font-black">
                {currentItem.category}
              </p>
              <h1 className="text-5xl sm:text-7xl md:text-8xl font-serif text-white leading-tight tracking-tight">
                {currentItem.name}
              </h1>
            </div>

            {currentItem.description && (
              <p className="text-lg sm:text-xl text-stone-200/80 font-light leading-relaxed max-w-xl line-clamp-3">
                {currentItem.description}
              </p>
            )}
          </motion.div>

          {/* CTAs */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="flex flex-col sm:flex-row items-center gap-4"
          >
            <Link
              to="/menu"
              className="w-full sm:w-auto px-10 py-5 bg-[#D4AF37] text-stone-950 font-black uppercase tracking-[0.2em] rounded-full hover:bg-[#C5A028] transition-all active:scale-95 text-center text-sm shadow-2xl shadow-[#D4AF37]/20"
            >
              {language === 'en' ? 'Browse the Menu' : 'Цэс үзэх'}
            </Link>
            <button
              onClick={() => addToCart(currentItem)}
              className="w-full sm:w-auto px-10 py-5 border-2 border-[#8B0000] text-white font-black uppercase tracking-[0.2em] rounded-full hover:bg-[#8B0000] transition-all active:scale-95 text-center text-sm"
            >
              {language === 'en' ? 'Add to Cart' : 'Сагсанд нэмэх'}
            </button>
          </motion.div>
        </div>
      </div>

      {/* Navigation & Indicators */}
      <div className="absolute bottom-10 left-6 sm:left-12 right-6 sm:right-12 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {featuredItems.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={cn(
                "h-1 rounded-full transition-all duration-500",
                currentIndex === idx ? "w-12 bg-[#D4AF37]" : "w-4 bg-white/30 hover:bg-white/50"
              )}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={prev} className="p-3 rounded-full border border-white/20 text-white/60 hover:border-white hover:text-white transition-all bg-stone-900/20 backdrop-blur-md">
            <ChevronLeft size={20} />
          </button>
          <button onClick={next} className="p-3 rounded-full border border-white/20 text-white/60 hover:border-white hover:text-white transition-all bg-stone-900/20 backdrop-blur-md">
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Scroll Cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
      >
        <span className="text-[9px] uppercase tracking-[0.4em] text-white/40 font-bold">Scroll</span>
        <motion.div
          animate={{ y: [0, 5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <ChevronDown size={14} className="text-[#D4AF37]" />
        </motion.div>
      </motion.div>
    </section>
  );
}
