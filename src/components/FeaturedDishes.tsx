import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MenuItem } from '../types';
import { useCart } from '../context/CartContext';
import { useLanguage } from '../context/LanguageContext';
import { useStoreSettings } from '../context/StoreSettingsContext';
import { useAuth } from '../context/AuthContext';
import { getDynamicStatus } from '../lib/utils';
import PortionSheet from './PortionSheet';

type Variant = 'stack' | 'marquee';

const DISH_FALLBACK_BG = 'var(--dish-fallback-bg)';

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = () => setIsMobile(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

interface FeaturedDishesProps {
  dishes: MenuItem[];
  variant?: Variant;
}

export default function FeaturedDishes({ dishes, variant = 'marquee' }: FeaturedDishesProps) {
  const { addToCart } = useCart();
  const { language } = useLanguage();
  const isMobile = useIsMobile();

  const list = useMemo(() => {
    const featured = dishes.filter(d => d.tags?.includes('chefsPick') || d.tags?.includes('popular') || d.featured);
    const rest = dishes.filter(d => !featured.includes(d));
    return [...featured, ...rest].slice(0, 10);
  }, [dishes]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const dishById = (id: string) => list.find(d => d.id === id);

  const { storeOpen } = useStoreSettings();
  const { isAdmin } = useAuth();
  const sheetItem = expanded != null ? dishById(expanded) ?? null : null;

  if (list.length === 0) return null;

  // The compact mobile carousel lives in the hero; this section remains the desktop strip.
  if (isMobile) return null;

  return (
    <section style={{
      background: 'var(--stone-950)',
      paddingTop: isMobile ? 44 : 40,
      paddingBottom: isMobile ? 36 : 48,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 pb-7" style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
      }}>
        <div>
        <h2 style={{ margin: 0 }}>
          {language === 'en' ? 'Featured dishes' : 'Онцлох хоол'}
        </h2>
        </div>
        <Link
          to="/menu"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            color: 'var(--gold)',
            fontSize: 14,
            fontWeight: 600,
            paddingBottom: 5,
            whiteSpace: 'nowrap',
          }}
        >
          {language === 'en' ? 'Full menu' : 'Бүтэн цэс'} <ArrowRight size={14} />
        </Link>
      </div>

      {variant === 'stack'
        ? <StackDeck list={list} onTap={(d) => setExpanded(d.id)} language={language} />
        : <MarqueeBelt list={list} onTap={(d) => setExpanded(d.id)} paused={expanded != null} language={language} />
      }

      {/* The same size sheet as the menu, so a featured dish can be ordered in any size. */}
      <PortionSheet
        item={sheetItem}
        canOrder={!!sheetItem && (isAdmin || (storeOpen && getDynamicStatus(sheetItem).isAvailable))}
        onClose={() => setExpanded(null)}
        onAdd={(item, portion, qty) => addToCart(item, portion, qty)}
      />

      <style>{`
        @keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        .featured-track::-webkit-scrollbar { display: none; }
      `}</style>
    </section>
  );
}

// ─── STACK DECK ──────────────────────────────────────────────
function StackDeck({ list, onTap, language = 'en' }: { list: MenuItem[]; onTap: (d: MenuItem) => void; language?: string }) {
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
                borderRadius: 'var(--radius-card)', overflow: 'hidden', background: 'var(--surface-dish)',
                cursor: isTop ? (drag.active ? 'grabbing' : 'grab') : 'default',
                transform, transition,
                opacity: isExiting ? 0.2 : 1,
                zIndex: 10 - depth,
                boxShadow: isTop
                  ? 'var(--shadow-stack-top)'
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
                    ? `linear-gradient(90deg, transparent 50%, color-mix(in srgb, var(--gold) ${intent * 35}%, transparent) 100%)`
                    : `linear-gradient(270deg, transparent 50%, color-mix(in srgb, var(--red-deep) ${-intent * 35}%, transparent) 100%)`,
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
            fontSize: 12, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' as const,
            color: 'var(--stone-500)', fontVariantNumeric: 'tabular-nums',
          }}>
            <span style={{ color: 'var(--stone-900)' }}>{String(order[0] + 1).padStart(2, '0')}</span>
            <span style={{ opacity: 0.4 }}> / {String(list.length).padStart(2, '0')}</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--stone-500)' }}>
            {language === 'en' ? 'Swipe or tap to view' : 'Гүйлгэх эсвэл дарж үзэх'}
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
  const isMobile = useIsMobile();
  const cardW = isMobile ? 168 : 240;
  const cardGap = isMobile ? 12 : 14;
  const cardAspect = '3 / 4';

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

  // Recompute the loop width when the card dimensions change (e.g. orientation / breakpoint change).
  useEffect(() => { setWidthRef.current = 0; }, [isMobile, list.length]);

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

      const tiltTarget = Math.max(-2.4, Math.min(2.4, velocityRef.current * -1.1));
      tiltSetterRef.current += (tiltTarget - tiltSetterRef.current) * 0.1;
      setTilt(prev => Math.abs(prev - tiltSetterRef.current) > 0.1 ? tiltSetterRef.current : prev);

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const tapStartRef = useRef({ x: 0, y: 0, t: 0 });
  // A drag that ends on the "Бүтэн цэс" <Link> still fires a click and would
  // navigate to /menu; swallow that click when the pointer actually moved.
  const suppressClickRef = useRef(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      draggingRef.current = true;
      suppressClickRef.current = false;
      lastDragRef.current = { x: e.clientX, t: performance.now() };
      tapStartRef.current = { x: e.clientX, y: e.clientY, t: performance.now() };
      el.setPointerCapture?.(e.pointerId);
      el.style.cursor = 'grabbing';
    };
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      if (Math.abs(e.clientX - tapStartRef.current.x) > 8) suppressClickRef.current = true;
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
    // Belt-and-braces: any nested draggable (img, <a>) would otherwise steal the
    // pointer stream mid-drag and leave the belt stuck.
    const onDragStart = (e: Event) => e.preventDefault();
    const onClick = (e: MouseEvent) => {
      if (!suppressClickRef.current) return;
      suppressClickRef.current = false;
      e.preventDefault();
      e.stopPropagation();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onUp);
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('click', onClick, true);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onUp);
      el.removeEventListener('dragstart', onDragStart);
      el.removeEventListener('click', onClick, true);
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
        position: 'relative', cursor: 'grab',
        userSelect: 'none', WebkitUserSelect: 'none',
        touchAction: 'pan-y',
        padding: '8px 0 4px',
        WebkitMaskImage: 'linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%)',
        maskImage: 'linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%)',
      }}
    >
      <div
        ref={trackRef}
        style={{ display: 'flex', gap: cardGap, paddingInline: isMobile ? 16 : 20, willChange: 'transform', width: 'max-content' }}
      >
        {tripled.map((dish, i) => {
          const menuCard = (i + 1) % list.length === 0 && (
            <Link
              key={'cta-' + i}
              to="/menu"
              draggable={false}
              style={{
                position: 'relative', flex: '0 0 auto', width: cardW, aspectRatio: cardAspect,
                borderRadius: 'var(--radius-card)', overflow: 'hidden',
                background: 'linear-gradient(170deg, var(--gold) 0%, var(--gold-hover) 100%)',
                border: '1px solid var(--gold-soft-25)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: isMobile ? 18 : 24, textAlign: 'center', textDecoration: 'none',
                transform: `rotate(${tilt}deg)`,
                transition: 'transform 220ms ease-out, box-shadow 220ms',
                boxShadow: 'var(--shadow-btn-gold)',
              }}
            >
              <div style={{
                width: isMobile ? 40 : 48, height: isMobile ? 40 : 48, borderRadius: 999,
                background: 'rgba(12,10,9,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: isMobile ? 12 : 16,
              }}>
                <ArrowRight size={isMobile ? 18 : 22} color="var(--stone-950)" />
              </div>
              <h3 style={{
                fontFamily: 'var(--font-serif)', fontWeight: 700, fontSize: 20,
                color: 'var(--stone-950)', margin: '0 0 8px',
              }}>
                {language === 'en' ? 'Full menu' : 'Бүтэн цэс'}
              </h3>
              <p style={{ fontSize: isMobile ? 12 : 14, color: 'rgba(12,10,9,0.7)', margin: 0, lineHeight: 1.4 }}>
                {language === 'en' ? 'Discover all our dishes' : 'Бүх хоолтой танилцах'}
              </p>
            </Link>
          );
          return (
            <React.Fragment key={dish.id + '-' + i}>
              <article
                data-dish-id={i}
                style={{
                  position: 'relative', flex: '0 0 auto', width: cardW, aspectRatio: cardAspect,
                  borderRadius: 'var(--radius-card)', overflow: 'hidden', background: 'var(--surface-dish)',
                  transform: `rotate(${tilt}deg)`,
                  transition: 'transform 220ms ease-out, box-shadow 220ms',
                  boxShadow: 'var(--shadow-belt-card)',
                  cursor: 'pointer',
                }}
              >
                <DishImage dish={dish} />
                <CardInfo dish={dish} compact mobile={isMobile} />
              </article>
              {menuCard}
            </React.Fragment>
          );
        })}
      </div>

      <div style={{
        marginTop: isMobile ? 14 : 18, padding: '0 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        fontSize: 12, color: 'var(--stone-400)',
      }}>
        <ArrowRight size={11} style={{ transform: 'rotate(180deg)' }} />
        <span>{language === 'en' ? 'Drag to slow · Tap to open' : 'Чирж удаашруул · Дарж нээ'}</span>
        <ArrowRight size={11} />
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
          // Native image drag-and-drop hijacks the pointer stream and kills the
          // carousel's drag on any bare part of the image (the top of the card).
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%', objectFit: 'cover',
            transform: parallaxX !== 0 ? `translateX(${parallaxX}px) scale(1.1)` : 'none',
            transition: parallaxX !== 0 ? 'transform 80ms linear' : 'none',
            userSelect: 'none', WebkitUserSelect: 'none',
          }}
        />
      ) : (
        <div style={{
          position: 'absolute', inset: 0,
          background: DISH_FALLBACK_BG,
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
function CardInfo({ dish, compact = false, mobile = false }: { dish: MenuItem; compact?: boolean; mobile?: boolean }) {
  const minPrice = Math.min(dish.price, ...(dish.portions?.map(p => p.price) || [dish.price]));
  const small = compact && mobile;
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0,
      padding: small ? '12px 13px' : compact ? '14px 16px' : '20px 22px',
      color: '#fff',
    }}>
      <h3 style={{
        fontFamily: 'var(--font-serif)', fontWeight: 700,
        fontSize: small ? 16 : compact ? 20 : 28, lineHeight: 1.15, letterSpacing: '-0.01em',
        margin: '0 0 5px', color: '#fff',
        textShadow: '0 2px 14px rgba(0,0,0,0.4)',
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
      }}>{dish.name}</h3>
      {!small && (
        <p style={{
          fontSize: compact ? 12 : 14, lineHeight: 1.4, color: 'rgba(255,255,255,0.78)',
          margin: '0 0 12px',
          display: '-webkit-box', WebkitLineClamp: compact ? 1 : 2, WebkitBoxOrient: 'vertical' as const,
          overflow: 'hidden',
        }}>{dish.description}</p>
      )}
      <div style={{
        fontWeight: 600,
        fontSize: small ? 14 : compact ? 16 : 20, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums',
        marginTop: small ? 4 : 0,
      }}>₮{minPrice.toLocaleString()}</div>
    </div>
  );
}
