import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShoppingCart, Star, Flame, Gem, Clock, Plus, Check, Search, X } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { MenuItem, Category, Portion } from '../types';
import { cn, getDynamicStatus } from '../lib/utils';
import { query, collection, onSnapshot, orderBy, db, auth, onAuthStateChanged, doc, getDoc } from '../firebase';

// Add Google Fonts for Playfair Display
const fontLink = document.createElement('link');
fontLink.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&display=swap';
fontLink.rel = 'stylesheet';
document.head.appendChild(fontLink);

export default function TraditionalMenu({ items }: { items: MenuItem[] }) {
  const { t, language } = useLanguage();
  const { addToCart, cart, itemCount: cartItemCount, total: cartSubtotal } = useCart();
  const [activeTab, setActiveTab] = useState<Category>('European');
  const [addingItem, setAddingItem] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const categoryRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        if (user.email === 'boldsaihanlolor@gmail.com') {
          setIsAdmin(true);
          return;
        }
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          const adminEmailDoc = await getDoc(doc(db, 'admin_emails', user.email?.toLowerCase() || ''));
          setIsAdmin(userDoc.data()?.role === 'admin' || adminEmailDoc.exists());
        } catch (error) {
          setIsAdmin(false);
        }
      } else {
        setIsAdmin(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // These are now directly provided by useCart context
  // const cartItemCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  // const cartSubtotal = cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  const categories = ['Draft', 'European', 'Asian', 'Mongolian', 'Drinks'] as Category[];
  
  const filteredItems = items.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      (item.description && item.description.toLowerCase().includes(query)) ||
      (item.tags && item.tags.some(tag => tag.toLowerCase().includes(query)))
    );
  });

  const validCategories = categories.filter(cat => filteredItems.some(item => item.category === cat));

  // Determine top 5 signature items for images
  const signatureItems = [...items]
    .filter(i => i.featured || (i.orderCount && i.orderCount > 0))
    .sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return (b.orderCount || 0) - (a.orderCount || 0);
    })
    .slice(0, 5)
    .map(i => i.id);

  const scrollToCategory = (cat: Category) => {
    setActiveTab(cat);
    const element = categoryRefs.current[cat];
    if (element) {
      const offset = 140; // Height of sticky headers
      const bodyRect = document.body.getBoundingClientRect().top;
      const elementRect = element.getBoundingClientRect().top;
      const elementPosition = elementRect - bodyRect;
      const offsetPosition = elementPosition - offset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  };

  const handleQuickAdd = (item: MenuItem, portion: Portion | undefined, e: React.MouseEvent) => {
    e.stopPropagation();
    const { isAvailable } = getDynamicStatus(item);
    if (!isAvailable) return;
    
    const addId = portion ? item.id + portion.name : item.id;
    setAddingItem(addId);
    addToCart(item, portion);
    
    setTimeout(() => {
      setAddingItem(null);
    }, 1000);
  };

  const getCategoryLabel = (cat: Category) => {
    switch (cat) {
      case 'European': return t('menu.european');
      case 'Asian': return t('menu.asian');
      case 'Drinks': return t('menu.drinks');
      case 'Mongolian': return t('menu.mongolian');
      case 'Draft': return t('menu.specials');
      default: return cat;
    }
  };

  return (
    <div className="bg-[#fcfaf5] min-h-screen text-[#2c241b] pb-24 font-sans">
      <style dangerouslySetInnerHTML={{__html: `
        .font-serif-menu { font-family: 'Playfair Display', serif; }
        .dotted-leader {
          flex-grow: 1;
          border-bottom: 2px dotted #d1c8b8;
          margin: 0 12px;
          position: relative;
          top: -6px;
          opacity: 0.5;
        }
        @media print {
          @page { margin: 2cm; }
          body { background: white !important; }
          .print-hidden, nav, .sticky, button { display: none !important; }
          .print-break-inside-avoid { page-break-inside: avoid; break-inside: avoid; }
          .print-text-black { color: black !important; }
          .print-no-shadow { box-shadow: none !important; }
          footer { break-before: page; page-break-before: always; border-top: none !important; padding-top: 0 !important; }
        }
      `}} />

      {/* Floating Print Button - Admins Only & Minimized */}
      {isAdmin && (
        <button 
          onClick={() => window.print()}
          className="print-hidden fixed bottom-6 right-6 z-50 bg-white/80 text-[#1a1510] p-3 rounded-full shadow-lg hover:bg-[#8B0000] hover:text-white transition-all backdrop-blur-md border border-[#e8dfce]"
          title={language === 'en' ? 'Print Menu' : 'Цэс Хэвлэх'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        </button>
      )}

      {/* Sticky Top Navigation */}
      <div className="sticky top-[72px] z-40 bg-[#fcfaf5]/95 backdrop-blur-md border-b border-[#e8dfce] shadow-sm">
        <div className="max-w-3xl mx-auto px-4">
          <div className="flex overflow-x-auto hide-scrollbar py-4 gap-6 items-center">
            {validCategories.map(cat => (
              <button
                key={cat}
                onClick={() => scrollToCategory(cat)}
                className={cn(
                  "whitespace-nowrap pb-1 font-serif-menu font-semibold tracking-wider uppercase text-sm transition-all relative",
                  activeTab === cat ? "text-[#8B0000]" : "text-[#7a6b5d] hover:text-[#2c241b]"
                )}
              >
                {getCategoryLabel(cat)}
                {activeTab === cat && (
                  <motion.div 
                    layoutId="activeCategoryBorder"
                    className="absolute -bottom-1 left-0 right-0 h-0.5 bg-[#8B0000]" 
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-8 pb-4">
        <div className="print-hidden relative">
          <input
            type="text"
            placeholder={language === 'en' ? "Search menu or keywords (e.g., spicy, beef)..." : "Цэс эсвэл түлхүүр үгээр хайх (ж.нь: халуун ногоотой)..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-[#e8dfce] rounded-full px-5 py-3.5 pl-12 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37] transition-all text-[#2c241b] placeholder:text-[#a89f91] shadow-sm font-sans text-sm"
          />
          <Search size={18} className="absolute left-5 top-1/2 -translate-y-1/2 text-[#a89f91]" />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-[#a89f91] hover:text-[#8B0000] p-1"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4">
        {validCategories.map((cat, index) => {
          const catItems = filteredItems.filter(i => i.category === cat);
          
          return (
            <div 
              key={cat} 
              ref={(el) => (categoryRefs.current[cat] = el)}
              className="mb-20 scroll-mt-40 category-section"
            >
              {/* Elegant Section Divider & Header */}
              <div className="text-center mb-12">
                <div className="flex items-center justify-center gap-4 mb-4">
                  <div className="w-12 h-[1px] bg-[#d1c8b8]"></div>
                  <Gem size={14} className="text-[#8B0000] opacity-70" />
                  <div className="w-12 h-[1px] bg-[#d1c8b8]"></div>
                </div>
                <h2 className="font-serif-menu text-3xl md:text-4xl font-bold text-[#1a1510] uppercase tracking-widest">
                  {getCategoryLabel(cat)}
                </h2>
              </div>

              <div className="space-y-12">
                {catItems.map(item => {
                  const { isAvailable } = getDynamicStatus(item);
                  const isSignature = signatureItems.includes(item.id);
                  const maxPrice = Math.max(item.price, ...(item.portions?.map(p => p.price) || []));
                  const isLuxury = cat !== 'Drinks' && Math.min(item.price, ...(item.portions?.map(p => p.price) || [])) > 20000;
                  const isPopular = cat !== 'Drinks' && item.orderCount && item.orderCount >= 10;

                  return (
                    <div 
                      key={item.id} 
                      className={cn("group print-break-inside-avoid relative", !isAvailable && "opacity-60")}
                      onClick={(e) => {
                        if (window.innerWidth < 768 && (!item.portions || item.portions.length === 0)) {
                          handleQuickAdd(item, undefined, e);
                        }
                      }}
                    >
                      {isSignature && item.image && (
                        <div className="print-hidden hidden md:block absolute -left-32 top-0 w-24 h-24 rounded-full overflow-hidden border-2 border-[#e8dfce] opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-xl z-10 pointer-events-none">
                          <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                        </div>
                      )}

                      <div className="flex flex-col">
                        <div className="flex items-end justify-between w-full mb-1">
                          <div className="flex items-center gap-2 flex-shrink-0 relative top-1">
                            <h3 className="font-serif-menu text-xl md:text-2xl font-bold text-[#1a1510] group-hover:text-[#8B0000] transition-colors print-text-black">
                              {item.name}
                            </h3>
                            <div className="print-hidden flex gap-1.5 shrink-0 ml-1">
                              {!isAvailable ? (
                                <span className="text-[10px] font-sans tracking-wider uppercase text-stone-500 font-bold border border-stone-300 px-1 rounded">Sold Out</span>
                              ) : (
                                <>
                                  {isPopular && <Star size={12} className="text-[#8B0000] fill-[#8B0000]" title="Popular" />}
                                  {isLuxury && <Gem size={12} className="text-[#8B0000]" title="Luxury" />}
                                </>
                              )}
                            </div>
                          </div>

                          <div className="dotted-leader"></div>

                          {/* Main Add Button (Only show if no portions) */}
                          {(!item.portions || item.portions.length === 0) && (
                            <div className="print-hidden flex items-center md:opacity-0 md:group-hover:opacity-100 transition-opacity px-2">
                              <button
                                onClick={(e) => handleQuickAdd(item, undefined, e)}
                                disabled={!isAvailable}
                                className={cn(
                                  "p-2 md:p-1.5 rounded-full text-white shadow-sm transition-transform active:scale-90",
                                  isAvailable ? "bg-[#D4AF37] hover:bg-[#b08d2c]" : "bg-gray-300 cursor-not-allowed"
                                )}
                              >
                                {addingItem === item.id ? <Check size={16} className="md:size-[14px]" /> : <Plus size={16} className="md:size-[14px]" />}
                              </button>
                            </div>
                          )}
                          
                          <span className="font-serif-menu font-bold text-[#8B0000] text-lg tabular-nums print-text-black">
                            ₮{maxPrice.toLocaleString()}
                          </span>
                        </div>

                        {/* Keyword Marks (Tags) - Non printable */}
                        {item.tags && item.tags.length > 0 && (
                          <div className="print-hidden flex flex-wrap gap-1 mt-1">
                            {item.tags.map(tag => (
                              <span key={tag} className="text-[9px] uppercase tracking-widest bg-white border border-[#e8dfce] text-[#8a7f72] px-1.5 py-0.5 rounded shadow-sm">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Interactive Portion Buttons for screen, simple text for print */}
                        {(item.portions && item.portions.length > 0) && (
                          <>
                            <div className="hidden print:block text-[11px] text-[#8a7f72] font-sans uppercase tracking-widest mt-1">
                              Available in multiple sizes
                            </div>
                            
                            <div className="flex flex-wrap gap-2 mt-3 print-hidden">
                              {[{ name: 'Default', price: item.price }, ...item.portions].map((portion, idx) => {
                                const addId = item.id + portion.name;
                                return (
                                  <button
                                    key={idx}
                                    onClick={(e) => handleQuickAdd(item, portion, e)}
                                    disabled={!isAvailable}
                                    className={cn(
                                      "px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border flex items-center gap-1.5 active:scale-95",
                                      isAvailable 
                                        ? "border-[#d1c8b8] text-[#8B0000] hover:bg-[#8B0000] hover:text-white"
                                        : "border-gray-200 text-gray-400 cursor-not-allowed bg-stone-50"
                                    )}
                                  >
                                    <span>{portion.name}</span>
                                    <span className="opacity-80 font-serif-menu ml-0.5">₮{portion.price.toLocaleString()}</span>
                                    {addingItem === addId ? <Check size={12} className="ml-1" /> : <Plus size={12} className="ml-1" />}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}

                        {/* Description */}
                        {item.description && (
                          <div className="md:w-3/4">
                            <p className="font-serif-menu text-[15px] italic text-[#5c5042] leading-relaxed mt-1.5">
                              {item.description}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Sticky Cart Bar */}
      <AnimatePresence>
        {cartItemCount > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 pointer-events-none"
          >
            <div className="max-w-md mx-auto h-16 bg-[#1a1510] rounded-2xl shadow-2xl flex items-center justify-between px-6 pointer-events-auto border border-[#3a3025]">
              <div className="flex flex-col">
                <span className="text-white font-serif-menu font-bold tracking-wide">
                  View Cart
                </span>
                <span className="text-[#a89b8d] font-sans text-xs flex items-center gap-2">
                  <ShoppingCart size={12} />
                  {cartItemCount} {cartItemCount === 1 ? 'Item' : 'Items'} • ₮{(cartSubtotal || 0).toLocaleString()}
                </span>
              </div>
              
              <button 
                onClick={() => document.dispatchEvent(new CustomEvent('open-cart-drawer'))}
                className="bg-[#D4AF37] hover:bg-[#c4a030] text-[#1a1510] px-5 py-2 rounded-xl text-sm font-bold uppercase tracking-widest transition-colors font-sans"
              >
                Checkout
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
