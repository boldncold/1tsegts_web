import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus, Search, Flame, Clock, ShieldCheck } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MenuItem, Category, Portion } from '../types';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useStoreSettings } from '../context/StoreSettingsContext';
import { useAuth } from '../context/AuthContext';
import { cn, getDynamicStatus, getScheduleLabel } from '../lib/utils';

const DISH_FALLBACK_BG =
  'radial-gradient(ellipse 55% 35% at 50% 24%, rgba(232,200,90,0.28), transparent 70%), radial-gradient(ellipse 95% 65% at 50% 30%, rgba(212,175,55,0.22), transparent 65%), radial-gradient(ellipse 70% 45% at 50% 100%, rgba(212,175,55,0.10), transparent 70%), linear-gradient(180deg, #17120a 0%, #0a0806 100%)';

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
  const { isAdmin } = useAuth();
  const location = useLocation();
  const effectiveStoreOpen = storeOpen || isAdmin;

  // Filter out 'Draft' items (unpublished) — pool=specials and regular categories are visible.
  // Admins (test mode) see items even if sold out / out of schedule, so the visibility
  // gate is skipped for them. Drafts stay hidden — they're truly unpublished.
  const visibleItems = items.filter(item => {
    if (item.category === 'Draft' && item.pool !== 'specials') return false;
    if (isAdmin) return true;
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

  const menu = useQuery(api.menu.list);

  useEffect(() => {
    if (menu === undefined) return; // still loading
    // Cast at the boundary: the schema's category also admits legacy
    // 'Specials', which the UI groups by `pool` instead.
    const menuItems = menu.map(item => ({
      ...item,
      portions: item.portions ? item.portions.filter(p => p.available !== false) : []
    })) as MenuItem[];
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
  }, [menu]);

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
  // The badge is stricter than the sort boost: on a ~40-dish menu, "top 15" would
  // label a third of the cards, and a badge on everything means nothing.
  const badgeThreshold = top15OrderCounts.length >= 5 ? top15OrderCounts[4] : Infinity;

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
    <section id="menu-section" className="py-24 bg-[var(--surface-page)] min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 flex flex-col items-center gap-4">
          {isAdmin && (
            <span className="label inline-flex items-center gap-1.5 rounded-full border border-[var(--gold-soft-30)] bg-[var(--gold-soft-10)] px-3 py-1.5">
              <ShieldCheck size={14} />
              {t('cart.admin.test_mode_hint')}
            </span>
          )}
          <h2>{t('menu.title')}</h2>
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
                  "px-4 py-2 rounded-full text-sm font-medium transition-colors border",
                  activeCategory === cat
                    ? "bg-[var(--gold)] text-[var(--text-on-gold)] border-[var(--gold)]"
                    : "bg-transparent text-[var(--text-secondary)] border-[var(--white-15)] hover:border-[var(--gold)] hover:text-[var(--gold)]"
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
              className="w-full bg-[var(--white-04)] border border-[var(--white-15)] rounded-full px-12 py-3 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--gold)] focus:ring-1 focus:ring-[var(--gold)] transition-colors"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/40" size={18} />
          </div>
        </div>

        {/* Menu Grid */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-12 h-12 border-4 border-[var(--gold)] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 grid-flow-row-dense">
            <AnimatePresence mode="popLayout">
              {sortedItems.map((item) => {
                const currentPortion = selectedPortions[item.id] || (item.portions && item.portions.length > 0 ? { name: 'Default', price: item.price } : undefined);
                const displayPrice = currentPortion ? currentPortion.price : item.price;
                const { isAvailable } = getDynamicStatus(item);
                const canOrder = isAdmin || (isAvailable && effectiveStoreOpen);

                const isDrink = item.category === 'Drinks';
                const isPopular = !isDrink && (item.orderCount ?? 0) > 0 && (item.orderCount ?? 0) >= badgeThreshold;
                const isTodayOnly = getScheduleLabel(item) === 'Today Only';
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
                      "group bg-[var(--espresso)] border border-white/[0.06] rounded-3xl overflow-hidden flex flex-col",
                      "transition-all duration-250 hover:-translate-y-0.5 hover:shadow-[var(--shadow-belt-card)] hover:border-[rgba(212,175,55,0.30)]",
                      !isAvailable ? "opacity-70" : ""
                    )}
                  >
                    {/* Image — 4:3 aspect ratio */}
                    <div className="relative aspect-[4/3] overflow-hidden flex-shrink-0">
                      {item.image ? (
                        <img
                          src={item.image}
                          alt={item.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="absolute inset-0 transition-transform duration-700 group-hover:scale-105"
                          style={{ background: DISH_FALLBACK_BG }}
                        />
                      )}

                      {/* Sold out overlay */}
                      {!isAvailable && (
                        <div className="absolute inset-0 bg-black/45 backdrop-blur-[2px] flex items-center justify-center z-10">
                          <span className="bg-white text-[var(--stone-900)] px-4 py-1.5 rounded-full text-sm font-semibold">
                            {t('menu.sold_out')}
                          </span>
                        </div>
                      )}

                      {/* Only facts a customer can act on: today-only, spicy, genuinely top sellers. */}
                      {(isTodayOnly || isSpicy || isPopular) && (
                        <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 z-20">
                          {isTodayOnly && (
                            <span className="menu-badge">
                              <Clock size={12} aria-hidden /> {t('menu.badge_today')}
                            </span>
                          )}
                          {isSpicy && (
                            <span className="menu-badge spicy">
                              <Flame size={12} aria-hidden /> {t('menu.badge_spicy')}
                            </span>
                          )}
                          {isPopular && <span className="menu-badge">{t('menu.badge_popular')}</span>}
                        </div>
                      )}
                    </div>

                    {/* Body */}
                    <div className="flex flex-col flex-1 p-5">
                      <p className="label !text-[var(--text-muted)] mb-1">
                        {getCategoryLabel(item.pool === 'specials' ? 'Specials' : item.category)}
                      </p>
                      <h3 className="mb-2 group-hover:text-[var(--gold)] transition-colors">
                        {item.name}
                      </h3>
                      <p className="text-sm text-[var(--text-muted)] mb-4 flex-1 line-clamp-2">
                        {item.description}
                      </p>

                      {/* Portion selector. 'Default' (the base price) is the value the
                          server prices; only its on-screen label is translated. */}
                      {item.portions && item.portions.length > 0 && (
                        <div className="mb-4">
                          <p className="label !text-[var(--text-muted)] mb-2">{t('menu.select_portion')}</p>
                          <div className="grid gap-1.5 grid-cols-1">
                            {[{ name: 'Default', price: item.price }, ...item.portions].map((portion, idx) => (
                              <button
                                key={idx}
                                onClick={() => handlePortionSelect(item.id, portion)}
                                className={cn(
                                  "flex justify-between items-center px-4 py-2 rounded-full text-sm transition-colors border",
                                  currentPortion?.name === portion.name
                                    ? "bg-[var(--gold-soft-10)] text-[var(--gold)] border-[var(--gold-soft-40)]"
                                    : "bg-[var(--white-04)] text-[var(--text-secondary)] border-[var(--white-15)] hover:border-[var(--gold-soft-35)]"
                                )}
                              >
                                <span>{portion.name === 'Default' ? t('menu.portion_default') : portion.name}</span>
                                <span className="tabular-nums font-semibold">₮{portion.price.toLocaleString()}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Bottom row: price + qty stepper / add button */}
                      <div className="flex items-center justify-between pt-4 border-t border-[var(--border-subtle)] mt-auto gap-3">
                        <span className="price">
                          ₮{Math.round(displayPrice).toLocaleString()}
                        </span>

                        <div className="flex items-center gap-2 shrink-0">
                          {/* Qty stepper — only for single-portion items */}
                          {(!item.portions || item.portions.length === 0) && canOrder && (
                            <div className="inline-flex items-center gap-1 bg-[var(--espresso-2)] rounded-full p-1">
                              <button
                                onClick={() => handleQuantityChange(item.id, -1)}
                                className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--gold)] hover:bg-[var(--white-06)] transition-colors"
                              >
                                <Minus size={14} />
                              </button>
                              <span className="min-w-[20px] text-center text-sm font-semibold text-white tabular-nums">{qty}</span>
                              <button
                                onClick={() => handleQuantityChange(item.id, 1)}
                                className="w-8 h-8 rounded-full bg-[var(--gold)] flex items-center justify-center text-[var(--text-on-gold)] hover:bg-[var(--gold-hover)] transition-colors"
                              >
                                <Plus size={14} />
                              </button>
                            </div>
                          )}

                          {/* Add / disabled button */}
                          <button
                            onClick={() => {
                              addToCart(item, currentPortion, quantities[item.id] || 1);
                              setQuantities(prev => ({ ...prev, [item.id]: 1 }));
                            }}
                            disabled={!canOrder}
                            className={cn(
                              "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-colors active:scale-95",
                              canOrder
                                ? "bg-[var(--gold)] text-[var(--text-on-gold)] hover:bg-[var(--gold-hover)]"
                                : "bg-[var(--white-06)] text-[var(--text-muted)] cursor-not-allowed"
                            )}
                          >
                            <Plus size={14} />
                            {isAdmin
                              ? t('menu.add_to_cart')
                              : !effectiveStoreOpen
                                ? t('menu.closed')
                                : isAvailable
                                  ? t('menu.add_to_cart')
                                  : t('menu.sold_out')}
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
            <p className="text-[var(--text-muted)]">{t('menu.no_items')}</p>
          </div>
        )}
      </div>
    </section>
  );
}
