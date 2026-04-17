import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Star, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, collection, onSnapshot, query, where, orderBy, limit } from '../firebase';
import { MenuItem } from '../types';
import { useCart } from '../context/CartContext';
import { cn } from '../lib/utils';

export default function FeaturedDishes() {
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { addToCart } = useCart();

  useEffect(() => {
    // First try to get explicitly featured items
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
        // Fallback to most ordered items
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
            // Final fallback to any items
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
    }, 6000);
    return () => clearInterval(timer);
  }, [featuredItems.length]);

  const next = () => setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
  const prev = () => setCurrentIndex((prev) => (prev - 1 + featuredItems.length) % featuredItems.length);

  if (featuredItems.length === 0) return null;

  const currentItem = featuredItems[currentIndex];

  return (
    <section className="relative h-screen min-h-[700px] w-full overflow-hidden bg-white">
      <AnimatePresence mode="wait">
        <motion.div
          key={currentItem.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1 }}
          className="absolute inset-0"
        >
          {/* Background Image with Parallax-like feel */}
          <div className="absolute inset-0">
            <img
              src={currentItem.image || `https://picsum.photos/seed/${currentItem.name}/1920/1080`}
              alt={currentItem.name}
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/70 to-transparent w-full md:w-3/4"></div>
            <div className="absolute inset-0 bg-gradient-to-t from-white/90 via-white/20 to-transparent"></div>
          </div>

          {/* Content */}
          <div className="relative h-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center pt-20">
            <div className="max-w-2xl space-y-8">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="flex items-center space-x-3"
              >
                <span className="px-3 py-1 bg-[#8B0000] text-white text-[10px] font-bold uppercase tracking-[0.2em] rounded-full">
                  Top Pick
                </span>
                <div className="flex items-center space-x-1 text-[#D4AF37]">
                  <Star size={14} fill="currentColor" />
                  <span className="text-xs font-bold tracking-widest uppercase">Highly Rated</span>
                </div>
              </motion.div>

              <div className="space-y-4">
                <motion.h1
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-5xl md:text-8xl font-medium text-stone-900 leading-tight"
                >
                  {currentItem.name}
                </motion.h1>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="text-lg md:text-xl text-stone-600 font-light max-w-lg leading-relaxed"
                >
                  {currentItem.description}
                </motion.p>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="flex flex-wrap items-center gap-6"
              >
                <div className="text-3xl font-semibold tabular-nums text-[#8B0000]">
                  ₮{Math.round(currentItem.price).toLocaleString()}
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => addToCart(currentItem)}
                    className="px-8 py-4 bg-[#8B0000] text-white font-bold uppercase tracking-widest rounded-full hover:bg-[#6b0000] transition-all active:scale-95 flex items-center space-x-2 shadow-xl shadow-red-900/20"
                  >
                    <Plus size={20} />
                    <span>Add to Cart</span>
                  </button>
                  <Link
                    to="/menu"
                    className="px-8 py-4 border border-gray-300 text-stone-700 font-bold uppercase tracking-widest rounded-full hover:bg-gray-50 hover:border-[#D4AF37] transition-all active:scale-95"
                  >
                    View Menu
                  </Link>
                </div>
              </motion.div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Navigation Controls */}
      <div className="absolute bottom-12 right-4 sm:right-6 lg:right-8 flex items-center space-x-4">
        <div className="flex items-center space-x-2 mr-8">
          {featuredItems.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={cn(
                "h-1 transition-all duration-500 rounded-full",
                currentIndex === idx ? "w-8 bg-[#D4AF37]" : "w-4 bg-gray-300 hover:bg-gray-400"
              )}
            />
          ))}
        </div>
        <button
          onClick={prev}
          className="p-3 rounded-full border border-gray-200 text-stone-400 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-all active:scale-90 bg-white/50 backdrop-blur-sm"
        >
          <ChevronLeft size={24} />
        </button>
        <button
          onClick={next}
          className="p-3 rounded-full border border-gray-200 text-stone-400 hover:border-[#D4AF37] hover:text-[#D4AF37] transition-all active:scale-90 bg-white/50 backdrop-blur-sm"
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-12 left-1/2 -translate-x-1/2 flex flex-col items-center space-y-2"
      >
        <span className="text-[10px] uppercase tracking-[0.3em] text-stone-400 font-bold">Discover More</span>
        <div className="w-px h-12 bg-gradient-to-b from-[#8B0000] to-transparent"></div>
      </motion.div>
    </section>
  );
}
