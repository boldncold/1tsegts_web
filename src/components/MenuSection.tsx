import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, ShoppingCart, Star, Filter, Search, Flame, Users, Gem, Clock } from 'lucide-react';
import { db, collection, onSnapshot, query, where, orderBy } from '../firebase';
import { MenuItem, Category, Portion } from '../types';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useStoreSettings } from '../context/StoreSettingsContext';
import { cn, getDynamicStatus, getScheduleLabel } from '../lib/utils';

export default function MenuSection() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | 'All' | 'Specials'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPortions, setSelectedPortions] = useState<Record<string, Portion>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { addToCart } = useCart();
  const { t } = useLanguage();
  const { storeOpen } = useStoreSettings();
  const location = useLocation();

  // Filter out 'Draft' items (unpublished) — pool=specials and regular categories are visible
  const visibleItems = items.filter(item => {
    if (item.category === 'Draft' && item.pool !== 'specials') return false;
    const { isVisible } = getDynamicStatus(item);
    return isVisible;
  });
  const categoriesWithItems = ['All', ...['Specials', 'European', 'Asian', 'Mongolian', 'Drinks'].filter(cat => {
    if (cat === 'Specials') return visibleItems.some(i => i.pool === 'specials');
    return visibleItems.some(i => i.category === cat && i.pool !== 'specials');
  })] as (Category | 'All' | 'Specials')[];

  useEffect(() => {
    // Check for category in URL
    const params = new URLSearchParams(location.search);
    const catParam = params.get('category') as Category | null;
    if (catParam && categoriesWithItems.includes(catParam)) {
      setActiveCategory(catParam);
      // Scroll to menu section if category is provided
      setTimeout(() => {
        const element = document.getElementById('menu-section');
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    }
  }, [location.search]);

  useEffect(() => {
    const q = query(collection(db, 'menu'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const menuItems = snapshot.docs.map(doc => {
        const data = doc.data();
        const { id, ...rest } = data;
        return {
          id: doc.id,
          ...rest,
          portions: data.portions ? data.portions.filter((p: any) => p.available !== false) : []
        } as MenuItem;
      });
      setItems(menuItems);
      
      // Initialize selected portions for items that have them
      const initialPortions: Record<string, Portion> = {};
      menuItems.forEach(item => {
        if (item.portions && item.portions.length > 0) {
          initialPortions[item.id] = { name: 'Default', price: item.price };
        }
      });
      setSelectedPortions(initialPortions);
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredItems = visibleItems.filter(item => {
    let matchesCategory: boolean;
    if (activeCategory === 'All') {
      matchesCategory = true;
    } else if (activeCategory === 'Specials') {
      matchesCategory = item.pool === 'specials';
    } else {
      matchesCategory = item.category === activeCategory && item.pool !== 'specials';
    }
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryLabel = (cat: Category | 'All' | 'Specials') => {
    switch (cat) {
      case 'All': return t('menu.all');
      case 'European': return t('menu.european');
      case 'Asian': return t('menu.asian');
      case 'Drinks': return t('menu.drinks');
      case 'Mongolian': return t('menu.mongolian');
      case 'Specials': return t('menu.specials');
      default: return cat;
    }
  };

  const handlePortionSelect = (itemId: string, portion: Portion) => {
    setSelectedPortions(prev => ({ ...prev, [itemId]: portion }));
  };

  const handleQuantityChange = (itemId: string, delta: number) => {
    setQuantities(prev => ({
      ...prev,
      [itemId]: Math.max(1, (prev[itemId] || 1) + delta)
    }));
  };

  // Pre-calculate thresholds for dynamic keywords (Excluding Drinks)
  const foodItems = items.filter(i => i.category !== 'Drinks');
  const top15OrderCounts = [...foodItems]
    .map(i => i.orderCount || 0)
    .filter(count => count > 0)
    .sort((a, b) => b - a)
    .slice(0, 15);
  const popularThreshold = top15OrderCounts.length > 0 ? top15OrderCounts[top15OrderCounts.length - 1] : Infinity;

  // Smart Sorting Algorithm using Point System
  const sortedItems = [...filteredItems].sort((a, b) => {
    const aAvailable = getDynamicStatus(a).isAvailable;
    const bAvailable = getDynamicStatus(b).isAvailable;

    // 1. Availability: Out of stock always at bottom
    if (aAvailable && !bAvailable) return -1;
    if (!aAvailable && bAvailable) return 1;

    // 2. Separate Foods from Drinks (Drinks go to bottom, but before Out of Stock)
    const aIsDrink = a.category === 'Drinks';
    const bIsDrink = b.category === 'Drinks';
    if (!aIsDrink && bIsDrink) return -1;
    if (aIsDrink && !bIsDrink) return 1;

    // 3. If both are Drinks, bypass point system and sort alphabetically
    if (aIsDrink && bIsDrink) {
      return a.name.localeCompare(b.name);
    }

    const getScore = (item: MenuItem) => {
      let score = 0;
      // Featured: +15 points
      if (item.featured) score += 15;
      
      // Popular (top 15 food items): +7 points
      const isPopular = (item.orderCount || 0) > 0 && (item.orderCount || 0) >= popularThreshold;
      if (isPopular) score += 7;

      // Scheduled (today only or matching day): +10 points
      if (item.todayOnly || (item.scheduledDays && item.scheduledDays.length > 0 && item.scheduledDays.includes(new Date().getDay()))) score += 10;

      // Group (many portions): +5 points
      if (item.portions && item.portions.length >= 2) score += 5;

      // Luxury (default and all portions > 20,000 tugrugs): +5 points
      const minPrice = Math.min(item.price, ...(item.portions?.map(p => p.price) || []));
      if (minPrice > 20000) score += 5;

      return score;
    };

    const aScore = getScore(a);
    const bScore = getScore(b);

    // 4. Sort Foods by highest priority score
    if (aScore !== bScore) {
      return bScore - aScore;
    }

    // 5. Tie-breaker: Highest order count
    const aOrders = a.orderCount || 0;
    const bOrders = b.orderCount || 0;
    if (aOrders !== bOrders) return bOrders - aOrders;

    // 6. Default: Alphabetical
    return a.name.localeCompare(b.name);
  });

  return (
    <section id="menu-section" className="py-24 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-4"
          >
            <span className="eyebrow">{t('menu.selection')}</span>
            <h2 className="text-4xl md:text-5xl font-serif font-bold text-stone-900">{t('menu.title')}</h2>
            <div className="w-16 h-px bg-[#D4AF37] mx-auto mt-2 opacity-60"></div>
          </motion.div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-12">
          {/* Category Filter */}
          <div className="flex flex-wrap justify-center md:justify-start gap-3">
            {categoriesWithItems.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-5 py-2.5 rounded-full text-[10px] uppercase tracking-widest transition-all duration-300 border",
                  activeCategory === cat
                    ? "bg-[#8B0000] text-white border-[#8B0000] font-semibold shadow-lg shadow-red-900/20"
                    : "bg-white text-stone-500 border-gray-200 hover:border-[#D4AF37] hover:text-[#D4AF37]"
                )}
              >
                {getCategoryLabel(cat)}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-80">
            <input
              type="text"
              placeholder={t('menu.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-full px-12 py-3 text-sm text-stone-900 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-400" size={18} />
          </div>
        </div>

        {/* Menu Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-12 h-12 border-4 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 grid-flow-row-dense">
            <AnimatePresence mode="popLayout">
              {sortedItems.map((item) => {
                const currentPortion = selectedPortions[item.id] || (item.portions && item.portions.length > 0 ? { name: 'Default', price: item.price } : undefined);
                const displayPrice = currentPortion ? currentPortion.price : item.price;
                const hasManyPortions = item.portions && item.portions.length >= 2;
                const { isAvailable } = getDynamicStatus(item);

                const isDrink = item.category === 'Drinks';
                const isPopular = !isDrink && popularThreshold !== Infinity && item.orderCount !== undefined && item.orderCount > 0 && item.orderCount >= popularThreshold;
                const minPrice = Math.min(item.price, ...(item.portions?.map(p => p.price) || []));
                const isLuxury = !isDrink && minPrice > 20000;
                const isForGroups = hasManyPortions;
                const scheduleLabel = getScheduleLabel(item);
                const isSpicy = item.tags?.includes('spicy');
                const qty = quantities[item.id] || 1;

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.25 }}
                    className={cn(
                      "group bg-white border border-stone-200 rounded-3xl overflow-hidden flex flex-col shadow-sm",
                      "transition-all duration-250 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-10px_rgba(0,0,0,0.12)] hover:border-stone-300",
                      !isAvailable ? "opacity-70" : ""
                    )}
                  >
                    {/* Image — 4:3 aspect ratio */}
                    <div className="relative aspect-[4/3] overflow-hidden flex-shrink-0">
                      <img
                        src={item.image || `https://picsum.photos/seed/${item.name}/800/600`}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        referrerPolicy="no-referrer"
                      />

                      {/* Sold out overlay */}
                      {!isAvailable && (
                        <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center z-10">
                          <span className="bg-white text-stone-900 px-5 py-1.5 rounded-full font-bold tracking-[0.18em] uppercase text-[11px] shadow-xl">
                            {t('menu.sold_out')}
                          </span>
                        </div>
                      )}

                      {/* Badges — top left, stacked */}
                      <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start z-20">
                        {item.featured && (
                          <span className="inline-flex items-center gap-1 bg-[rgba(212,175,55,0.92)] backdrop-blur-sm px-2.5 py-[5px] rounded-full text-[9px] font-bold uppercase tracking-[0.18em] text-white shadow-md">
                            <Star size={9} className="fill-white" /> Featured
                          </span>
                        )}
                        {isPopular && (
                          <span className="inline-flex items-center gap-1 bg-orange-500/90 backdrop-blur-sm px-2.5 py-[5px] rounded-full text-[9px] font-bold uppercase tracking-[0.18em] text-white shadow-md">
                            <Flame size={9} className="fill-white" /> Popular
                          </span>
                        )}
                        {isSpicy && (
                          <span className="inline-flex items-center gap-1 bg-[rgba(139,0,0,0.9)] backdrop-blur-sm px-2.5 py-[5px] rounded-full text-[9px] font-bold uppercase tracking-[0.18em] text-white shadow-md">
                            <Flame size={9} /> Spicy
                          </span>
                        )}
                        {isLuxury && (
                          <span className="inline-flex items-center gap-1 bg-purple-600/90 backdrop-blur-sm px-2.5 py-[5px] rounded-full text-[9px] font-bold uppercase tracking-[0.18em] text-white shadow-md">
                            <Gem size={9} className="fill-white" /> Luxury
                          </span>
                        )}
                        {isForGroups && (
                          <span className="inline-flex items-center gap-1 bg-blue-500/90 backdrop-blur-sm px-2.5 py-[5px] rounded-full text-[9px] font-bold uppercase tracking-[0.18em] text-white shadow-md">
                            <Users size={9} /> Groups
                          </span>
                        )}
                        {scheduleLabel && (
                          <span className="inline-flex items-center gap-1 bg-stone-900/90 backdrop-blur-sm px-2.5 py-[5px] rounded-full text-[9px] font-bold uppercase tracking-[0.18em] text-white shadow-md">
                            <Clock size={9} /> {scheduleLabel}
                          </span>
                        )}
                      </div>

                      {/* Price pill — top right */}
                      <div className="absolute top-3 right-3 z-20 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md border border-white/60">
                        <span className="font-bold text-[13px] text-[#D4AF37] tabular-nums">₮{Math.round(displayPrice).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="p-[18px_20px_20px] flex flex-col flex-1" style={{ padding: '18px 20px 20px' }}>
                      {/* Category */}
                      <p className="text-[9px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-1">
                        {getCategoryLabel(item.pool === 'specials' ? 'Specials' : item.category)}
                      </p>
                      {/* Name */}
                      <h3 className="font-serif font-bold text-[17px] leading-snug text-stone-900 mb-2 group-hover:text-[#8B0000] transition-colors" style={{ letterSpacing: '-0.005em' }}>
                        {item.name}
                      </h3>
                      {/* Description */}
                      <p className={cn(
                        "text-stone-500 font-light leading-[1.55] mb-3 flex-1",
                        "line-clamp-2"
                      )} style={{ fontSize: '13px' }}>
                        {item.description}
                      </p>

                      {/* Portion selector */}
                      {item.portions && item.portions.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[9px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-2">Select Portion</p>
                          <div className="grid gap-1.5 grid-cols-1">
                            {[{ name: 'Default', price: item.price }, ...item.portions].map((portion, idx) => (
                              <button
                                key={idx}
                                onClick={() => handlePortionSelect(item.id, portion)}
                                className={cn(
                                  "flex justify-between items-center px-3.5 py-2 rounded-full text-[11px] font-semibold transition-all border",
                                  currentPortion?.name === portion.name
                                    ? "bg-[rgba(212,175,55,0.1)] text-[#D4AF37] border-[rgba(212,175,55,0.5)]"
                                    : "bg-gray-50 text-stone-500 border-gray-200 hover:border-gray-300 hover:text-stone-700"
                                )}
                              >
                                <span>{portion.name}</span>
                                <span className="tabular-nums font-bold">₮{portion.price.toLocaleString()}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Bottom row: price + qty stepper / add button */}
                      <div className="flex items-center justify-between pt-3.5 border-t border-gray-100 mt-auto gap-3">
                        {/* Price (bottom left) */}
                        <span className="font-serif font-bold text-[#8B0000] text-[17px] tabular-nums leading-none">
                          ₮{Math.round(displayPrice).toLocaleString()}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Qty stepper — only for single-portion items */}
                          {(!item.portions || item.portions.length === 0) && isAvailable && storeOpen && (
                            <div className="inline-flex items-center gap-1 bg-[#1a1510] rounded-full p-1">
                              <button
                                onClick={() => handleQuantityChange(item.id, -1)}
                                className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[#D4AF37] hover:bg-white/10 transition-colors"
                              >
                                <Minus size={11} />
                              </button>
                              <span className="min-w-[18px] text-center text-[13px] font-bold text-white tabular-nums">{qty}</span>
                              <button
                                onClick={() => handleQuantityChange(item.id, 1)}
                                className="w-[26px] h-[26px] rounded-full bg-[#D4AF37] flex items-center justify-center text-[#1a1510] hover:bg-[#C5A028] transition-colors"
                              >
                                <Plus size={11} />
                              </button>
                            </div>
                          )}

                          {/* Add / disabled button */}
                          <button
                            onClick={() => {
                              addToCart(item, currentPortion, quantities[item.id] || 1);
                              setQuantities(prev => ({ ...prev, [item.id]: 1 }));
                            }}
                            disabled={!isAvailable || !storeOpen}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-[0.14em] transition-all active:scale-95",
                              isAvailable && storeOpen
                                ? "bg-[#8B0000] text-white hover:bg-[#6b0000] shadow-sm"
                                : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            )}
                          >
                            <Plus size={12} />
                            {!storeOpen ? t('menu.closed') : isAvailable ? t('menu.add_to_cart') : t('menu.sold_out')}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {!loading && filteredItems.length === 0 && (
          <div className="text-center py-20">
            <p className="text-stone-500 text-lg italic">{t('menu.no_items')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
