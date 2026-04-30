import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChevronDown, ArrowRight, ShoppingBag, Star, Flame, Gem, Users, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, collection, onSnapshot, query, where, orderBy, limit } from '../firebase';
import { MenuItem } from '../types';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn, getScheduleLabel } from '../lib/utils';

export default function FeaturedDishes() {
  const [featuredItems, setFeaturedItems] = useState<MenuItem[]>([]);
  const { addToCart } = useCart();
  const { language } = useLanguage();
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const featuredQuery = query(
      collection(db, 'menu'),
      where('available', '==', true),
      where('featured', '==', true),
      limit(6)
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
          limit(6)
        );

        onSnapshot(mostOrderedQuery, (mostOrderedSnapshot) => {
          if (!mostOrderedSnapshot.empty) {
            const items = mostOrderedSnapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as MenuItem[];
            setFeaturedItems(items);
          } else {
            const fallbackQuery = query(collection(db, 'menu'), limit(6));
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
    const container = scrollRef.current;
    if (!container || featuredItems.length === 0) return;

    let animationFrameId: number;
    let accumulatedScroll = 0;

    const scroll = () => {
      if (!isHovered) {
        accumulatedScroll += 0.5; // Smooth slow rolling
        if (accumulatedScroll >= 1) {
          const pixelsToScroll = Math.floor(accumulatedScroll);
          
          if (container.scrollLeft + container.clientWidth >= container.scrollWidth - 1) {
             container.scrollLeft = 0;
          } else {
             container.scrollLeft += pixelsToScroll;
          }
          accumulatedScroll -= pixelsToScroll;
        }
      }
      animationFrameId = requestAnimationFrame(scroll);
    };

    animationFrameId = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isHovered, featuredItems]);

  if (featuredItems.length === 0) return null;

  return (
    <section className="relative w-full min-h-[100dvh] bg-gradient-to-b from-white via-stone-200 to-stone-950 flex flex-col justify-center overflow-hidden pt-20 pb-16 lg:pt-0 lg:pb-0">
      
      {/* Section header */}
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-6 lg:mb-8 shrink-0 relative z-10 flex items-baseline justify-between">
        <div>
          <div className="eyebrow mb-1.5">
            {language === 'en' ? 'Selected' : 'Онцлох'}
          </div>
          <h2 className="text-3xl sm:text-4xl font-serif font-bold text-stone-900 tracking-tight">
            {language === 'en' ? (
              <>Featured <em className="text-[#8B0000] not-italic font-medium">Dishes</em></>
            ) : (
              'Онцлох хоол'
            )}
          </h2>
        </div>
        <a
          href="/menu"
          className="hidden sm:inline-flex items-center gap-1.5 micro-label !text-stone-500 hover:!text-[#D4AF37] transition-colors"
        >
          {language === 'en' ? 'View all' : 'Бүгдийг харах'} <ArrowRight size={12} />
        </a>
      </div>

      {/* Horizontal Carousel List */}
      <div 
        ref={scrollRef}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onTouchStart={() => setIsHovered(true)}
        onTouchEnd={() => setIsHovered(false)}
        className="w-full overflow-x-auto px-4 sm:px-6 lg:px-8 relative z-10 flex-shrink-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pb-8 pt-4 -mt-4"
      >
        <div className="flex gap-4 sm:gap-6 w-max items-center after:content-[''] after:w-4 sm:after:w-8 lg:after:w-16 after:shrink-0">
          {featuredItems.map((item) => {
            const minPrice = Math.min(item.price, ...(item.portions?.map(p => p.price) || []));
            const isLuxury = item.category !== 'Drinks' && minPrice > 20000;
            const isSpicy = item.tags?.includes('spicy');
            const isForGroups = item.portions && item.portions.length >= 2;
            const scheduleLabel = getScheduleLabel(item);

            return (
              <div 
                key={item.id} 
                className="shrink-0 relative w-[85vw] sm:w-[50vw] md:w-[40vw] lg:w-[30vw] h-[58vh] min-h-[420px] max-h-[600px] rounded-3xl overflow-hidden shadow-2xl bg-stone-900 group border border-stone-700/50"
              >
                <img
                  src={item.image || `https://picsum.photos/seed/${item.name}/600/800`}
                  alt={item.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent" />
                
                {/* Keywords Marks (Top Left) */}
                <div className="absolute top-4 left-4 right-4 flex flex-wrap gap-1.5 items-start z-20">
                  {item.featured && (
                    <div className="flex items-center gap-1.5 bg-[#D4AF37]/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-[#D4AF37]/30">
                      <Star size={10} className="fill-white text-white" />
                      <span className="text-[9px] uppercase font-bold tracking-widest text-white">Featured</span>
                    </div>
                  )}
                  {isSpicy && (
                    <div className="flex items-center gap-1.5 bg-[#8B0000]/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-[#8B0000]/30">
                      <Flame size={10} className="text-white" />
                      <span className="text-[9px] uppercase font-bold tracking-widest text-white">Spicy</span>
                    </div>
                  )}
                  {isLuxury && (
                    <div className="flex items-center gap-1.5 bg-purple-600/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-purple-400/30">
                      <Gem size={10} className="text-white fill-white" />
                      <span className="text-[9px] uppercase font-bold tracking-widest text-white">Luxury</span>
                    </div>
                  )}
                  {isForGroups && (
                    <div className="flex items-center gap-1.5 bg-blue-500/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-blue-400/30">
                      <Users size={10} className="text-white fill-white" />
                      <span className="text-[9px] uppercase font-bold tracking-widest text-white">Recommend for Groups</span>
                    </div>
                  )}
                  {scheduleLabel && (
                    <div className="flex items-center gap-1.5 bg-stone-900/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-stone-700/50">
                      <Clock size={10} className="text-white" />
                      <span className="text-[9px] uppercase font-bold tracking-widest text-white">
                        {scheduleLabel}
                      </span>
                    </div>
                  )}
                </div>

                {/* Content (Bottom) */}
                <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-end pointer-events-none">
                  <div className="mb-4">
                    <span className="inline-block px-2.5 py-1 bg-stone-900/80 backdrop-blur-sm border border-stone-700/50 rounded-md text-[#D4AF37] text-[10px] uppercase tracking-widest font-bold mb-2 shadow-lg">
                      {item.category || (language === 'en' ? 'Featured' : 'Онцлох')}
                    </span>
                    <h3 className="text-2xl sm:text-3xl font-serif text-white font-bold tracking-tight leading-tight drop-shadow-lg">
                      {item.name}
                    </h3>
                  </div>
                  <div className="flex items-center gap-3 pointer-events-auto">
                    <button
                      onClick={() => addToCart(item)}
                      className="w-full px-4 py-2 sm:py-3 bg-[#D4AF37] text-stone-950 font-bold uppercase tracking-wider rounded-full hover:bg-[#C5A028] transition-colors text-xs lg:text-sm shadow-xl shadow-[#D4AF37]/20 flex items-center justify-center gap-2"
                    >
                      <ShoppingBag size={16} />
                      {language === 'en' ? 'Add To Cart' : 'Сагсанд Нэмэх'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {/* View Full Menu Card */}
          <Link
            to="/menu"
            className="shrink-0 relative w-[85vw] sm:w-[50vw] md:w-[40vw] lg:w-[30vw] h-[58vh] min-h-[420px] max-h-[600px] rounded-3xl overflow-hidden shadow-2xl bg-stone-900/60 backdrop-blur-sm border border-stone-700/50 hover:border-[#D4AF37]/50 transition-colors group flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-[#D4AF37]/10 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:bg-[#D4AF37]/20 transition-all duration-300">
              <ArrowRight size={28} className="text-[#D4AF37]" />
            </div>
            <h3 className="text-2xl sm:text-3xl font-serif font-bold text-white mb-3">
              {language === 'en' ? 'Explore Full Menu' : 'Бүтэн цэстэй танилцах'}
            </h3>
            <p className="text-stone-300 text-sm max-w-[200px]">
              {language === 'en' ? 'Discover all our culinary offerings' : 'Манай бүх хоолны сонголттой танилцана уу'}
            </p>
          </Link>
        </div>
      </div>

      {/* Global Controls at Bottom */}
      <div className="absolute bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 flex items-center justify-center pointer-events-none z-20">
        <div className="flex flex-col items-center pointer-events-auto">
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-stone-500 flex flex-col items-center"
          >
            <span className="hidden lg:block text-[10px] uppercase tracking-[0.2em] font-bold mb-2 text-stone-400 drop-shadow-md">Scroll</span>
            <div className="w-px h-6 sm:h-8 bg-gradient-to-b from-[#D4AF37] to-transparent"></div>
            <ChevronDown size={14} className="text-[#D4AF37] mt-1" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
