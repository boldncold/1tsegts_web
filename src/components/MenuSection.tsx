import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, ShoppingCart, Star, Filter, Search, Flame, Users, Gem, Clock, ShoppingBag } from 'lucide-react';
import { db, collection, onSnapshot, query, where, orderBy } from '../firebase';
import { MenuItem, Category, Portion } from '../types';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn, isStoreOpen, getDynamicStatus } from '../lib/utils';
import TraditionalMenuSection from './TraditionalMenuSection';

export default function MenuSection() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPortions, setSelectedPortions] = useState<Record<string, Portion>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [viewMode, setViewMode] = useState<'modern' | 'traditional'>('modern');
  const { addToCart } = useCart();
  const { t } = useLanguage();
  const location = useLocation();

  // Filter out 'Draft' items and categories with no items
  const visibleItems = items.filter(item => {
    const { isVisible } = getDynamicStatus(item);
    return isVisible;
  });
  const categoriesWithItems = ['All', ...['Draft', 'European', 'Asian', 'Mongolian', 'Drinks'].filter(cat => 
    visibleItems.some(item => item.category === cat)
  )] as (Category | 'All')[];

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
        // Handle legacy 'Specials' category
        if (data.category === 'Specials') {
          data.category = 'Mongolian';
        }
        // Ensure doc.id is used and not overwritten by any 'id' field in data
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
    const matchesCategory = activeCategory === 'All' || item.category === activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         item.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryLabel = (cat: Category | 'All') => {
    switch (cat) {
      case 'All': return t('menu.all');
      case 'European': return t('menu.european');
      case 'Asian': return t('menu.asian');
      case 'Drinks': return t('menu.drinks');
      case 'Mongolian': return t('menu.mongolian');
      case 'Draft': return t('menu.specials');
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

      // Limited Time: +10 points
      if (item.status === 'daily_special' && item.statusUntil) score += 10;

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

  if (viewMode === 'traditional') {
    return (
      <div className="relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-4">
          <div className="flex justify-end">
            <button 
              onClick={() => setViewMode('modern')}
              className="group flex items-center gap-2 px-6 py-2.5 rounded-full border border-stone-200 bg-white hover:border-[#8B0000] hover:text-[#8B0000] transition-all text-[11px] font-bold uppercase tracking-widest text-stone-600 shadow-sm"
            >
              <Filter size={14} className="group-hover:rotate-180 transition-transform duration-500" />
              Switch to Grid View
            </button>
          </div>
        </div>
        <TraditionalMenuSection items={visibleItems} />
      </div>
    );
  }

  return (
    <section id="menu-section" className="pt-20 pb-16 bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        
        <div className="flex flex-col items-center mb-6 border-b border-stone-100 pb-4 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-2 mb-4"
          >
            <span className="text-[10px] uppercase tracking-[0.4em] text-[#D4AF37] font-bold">{t('menu.selection')}</span>
            <h2 className="text-4xl md:text-5xl font-serif text-stone-900 italic">{t('menu.title')}</h2>
          </motion.div>

          <div className="hidden sm:block">
            <button 
              onClick={() => setViewMode('traditional')}
              className="group flex items-center gap-3 px-6 py-3 rounded-full border border-stone-200 bg-white hover:border-[#8B0000] hover:text-[#8B0000] transition-all text-[10px] font-bold uppercase tracking-widest text-stone-500 shadow-sm"
            >
              <Clock size={14} className="group-hover:scale-110 transition-transform" />
              Traditional Menu
            </button>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-4">
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
            
            {/* View Switch for Mobile */}
            <button
              onClick={() => setViewMode('traditional')}
              className="sm:hidden px-5 py-2.5 rounded-full text-[10px] uppercase tracking-widest transition-all duration-300 border border-stone-200 bg-white text-[#8B0000] font-bold flex items-center gap-2"
            >
              <Clock size={12} />
              Traditional
            </button>
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
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 grid-flow-row-dense">
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
                const isForGroups = hasManyPortions; // Drinks can still be groups if they have sizes
                const isLimitedTime = item.status === 'daily_special' && item.statusUntil;
                const isSpicy = item.tags?.includes('spicy');

                return (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                    className={cn(
                      "group relative h-[360px] sm:h-[380px] md:h-[420px] rounded-[1.5rem] md:rounded-[2.5rem] overflow-hidden bg-stone-200 shadow-md hover:shadow-2xl transition-all duration-700",
                      !isAvailable ? "opacity-75 grayscale-[0.5]" : ""
                    )}
                  >
                    {/* Background Image */}
                    <img
                      src={item.image || `https://picsum.photos/seed/${item.name}/800/1000`}
                      alt={item.name}
                      className="absolute inset-0 w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                      referrerPolicy="no-referrer"
                    />

                    {/* Overlays */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-500" />
                    
                    {!isAvailable && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-10">
                        <span className="bg-white/90 backdrop-blur text-stone-900 px-6 py-2 rounded-full font-bold tracking-widest uppercase text-xs shadow-xl">
                          {t('menu.soldOut')}
                        </span>
                      </div>
                    )}
                    
                    {/* Top Badges */}
                    <div className="absolute top-3 left-3 md:top-5 md:left-5 flex flex-col gap-1.5 items-start z-20">
                      {item.featured && (
                        <div className="flex items-center gap-1 bg-[#D4AF37] px-2 py-0.5 rounded-full shadow-lg">
                          <Star size={8} className="fill-white text-white" />
                          <span className="text-[7px] md:text-[9px] uppercase font-bold tracking-widest text-white">Featured</span>
                        </div>
                      )}
                      {isPopular && (
                        <div className="flex items-center gap-1 bg-orange-500 px-2 py-0.5 rounded-full shadow-lg">
                          <Flame size={8} className="text-white fill-white" />
                          <span className="text-[7px] md:text-[9px] uppercase font-bold tracking-widest text-white">Popular</span>
                        </div>
                      )}
                      {isSpicy && (
                        <div className="flex items-center gap-1 bg-red-600 px-2 py-0.5 rounded-full shadow-lg">
                          <Flame size={8} className="text-white" />
                          <span className="text-[7px] md:text-[9px] uppercase font-bold tracking-widest text-white">Spicy</span>
                        </div>
                      )}
                      {isLuxury && (
                        <div className="flex items-center gap-1 bg-purple-600 px-2 py-0.5 rounded-full shadow-lg">
                          <Gem size={8} className="text-white fill-white" />
                          <span className="text-[7px] md:text-[9px] uppercase font-bold tracking-widest text-white">Luxury</span>
                        </div>
                      )}
                      {isForGroups && (
                        <div className="flex items-center gap-1 bg-blue-500 px-2 py-0.5 rounded-full shadow-lg">
                          <Users size={8} className="text-white fill-white" />
                          <span className="text-[7px] md:text-[9px] uppercase font-bold tracking-widest text-white">Group</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Content Area */}
                    <div className="absolute inset-x-0 bottom-0 p-3 md:p-6 z-20 flex flex-col justify-end min-h-[65%] md:min-h-[50%]">
                      <div className="space-y-2 md:space-y-2 md:translate-y-4 md:group-hover:translate-y-0 transition-transform duration-500">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] uppercase tracking-[0.2em] md:tracking-[0.3em] text-[#D4AF37] font-bold">
                            {getCategoryLabel(item.category)}
                          </span>
                        </div>
                        
                        <div className="flex flex-col gap-1">
                          <h3 className="text-base md:text-2xl font-medium text-white leading-tight group-hover:text-[#D4AF37] transition-colors line-clamp-2">
                            {item.name}
                          </h3>
                          <div className="inline-flex bg-white/10 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/20 self-start">
                            <span className="text-white font-bold tabular-nums text-xs md:text-sm">
                              ₮{Math.round(displayPrice).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <p className="hidden md:block text-xs text-white/80 font-light leading-relaxed line-clamp-2 md:opacity-0 md:group-hover:opacity-100 transition-all duration-500 md:delay-100">
                          {item.description}
                        </p>

                        {item.portions && item.portions.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-1 md:pt-2 md:opacity-0 md:group-hover:opacity-100 transition-all duration-500 md:delay-200">
                            {[{ name: 'Default', price: item.price }, ...item.portions].map((portion, idx) => (
                              <button
                                key={idx}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePortionSelect(item.id, portion);
                                }}
                                className={cn(
                                  "px-2 py-1 rounded text-[10px] md:text-[10px] font-medium transition-all border flex-1 md:flex-none",
                                  currentPortion?.name === portion.name
                                    ? "bg-[#D4AF37] text-white border-[#D4AF37]"
                                    : "bg-white/10 text-white/80 border-white/20 hover:border-white/40"
                                )}
                              >
                                {portion.name}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="pt-2 md:pt-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2 md:gap-0 md:opacity-0 md:group-hover:opacity-100 transition-all duration-500 md:delay-300">
                          <div className="flex items-center justify-between md:justify-center space-x-4 bg-white/10 backdrop-blur-md rounded-lg md:rounded-full px-3 py-1.5 md:px-2 md:py-1 border border-white/20">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.id, -1); }}
                              className="p-1.5 text-white/80 hover:text-white transition-colors"
                            >
                              <Minus size={14} md:size={12} />
                            </button>
                            <span className="text-sm md:text-xs font-bold text-white min-w-[20px] md:min-w-[16px] text-center tabular-nums">{quantities[item.id] || 1}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleQuantityChange(item.id, 1); }}
                              className="p-1.5 text-white/80 hover:text-white transition-colors"
                            >
                              <Plus size={14} md:size={12} />
                            </button>
                          </div>

                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              addToCart(item, currentPortion, quantities[item.id] || 1);
                              setQuantities(prev => ({ ...prev, [item.id]: 1 }));
                            }}
                            disabled={!isAvailable || !isStoreOpen()}
                            className={cn(
                              "flex items-center justify-center space-x-2 py-2 md:px-5 md:py-2.5 rounded-lg md:rounded-full text-[10px] font-bold uppercase tracking-[0.1em] transition-all active:scale-95 w-full md:w-auto",
                              isAvailable && isStoreOpen()
                                ? "bg-[#8B0000] text-white hover:bg-[#A00000] shadow-lg shadow-black/20" 
                                : "bg-white/20 text-white/50 cursor-not-allowed"
                            )}
                          >
                            <ShoppingBag size={14} className="md:size-[12px]" />
                            <span>{!isStoreOpen() ? t('menu.closed') : item.available ? t('menu.add_to_cart') : t('menu.sold_out')}</span>
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
