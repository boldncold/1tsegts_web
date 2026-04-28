import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, ShoppingCart, Star, Filter, Search, Flame, Users, Gem, Clock } from 'lucide-react';
import { db, collection, onSnapshot, query, where, orderBy } from '../firebase';
import { MenuItem, Category, Portion } from '../types';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { cn, isStoreOpen, getDynamicStatus } from '../lib/utils';

export default function MenuSection() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | 'All' | 'Specials'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedPortions, setSelectedPortions] = useState<Record<string, Portion>>({});
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const { addToCart } = useCart();
  const { t } = useLanguage();
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
            <span className="text-xs uppercase tracking-[0.3em] text-[#D4AF37] font-semibold">{t('menu.selection')}</span>
            <h2 className="text-4xl md:text-6xl font-medium text-stone-900">{t('menu.title')}</h2>
            <div className="w-24 h-px bg-[#D4AF37] mx-auto mt-4"></div>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 grid-flow-row-dense">
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
                      "group bg-white border border-gray-100 rounded-3xl overflow-hidden hover:shadow-xl hover:border-[#D4AF37]/30 transition-all duration-500 flex flex-col shadow-sm",
                      hasManyPortions ? "md:col-span-2" : "",
                      !isAvailable ? "opacity-75 grayscale-[0.5]" : ""
                    )}
                  >
                    <div className="relative h-64 overflow-hidden flex-shrink-0">
                      <img
                        src={item.image || `https://picsum.photos/seed/${item.name}/800/600`}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                        referrerPolicy="no-referrer"
                      />
                      {!isAvailable && (
                        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-10">
                          <span className="bg-white text-stone-900 px-6 py-2 rounded-full font-bold tracking-widest uppercase text-sm shadow-xl">
                            {t('menu.soldOut')}
                          </span>
                        </div>
                      )}
                      
                      <div className="absolute top-4 left-4 flex flex-col gap-1.5 items-start z-20">
                        {/* Featured */}
                        {item.featured && (
                          <div className="flex items-center gap-1.5 bg-[#D4AF37]/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-[#D4AF37]/30">
                            <Star size={10} className="fill-white text-white" />
                            <span className="text-[9px] uppercase font-bold tracking-widest text-white">Featured</span>
                          </div>
                        )}

                        {/* Popular */}
                        {isPopular && (
                          <div className="flex items-center gap-1.5 bg-orange-500/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-orange-400/30">
                            <Flame size={10} className="text-white fill-white" />
                            <span className="text-[9px] uppercase font-bold tracking-widest text-white">Popular</span>
                          </div>
                        )}

                        {/* Spicy */}
                        {isSpicy && (
                          <div className="flex items-center gap-1.5 bg-[#8B0000]/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-[#8B0000]/30">
                            <Flame size={10} className="text-white" />
                            <span className="text-[9px] uppercase font-bold tracking-widest text-white">Spicy</span>
                          </div>
                        )}

                        {/* Luxury */}
                        {isLuxury && (
                          <div className="flex items-center gap-1.5 bg-purple-600/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-purple-400/30">
                            <Gem size={10} className="text-white fill-white" />
                            <span className="text-[9px] uppercase font-bold tracking-widest text-white">Luxury</span>
                          </div>
                        )}

                        {/* Groups */}
                        {isForGroups && (
                          <div className="flex items-center gap-1.5 bg-blue-500/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-blue-400/30">
                            <Users size={10} className="text-white fill-white" />
                            <span className="text-[9px] uppercase font-bold tracking-widest text-white">Recommend for Groups</span>
                          </div>
                        )}

                        {/* Limited Time */}
                        {isLimitedTime && (
                          <div className="flex items-center gap-1.5 bg-stone-900/90 backdrop-blur-sm px-2.5 py-1 rounded-full shadow-lg border border-stone-700/50">
                            <Clock size={10} className="text-white" />
                            <span className="text-[9px] uppercase font-bold tracking-widest text-white">
                              Ends {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(item.statusUntil!))}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full border border-gray-100 shadow-lg z-20">
                        <span className="text-[#D4AF37] font-bold tabular-nums">₮{Math.round(displayPrice).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="p-6 flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold">{getCategoryLabel(item.pool === 'specials' ? 'Specials' : item.category)}</p>
                          </div>
                          <h3 className="text-xl font-medium text-stone-900 group-hover:text-[#8B0000] transition-colors">{item.name}</h3>
                        </div>
                      </div>
                      <p className={cn(
                        "text-sm text-stone-500 font-light leading-relaxed mb-4 flex-1",
                        hasManyPortions ? "line-clamp-4" : "line-clamp-2"
                      )}>
                        {item.description}
                      </p>

                      {item.portions && item.portions.length > 0 && (
                        <div className="mb-4">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-400 font-semibold mb-2">Select Portion</p>
                          <div className={cn(
                            "grid gap-2",
                            hasManyPortions ? "grid-cols-2" : "grid-cols-1"
                          )}>
                            {[{ name: 'Default', price: item.price }, ...item.portions].map((portion, idx) => (
                              <button
                                key={idx}
                                onClick={() => handlePortionSelect(item.id, portion)}
                                className={cn(
                                  "flex justify-between items-center px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                                  currentPortion?.name === portion.name
                                    ? "bg-[#D4AF37]/10 text-[#D4AF37] border-[#D4AF37]/50"
                                    : "bg-gray-50 text-stone-500 border-gray-200 hover:border-gray-300 hover:text-stone-700"
                                )}
                              >
                                <span className="tracking-wide">{portion.name}</span>
                                <span className="tabular-nums font-semibold">₮{portion.price.toLocaleString()}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-auto">
                        {(!item.portions || item.portions.length === 0) && (
                          <div className="flex items-center space-x-3 bg-gray-50 rounded-full px-2 py-1 border border-gray-200">
                            <button
                              onClick={() => handleQuantityChange(item.id, -1)}
                              className="p-1 text-stone-400 hover:text-[#8B0000] transition-colors"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="text-sm font-semibold text-stone-700 min-w-[20px] text-center tabular-nums">{quantities[item.id] || 1}</span>
                            <button
                              onClick={() => handleQuantityChange(item.id, 1)}
                              className="p-1 text-stone-400 hover:text-[#8B0000] transition-colors"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                        )}
                        <button
                          onClick={() => {
                            addToCart(item, currentPortion, quantities[item.id] || 1);
                            setQuantities(prev => ({ ...prev, [item.id]: 1 }));
                          }}
                          disabled={!isAvailable || !isStoreOpen()}
                          className={cn(
                            "flex items-center space-x-2 px-5 py-2.5 rounded-full text-xs font-semibold uppercase tracking-[0.15em] transition-all active:scale-95",
                            (!item.portions || item.portions.length === 0) ? "" : "w-full justify-center",
                            isAvailable && isStoreOpen()
                              ? "bg-[#8B0000] text-white hover:bg-[#6b0000] hover:shadow-[0_0_15px_rgba(212,175,55,0.3)]" 
                              : "bg-gray-200 text-gray-400 cursor-not-allowed"
                          )}
                        >
                          <Plus size={14} />
                          <span>{!isStoreOpen() ? t('menu.closed') : item.available ? t('menu.add_to_cart') : t('menu.sold_out')}</span>
                        </button>
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
