import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Plus, Minus, X, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { db, collection, onSnapshot, query, where, orderBy, limit } from '../firebase';
import { MenuItem } from '../types';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';

type Variant = 'stack' | 'marquee';

export default function FeaturedDishes({ variant = 'marquee' as Variant }) {
  const [dishes, setDishes] = useState<MenuItem[]>([]);
  const { addToCart } = useCart();
  const { language } = useLanguage();

  useEffect(() => {
    const featuredQuery = query(
      collection(db, 'menu'),
      where('available', '==', true),
      where('featured', '==', true),
      limit(10)
    );
    const unsubscribe = onSnapshot(featuredQuery, (snapshot) => {
      if (!snapshot.empty) {
        const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MenuItem[];
        setDishes(items);
      } else {
        const fallback = query(
          collection(db, 'menu'),
          where('available', '==', true),
          orderBy('orderCount', 'desc'),
          limit(10)
        );
        onSnapshot(fallback, (snap) => {
          const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as MenuItem[];
          setDishes(items);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  const list = useMemo(() => {
    const featured = dishes.filter(d => d.tags?.includes('chefsPick') || d.tags?.includes('popular') || d.featured);
    const rest = dishes.filter(d => !featured.includes(d));
    return [...featured, ...rest].slice(0, 10);
  }, [dishes]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const dishById = (id: string) => list.find(d => d.id === id);

  const handleAdd = useCallback((dish: MenuItem & { qty?: number }) => {
    const qty = dish.qty || 1;
    addToCart(dish, undefined, qty);
    setExpanded(null);
  }, [addToCart]);

  if (list.length === 0) return null;

  return (
    <section style={{
      background: 'var(--stone-50, #fafaf9)',
      paddingTop: 72,
      paddingBottom: 48,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{ padding: '0 20px 28px', maxWidth: 1100, margin: '0 auto' }}>
        <div className="eyebrow" style={{ marginBottom: 8 }}>
          {language === 'en' ? 'Selected' : 'Онцлох'}
        </div>
        <h2 style={{
          fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 30, lineHeight: 1.05,
          letterSpacing: '-0.018em', margin: 0, color: 'var(--stone-900)',
        }}>
          {language === 'en' ? (
            <>Featured <em style={{ color: 'var(--red-deep)', fontStyle: 'italic', fontWeight: 500 }}>Dishes</em></>
          ) : 'Онцлох хоол'}
        </h2>
      </div>

      {variant === 'stack'
        ? <StackDeck list={list} onTap={(d) => setExpanded(d.id)} />
        : <MarqueeBelt list={list} onTap={(d) => setExpanded(d.id)} paused={expanded != null} language={language} />
      }

      {expanded != null && (
        <BottomSheet
          dish={dishById(expanded)!}
          onClose={() => setExpanded(null)}
          onAdd={handleAdd}
          language={language}
        />
      )}

      <style>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .featured-track::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
}

// ─── STACK DECK ──────────────────────────────────────────────
function StackDeck({ list, onTap }: { list: MenuItem[]; onTap: (d: MenuItem) => void }) {
  const [order, setOrder] = useState(() => list.map((_, i) => i));
  const [drag, setDrag] = useState({ x: 0, y: 0, active: false });
  const [exiting, setExiting] = useState<{ direction: number } | null>(null);

  useEffect(() => { setOrder(list.map((_, i) => i)); }, [list.length]);

  const top = order[0];
  const startRef = useRef({ x: 0, y: 0, t: 0 });
  const cardRef = useRef<HTMLElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (exiting) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setDrag({ x: 0, y: 0, active: true });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.active) return;
    setDrag({ x: e.clientX - startRef.current.x, y: e.clientY - startRef.current.y, active: true });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.active) return;
    const dx = e.clientX - startRef.current.x;
    const dt = Date.now() - startRef.current.t;
    const v = Math.abs(dx) / Math.max(dt, 1);
    const threshold = 80;
    const fast = v > 0.5;
    setDrag({ x: 0, y: 0, active: false });
    if (Math.abs(dx) > threshold || fast) {
      const direction = dx > 0 ? 1 : -1;
      setExiting({ direction });
      setTimeout(() => {
        setOrder(prev => [...prev.slice(1), prev[0]]);
        setExiting(null);
      }, 320);
    } else if (Math.abs(dx) < 6 && Math.abs(e.clientY - startRef.current.y) < 6 && dt < 220) {
      onTap(list[top]);
    }
  };

  const skip = (direction: number) => {
    if (exiting) return;
    setExiting({ direction });
    setTimeout(() => {
      setOrder(prev => [...prev.slice(1), prev[0]]);
      setExiting(null);
    }, 320);
  };

  const visibleCount = Math.min(3, order.length);

  return (
    <div style={{ position: 'relative', padding: '0 20px', maxWidth: 480, margin: '0 auto' }}>
      <div style={{ position: 'relative', height: 460, userSelect: 'none', touchAction: 'pan-y' }}>
        {Array.from({ length: visibleCount }).map((_, depth) => {
          const dishIdx = order[depth];
          if (dishIdx == null) return null;
          const dish = list[dishIdx];
          const isTop = depth === 0;
          const isExiting = isTop && exiting;

          const restingScale = 1 - depth * 0.06;
          const restingY = depth * 14;
          const restingRotate = depth === 1 ? -2 : depth === 2 ? 2.4 : 0;

          let transform: string;
          let transition: string;
          if (isExiting) {
            transform = `translate(${exiting!.direction * 520}px, ${drag.y * 0.5}px) rotate(${exiting!.direction * 22}deg)`;
            transition = 'transform 320ms cubic-bezier(.55,.05,.7,1), opacity 320ms';
          } else if (isTop && drag.active) {
            const rot = drag.x * 0.06;
            transform = `translate(${drag.x}px, ${drag.y * 0.4}px) rotate(${rot}deg)`;
            transition = 'none';
          } else if (isTop) {
            transform = `translate(0, 0) rotate(0deg)`;
            transition = 'transform 360ms cubic-bezier(.22,.95,.36,1)';
          } else {
            const liftBoost = drag.active ? Math.min(Math.abs(drag.x) / 200, 1) : 0;
            const yLift = restingY - liftBoost * 8 * (3 - depth);
            const sLift = restingScale + liftBoost * 0.03 * (3 - depth);
            transform = `translateY(${yLift}px) scale(${sLift}) rotate(${restingRotate}deg)`;
            transition = 'transform 360ms cubic-bezier(.22,.95,.36,1)';
          }

          const parallaxX = isTop && drag.active ? drag.x * 0.18 : 0;
          const intent = isTop && drag.active ? Math.max(-1, Math.min(1, drag.x / 110)) : 0;

          return (
            <article
              key={dish.id + '-' + depth}
              ref={isTop ? cardRef : null}
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? onPointerUp : undefined}
              style={{
                position: 'absolute', inset: 0, margin: 'auto',
                width: '100%', maxWidth: 360, aspectRatio: '3 / 4.2',
                borderRadius: 22, overflow: 'hidden', background: '#1a1510',
                cursor: isTop ? (drag.active ? 'grabbing' : 'grab') : 'default',
                transform, transition,
                opacity: isExiting ? 0.2 : 1,
                zIndex: 10 - depth,
                boxShadow: isTop
                  ? '0 28px 60px -20px rgba(0,0,0,0.45), 0 0 0 1px rgba(212,175,55,0.18)'
                  : `0 ${10 + depth * 4}px ${24 + depth * 6}px -14px rgba(0,0,0,0.35)`,
                pointerEvents: isTop ? 'auto' : 'none',
              }}
            >
              <DishImage dish={dish} parallaxX={parallaxX} />
              <CardInfo dish={dish} />
              {isTop && Math.abs(intent) > 0.05 && (
                <div style={{
                  position: 'absolute', inset: 0,
                  background: intent > 0
                    ? `linear-gradient(90deg, transparent 50%, rgba(212,175,55,${intent * 0.35}) 100%)`
                    : `linear-gradient(270deg, transparent 50%, rgba(139,0,0,${-intent * 0.35}) 100%)`,
                  pointerEvents: 'none', transition: 'opacity 120ms',
                }} />
              )}
            </article>
          );
        })}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 4px 0', gap: 16 }}>
        <button
          onClick={() => skip(-1)}
          aria-label="Previous"
          style={{
            background: '#fff', border: '1px solid var(--stone-200)', width: 44, height: 44, borderRadius: 999,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--stone-700)', boxShadow: '0 2px 8px -2px rgba(0,0,0,0.08)',
          }}
        ><ChevronLeft size={18} /></button>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' as const,
            color: 'var(--stone-500)', fontVariantNumeric: 'tabular-nums',
          }}>
            <span style={{ color: 'var(--stone-900)' }}>{String(order[0] + 1).padStart(2, '0')}</span>
            <span style={{ opacity: 0.4 }}> / {String(list.length).padStart(2, '0')}</span>
          </div>
          <div style={{ fontSize: 11, color: 'var(--stone-400)', letterSpacing: '0.04em' }}>
            Swipe or tap to view
          </div>
        </div>

        <button
          onClick={() => skip(1)}
          aria-label="Next"
          style={{
            background: 'var(--stone-900)', border: 'none', width: 44, height: 44, borderRadius: 999,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--gold)', boxShadow: '0 6px 18px -6px rgba(0,0,0,0.35)',
          }}
        ><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

// ─── MARQUEE BELT ────────────────────────────────────────────
function MarqueeBelt({ list, onTap, paused = false, language = 'en' }: { list: MenuItem[]; onTap: (d: MenuItem) => void; paused?: boolean; language?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const velocityRef = useRef(0.5);
  const targetVelRef = useRef(0.5);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const draggingRef = useRef(false);
  const lastDragRef = useRef({ x: 0, t: 0 });
  const rafRef = useRef<number>(0);
  const [tilt, setTilt] = useState(0);
  const tiltSetterRef = useRef(0);

  const tripled = useMemo(() => [...list, ...list, ...list], [list]);
  const setWidthRef = useRef(0);

  useEffect(() => {
    const tick = () => {
      const t = trackRef.current;
      if (!t) { rafRef.current = requestAnimationFrame(tick); return; }
      if (!setWidthRef.current && t.scrollWidth > 0) {
        setWidthRef.current = t.scrollWidth / 3;
        offsetRef.current = setWidthRef.current;
      }
      if (pausedRef.current) {
        velocityRef.current *= 0.9;
      } else if (!draggingRef.current) {
        velocityRef.current += (targetVelRef.current - velocityRef.current) * 0.04;
        offsetRef.current += velocityRef.current;
      }
      const w = setWidthRef.current;
      if (w > 0) {
        if (offsetRef.current > w * 2) offsetRef.current -= w;
        if (offsetRef.current < w) offsetRef.current += w;
      }
      t.style.transform = `translate3d(${-offsetRef.current}px, 0, 0)`;

      const tiltTarget = Math.max(-6, Math.min(6, velocityRef.current * -2.4));
      tiltSetterRef.current += (tiltTarget - tiltSetterRef.current) * 0.12;
      setTilt(prev => Math.abs(prev - tiltSetterRef.current) > 0.15 ? tiltSetterRef.current : prev);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const tapStartRef = useRef({ x: 0, y: 0, t: 0 });

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      draggingRef.current = true;
      lastDragRef.current = { x: e.clientX, t: performance.now() };
      tapStartRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - lastDragRef.current.x;
      const dt = Math.max(performance.now() - lastDragRef.current.t, 1);
      offsetRef.current -= dx;
      velocityRef.current = -dx / dt * 16;
      lastDragRef.current = { x: e.clientX, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      el.style.cursor = 'grab';

      const drift = Math.hypot(e.clientX - tapStartRef.current.x, e.clientY - tapStartRef.current.y);
      const duration = performance.now() - tapStartRef.current.t;
      if (drift < 8 && duration < 300) {
        el.releasePointerCapture?.(e.pointerId);
        const card = document.elementsFromPoint(e.clientX, e.clientY)
          .find(el => el.matches('[data-dish-id]')) as HTMLElement | undefined;
        if (card) {
          const idx = parseInt(card.dataset.dishId!, 10);
          const dish = tripled[idx];
          if (dish) onTap(dish);
        }
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onUp);
    };
  }, [tripled, onTap]);

  const onEnter = () => { targetVelRef.current = 0; };
  const onLeave = () => { targetVelRef.current = 0.5; };

  return (
    <div
      ref={wrapperRef}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{
        position: 'relative', cursor: 'grab', userSelect: 'none', touchAction: 'pan-y',
        padding: '8px 0 4px',
        WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%)',
        maskImage: 'linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%)',
      }}
    >
      <div
        ref={trackRef}
        style={{ display: 'flex', gap: 14, paddingInline: 20, willChange: 'transform', width: 'max-content' }}
      >
        {tripled.map((dish, i) => {
          const menuCard = (i + 1) % list.length === 0 && (
            <Link
              key={'cta-' + i}
              to="/menu"
              style={{
                position: 'relative', flex: '0 0 auto', width: 240, aspectRatio: '3 / 4.2',
                borderRadius: 18, overflow: 'hidden',
                background: 'var(--stone-900)', border: '1px solid rgba(212,175,55,0.25)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: 24, textAlign: 'center', textDecoration: 'none',
                transform: `rotate(${tilt}deg)`,
                transition: 'transform 220ms ease-out, box-shadow 220ms',
                boxShadow: '0 14px 32px -14px rgba(0,0,0,0.35)',
              }}
            >
              <div style={{
                width: 48, height: 48, borderRadius: 999,
                background: 'rgba(212,175,55,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
              }}>
                <ArrowRight size={22} color="var(--gold)" />
              </div>
              <h3 style={{
                fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 18,
                color: '#fff', margin: '0 0 8px',
              }}>
                {language === 'en' ? 'Explore Full Menu' : 'Бүтэн цэс'}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--stone-400)', margin: 0, lineHeight: 1.4 }}>
                {language === 'en' ? 'Discover all our dishes' : 'Бүх хоолтой танилцах'}
              </p>
            </Link>
          );
          return (
            <React.Fragment key={dish.id + '-' + i}>
              <article
                data-dish-id={i}
                style={{
                  position: 'relative', flex: '0 0 auto', width: 240, aspectRatio: '3 / 4.2',
                  borderRadius: 18, overflow: 'hidden', background: '#1a1510',
                  transform: `rotate(${tilt}deg)`,
                  transition: 'transform 220ms ease-out, box-shadow 220ms',
                  boxShadow: '0 14px 32px -14px rgba(0,0,0,0.35)',
                  cursor: 'pointer',
                }}
              >
                <DishImage dish={dish} />
                <CardInfo dish={dish} compact />
              </article>
              {menuCard}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{
        marginTop: 18, padding: '0 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' as const,
        color: 'var(--stone-400)',
      }}>
        <ArrowRight size={12} style={{ transform: 'rotate(180deg)' }} />
        <span>Drag to slow · Tap to open</span>
        <ArrowRight size={12} />
      </div>
    </div>
  );
}

// ─── DISH IMAGE ──────────────────────────────────────────────
function DishImage({ dish, parallaxX = 0 }: { dish: MenuItem; parallaxX?: number }) {
  const hasImage = !!dish.image;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      {hasImage ? (
        <img
          src={dish.image}
          alt={dish.name}
          referrerPolicy="no-referrer"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover',
            transform: parallaxX !== 0 ? `translateX(${parallaxX}px) scale(1.1)` : 'none',
            transition: parallaxX !== 0 ? 'transform 80ms linear' : 'none',
          }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: `radial-gradient(ellipse 80% 60% at 40% 30%, #7c3f28, transparent 65%),
            radial-gradient(circle at 50% 50%, #2a1a0e, #1a1510 70%)`,
        }} />
      )}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.25) 60%, rgba(0,0,0,0.85) 100%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}

// ─── CARD INFO ───────────────────────────────────────────────
function CardInfo({ dish, compact = false }: { dish: MenuItem; compact?: boolean }) {
  const minPrice = Math.min(dish.price, ...(dish.portions?.map(p => p.price) || [dish.price]));
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      padding: compact ? '14px 16px' : '20px 22px',
      color: '#fff',
    }}>
      <h3 style={{
        fontFamily: 'var(--font-serif)', fontWeight: 700,
        fontSize: compact ? 18 : 24, lineHeight: 1.15, letterSpacing: '-0.012em',
        margin: '0 0 6px', color: '#fff',
        textShadow: '0 2px 14px rgba(0,0,0,0.4)',
      }}>{dish.name}</h3>
      <p style={{
        fontSize: compact ? 11.5 : 13, lineHeight: 1.4, color: 'rgba(255,255,255,0.78)',
        margin: '0 0 12px',
        display: '-webkit-box', WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: 'vertical' as const,
        overflow: 'hidden',
      }}>{dish.description}</p>
      <div style={{
        fontFamily: 'var(--font-serif)', fontWeight: 700,
        fontSize: compact ? 16 : 19, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums',
        letterSpacing: '0.01em',
      }}>₮{minPrice.toLocaleString()}</div>
    </div>
  );
}

// ─── BOTTOM SHEET ────────────────────────────────────────────
function BottomSheet({ dish, onClose, onAdd, language }: {
  dish: MenuItem;
  onClose: () => void;
  onAdd: (d: MenuItem & { qty: number }) => void;
  language: string;
}) {
  const [qty, setQty] = useState(1);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setIsVisible(true));
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = '';
    };
  }, []);

  const close = () => {
    setIsVisible(false);
    setTimeout(onClose, 260);
  };

  if (!dish) return null;

  const cuisineLabels: Record<string, string> = {
    European: language === 'en' ? 'European' : 'Европ',
    Asian: language === 'en' ? 'Asian' : 'Ази',
    Mongolian: language === 'en' ? 'Mongolian' : 'Монгол',
    Drinks: language === 'en' ? 'Drinks' : 'Ундаа',
  };
  const cuisineLabel = cuisineLabels[dish.category] || '';
  const minPrice = Math.min(dish.price, ...(dish.portions?.map(p => p.price) || [dish.price]));

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={close} style={{
        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        opacity: isVisible ? 1 : 0, transition: 'opacity 240ms ease-out',
      }} />
      <div style={{
        position: 'relative', width: '100%', maxWidth: 480, maxHeight: '88vh', overflow: 'hidden',
        background: '#fcfaf5', borderRadius: '24px 24px 0 0', display: 'flex', flexDirection: 'column',
        transform: isVisible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 320ms cubic-bezier(.22,.95,.36,1)',
        boxShadow: '0 -24px 48px -12px rgba(0,0,0,0.4)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <span style={{ display: 'block', width: 40, height: 4, borderRadius: 999, background: 'rgba(0,0,0,0.18)' }} />
        </div>

        <div style={{
          height: 220, position: 'relative', overflow: 'hidden',
          background: `radial-gradient(ellipse 80% 60% at 40% 30%, #7c3f28, transparent 65%),
            radial-gradient(circle at 50% 50%, #2a1a0e, #1a1510 70%)`,
        }}>
          {dish.image && (
            <img
              src={dish.image}
              alt={dish.name}
              referrerPolicy="no-referrer"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}
          <button onClick={close} aria-label="Close" style={{
            position: 'absolute', top: 14, right: 14, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)',
            border: 'none', color: '#fff', borderRadius: 999, width: 36, height: 36, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={16} />
          </button>
          {cuisineLabel && (
            <span style={{
              position: 'absolute', bottom: 14, left: 14,
              background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(10px)',
              color: '#fff', fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase' as const,
              padding: '6px 12px', borderRadius: 999,
            }}>{cuisineLabel}</span>
          )}
        </div>

        <div style={{ padding: '20px 24px 24px', overflowY: 'auto' }}>
          <h3 style={{
            fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 26, color: 'var(--stone-900)',
            margin: '0 0 10px', letterSpacing: '-0.01em',
          }}>{dish.name}</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: 'var(--stone-500)', margin: '0 0 22px' }}>
            {dish.description}
          </p>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'var(--stone-500)' }}>
              {language === 'en' ? 'Quantity' : 'Тоо ширхэг'}
            </span>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#1a1510', color: '#fff', borderRadius: 999, padding: 5 }}>
              <button onClick={() => setQty(q => Math.max(1, q - 1))} style={{
                background: 'transparent', border: 'none', color: 'var(--gold)', width: 32, height: 32,
                borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}><Minus size={14} /></button>
              <span style={{ minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: 700 }}>{qty}</span>
              <button onClick={() => setQty(q => q + 1)} style={{
                background: 'var(--gold)', border: 'none', color: '#1a1510', width: 32, height: 32,
                borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}><Plus size={14} /></button>
            </div>
          </div>

          <button onClick={() => onAdd({ ...dish, qty })} style={{
            width: '100%', background: 'var(--red-deep)', color: '#fff', border: 'none', borderRadius: 999,
            padding: '15px 22px', fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' as const,
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'var(--font-sans)',
            boxShadow: '0 14px 30px -10px rgba(139,0,0,0.55), 0 0 0 1px rgba(212,175,55,0.4)',
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Plus size={14} /> {language === 'en' ? 'Add to Cart' : 'Сагсанд нэмэх'}
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-serif)', fontSize: 16, letterSpacing: 0 }}>
              ₮{(minPrice * qty).toLocaleString()}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
