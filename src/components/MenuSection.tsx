import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Check, Search, Flame, Clock, ShieldCheck, TrendingUp, Star, UtensilsCrossed, Users } from 'lucide-react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { MenuItem, Category } from '../types';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useStoreSettings } from '../context/StoreSettingsContext';
import { useAuth } from '../context/AuthContext';
import { cn, getDynamicStatus, getSchedule, nextOpening } from '../lib/utils';
import PortionSheet from './PortionSheet';

const DISH_FALLBACK_BG = 'var(--dish-fallback-bg)';

export default function MenuSection() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<Category | 'All' | 'Specials'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const addedTimer = useRef<ReturnType<typeof setTimeout>>();
  const listRef = useRef<HTMLDivElement>(null);
  const { addToCart } = useCart();
  const { t } = useLanguage();
  const { settings, storeOpen } = useStoreSettings();
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

  // Picking a category deep in the list jumps back to its first dish.
  const selectCategory = (cat: Category | 'All' | 'Specials') => {
    setActiveCategory(cat);
    const list = listRef.current;
    if (list && list.getBoundingClientRect().top < 130) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Adding gave no feedback beyond the navbar count; the button shows a check briefly.
  const flashAdded = (id: string) => {
    setAddedId(id);
    clearTimeout(addedTimer.current);
    addedTimer.current = setTimeout(() => setAddedId(null), 1200);
  };

  // Dishes with sizes open the size sheet; the rest go straight into the cart.
  const handleAdd = (item: MenuItem) => {
    if (item.portions?.length) {
      setSheetItem(item);
      return;
    }
    addToCart(item, undefined, 1);
    flashAdded(item.id);
  };

  const scheduleKeyword = (item: MenuItem) => {
    const schedule = getSchedule(item);
    if (!schedule) return null;
    switch (schedule.kind) {
      case 'today': return t('menu.badge_today');
      case 'weekends': return t('menu.badge_weekends');
      case 'weekdays': return t('menu.badge_weekdays');
      case 'days':
        return schedule.days.length === 1
          ? t('menu.badge_only_day').replace('{day}', t(`day.${schedule.days[0]}`))
          : schedule.days.map((d) => t(`day_short.${d}`)).join(' · ');
    }
  };

  const opening = storeOpen ? null : nextOpening(settings);
  const openingLabel = (() => {
    if (!opening) return null;
    const time = `${String(opening.hour).padStart(2, '0')}:00`;
    if (opening.daysAhead === 0) return t('menu.opens_today').replace('{time}', time);
    if (opening.daysAhead === 1) return t('menu.opens_tomorrow').replace('{time}', time);
    return t('menu.opens_on').replace('{day}', t(`day.${opening.weekday}`)).replace('{time}', time);
  })();

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
    <section id="menu-section" className="pt-12 md:pt-16 pb-16 md:pb-24 bg-[var(--surface-page)] min-h-screen">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
          <div className="flex flex-col items-start gap-3">
            {isAdmin && (
              <span className="label inline-flex items-center gap-1.5 rounded-full border border-[var(--gold-soft-30)] bg-[var(--gold-soft-10)] px-3 py-1.5">
                <ShieldCheck size={14} />
                {t('cart.admin.test_mode_hint')}
              </span>
            )}
            <h2>{t('menu.title')}</h2>
          </div>
          <div className="relative w-full md:w-80">
            <input
              type="search"
              placeholder={t('menu.search')}
              aria-label={t('menu.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-11 bg-[var(--white-04)] border border-[var(--white-15)] rounded-full pl-11 pr-4 text-sm text-white placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--gold)] transition-colors"
            />
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" size={18} aria-hidden />
          </div>
        </div>

        {/* Pinned under the navbar so every category stays one tap away in a long menu. */}
        <div className="sticky top-14 z-30 -mx-3 px-3 sm:-mx-4 sm:px-4 lg:-mx-8 lg:px-8 py-3 mb-4 bg-[var(--surface-page)] border-b border-[var(--border-subtle)]">
          <div className="no-scrollbar flex gap-2 overflow-x-auto [mask-image:linear-gradient(to_right,black_85%,transparent)] md:[mask-image:none]">
            {categoriesWithItems.map((cat) => (
              <button
                key={cat}
                onClick={() => selectCategory(cat)}
                aria-pressed={activeCategory === cat}
                className={cn(
                  "shrink-0 h-10 px-4 rounded-full text-sm font-medium transition-colors border",
                  activeCategory === cat
                    ? "bg-[var(--gold)] text-[var(--text-on-gold)] border-[var(--gold)]"
                    : "bg-transparent text-[var(--text-secondary)] border-[var(--white-15)] hover:border-[var(--gold)] hover:text-[var(--gold)]"
                )}
              >
                {getCategoryLabel(cat)}
              </button>
            ))}
          </div>
        </div>

        {!storeOpen && (
          <div role="status" className="flex items-center gap-3 mb-4 px-4 py-3 rounded-[var(--radius-control)] border border-[var(--gold-soft-25)] bg-[var(--gold-soft-10)]">
            <Clock size={18} className="shrink-0 text-[var(--gold)]" aria-hidden />
            <p className="text-sm text-white">
              {t('menu.closed_now')}
              {openingLabel && <> · <span className="text-[var(--gold)]">{openingLabel}</span></>}
            </p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="w-12 h-12 border-4 border-[var(--gold)] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <div ref={listRef} className="scroll-mt-32 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
            <AnimatePresence mode="popLayout">
              {sortedItems.map((item) => {
                const { isAvailable } = getDynamicStatus(item);
                const canOrder = isAdmin || (isAvailable && effectiveStoreOpen);
                const sizeCount = item.portions?.length ? item.portions.length + 1 : 0;
                const isDrink = item.category === 'Drinks';
                const added = addedId === item.id;
                const schedule = scheduleKeyword(item);
                // Featured, top-15 seller, spicy, set meal (free tea, salads and
                // refills; ticked in admin), several sizes, a weekly schedule.
                const badges = [
                  item.featured && { icon: Star, label: t('menu.badge_featured') },
                  !isDrink && (item.orderCount ?? 0) > 0 && (item.orderCount ?? 0) >= popularThreshold && { icon: TrendingUp, label: t('menu.badge_popular') },
                  item.tags?.includes('spicy') && { icon: Flame, label: t('menu.badge_spicy') },
                  item.tags?.includes('set') && { icon: UtensilsCrossed, label: t('menu.badge_set') },
                  (item.portions?.length ?? 0) >= 2 && { icon: Users, label: t('menu.badge_groups') },
                  schedule && { icon: Clock, label: schedule },
                ].filter((b): b is { icon: typeof Clock; label: string } => !!b);
                const buttonLabel = isAdmin
                  ? t('menu.add_to_cart')
                  : !effectiveStoreOpen ? t('menu.closed') : isAvailable ? t('menu.add_to_cart') : t('menu.sold_out');

                return (
                  <motion.article
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex md:flex-col gap-3 md:gap-0 p-3 md:p-0 rounded-[var(--radius-card)] overflow-hidden bg-[var(--espresso)] border border-[var(--border-subtle)] md:hover:border-[var(--gold-soft-30)] transition-colors"
                  >
                    <div
                      className="relative w-24 h-24 md:w-full md:h-auto md:aspect-[4/3] shrink-0 overflow-hidden rounded-[var(--radius-control)] md:rounded-none bg-[var(--surface-dish)]"
                      style={item.image ? undefined : { background: DISH_FALLBACK_BG }}
                    >
                      {item.image && (
                        <img src={item.image} alt="" loading="lazy" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      )}
                      {!isAvailable && (
                        <div className="absolute inset-0 bg-black/55 flex items-center justify-center">
                          <span className="text-xs md:text-sm font-semibold text-white">{t('menu.sold_out')}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col flex-1 min-w-0 md:p-5">
                      {badges.length > 0 && (
                        <p className="flex flex-wrap gap-x-3 gap-y-1 mb-1 text-xs font-medium text-[var(--gold)]">
                          {badges.map(({ icon: Icon, label }) => (
                            <span key={label} className="inline-flex items-center gap-1">
                              <Icon size={12} aria-hidden /> {label}
                            </span>
                          ))}
                        </p>
                      )}
                      <h3 className="line-clamp-2">{item.name}</h3>
                      {item.description && (
                        <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-1 md:line-clamp-2">{item.description}</p>
                      )}

                      <div className="flex items-center justify-between gap-3 mt-auto pt-3 md:pt-4">
                        <p className="text-xs text-[var(--text-muted)]">
                          <span className="text-base md:text-xl font-semibold tabular-nums text-[var(--gold)]">
                            ₮{Math.round(item.price).toLocaleString()}
                          </span>
                          {sizeCount > 0 && <> · {sizeCount} {t('menu.sizes')}</>}
                        </p>
                        <button
                          onClick={() => handleAdd(item)}
                          disabled={!canOrder}
                          aria-label={`${buttonLabel}: ${item.name}`}
                          className={cn(
                            "shrink-0 h-10 min-w-10 md:px-4 inline-flex items-center justify-center gap-1.5 rounded-full text-sm font-semibold transition-colors active:scale-95",
                            canOrder
                              ? "bg-[var(--gold)] text-[var(--text-on-gold)] hover:bg-[var(--gold-hover)]"
                              : "bg-[var(--white-06)] text-[var(--text-muted)] cursor-not-allowed"
                          )}
                        >
                          {added ? <Check size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
                          <span className="hidden md:inline">{added ? t('menu.added') : buttonLabel}</span>
                        </button>
                      </div>
                    </div>
                  </motion.article>
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

      <PortionSheet
        item={sheetItem}
        canOrder={!!sheetItem && (isAdmin || (getDynamicStatus(sheetItem).isAvailable && effectiveStoreOpen))}
        onClose={() => setSheetItem(null)}
        onAdd={(item, portion, qty) => {
          addToCart(item, portion, qty);
          flashAdded(item.id);
        }}
      />
    </section>
  );
}
