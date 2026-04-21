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
    <section className="relative w-full min-h-screen overflow-hidden bg-white flex flex-col items-center justify-center p-4 sm:p-8">
      {/* Landscape Hero Container */}
      <div className="relative w-full max-w-7xl h-[65vh] sm:h-[75vh] rounded-3xl overflow-hidden shadow-2xl flex-shrink-0 bg-stone-100">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentItem.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0"
          >
            {/* Cropped Landscape Image */}
            <img
              src={currentItem.image || `https://picsum.photos/seed/${currentItem.name}/1920/1080`}
              alt={currentItem.name}
              className="h-full w-full object-cover object-center"
              referrerPolicy="no-referrer"
            />
            
            {/* Lighter gradient overlay inside the image container for text readability (not fully blacked out) */}
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none z-10" />
          </motion.div>
        </AnimatePresence>

        {/* Content Overlay (Inside the image) */}
        <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-6 sm:p-12 pointer-events-none">
          <div className="max-w-3xl space-y-6 pointer-events-auto">
            <motion.div
              key={currentItem.id + '-text'}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
              className="space-y-4"
            >
              {/* Serif Tagline */}
              <div className="space-y-2">
                <p className="text-[#D4AF37] text-xs uppercase tracking-[0.4em] font-black drop-shadow-md">
                  {currentItem.category}
                </p>
                <h1 className="text-4xl sm:text-6xl md:text-7xl font-serif text-white leading-tight tracking-tight drop-shadow-lg">
                  {currentItem.name}
                </h1>
              </div>

              {currentItem.description && (
                <p className="text-base sm:text-lg text-stone-100 font-medium leading-relaxed max-w-xl line-clamp-2 drop-shadow-md">
                  {currentItem.description}
                </p>
              )}
            </motion.div>

            {/* CTAs */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
              className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4"
            >
              <Link
                to="/menu"
                className="w-full sm:w-auto px-8 py-4 bg-[#D4AF37] text-stone-950 font-black uppercase tracking-[0.15em] rounded-full hover:bg-[#C5A028] transition-all active:scale-95 text-center text-sm shadow-xl shadow-[#D4AF37]/20"
              >
                {language === 'en' ? 'Browse the Menu' : 'Цэс үзэх'}
              </Link>
              <button
                onClick={() => addToCart(currentItem)}
                className="w-full sm:w-auto px-8 py-4 bg-black/40 backdrop-blur-md border border-white/20 text-white font-black uppercase tracking-[0.15em] rounded-full hover:bg-black/60 hover:border-white/40 transition-all active:scale-95 text-center text-sm shadow-xl"
              >
                {language === 'en' ? 'Add to Cart' : 'Сагсанд нэмэх'}
              </button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Navigation & Indicators (Outside the image) */}
      <div className="absolute bottom-8 left-0 right-0 px-4 sm:px-8 flex flex-col items-center pointer-events-none z-30">
        <div className="w-full max-w-7xl mx-auto flex items-center justify-between pointer-events-auto">
          {/* Indicator Dots */}
          <div className="flex items-center gap-2 sm:gap-3">
            {featuredItems.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentIndex(idx)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-500",
                  currentIndex === idx ? "w-8 sm:w-12 bg-[#D4AF37]" : "w-3 sm:w-4 bg-stone-300 hover:bg-stone-400"
                )}
              />
            ))}
          </div>

          {/* Arrows */}
          <div className="flex gap-2">
            <button onClick={prev} className="p-2 sm:p-3 rounded-full border border-stone-200 text-stone-600 hover:border-stone-900 hover:text-stone-900 hover:bg-stone-50 transition-all bg-white shadow-sm">
              <ChevronLeft size={20} />
            </button>
            <button onClick={next} className="p-2 sm:p-3 rounded-full border border-stone-200 text-stone-600 hover:border-stone-900 hover:text-stone-900 hover:bg-stone-50 transition-all bg-white shadow-sm">
              <ChevronRight size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* Scroll Cue (Outside) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-2 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-30 pointer-events-none"
      >
        <span className="text-[10px] uppercase tracking-[0.3em] text-stone-400 font-bold">Scroll</span>
        <motion.div
          animate={{ y: [0, 4, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <ChevronDown size={14} className="text-[#D4AF37]" />
        </motion.div>
      </motion.div>
    </section>
  );
}
