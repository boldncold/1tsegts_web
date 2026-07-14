import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MenuItem } from '../types';
import { useLanguage } from '../context/LanguageContext';

/**
 * Mobile featured-dishes coverflow ("Хоолны аялал") — implements the
 * "1TSEGTS Food Carousel" design mock against the real menu. Center card
 * full-size, neighbours peek at ±150px scaled to 0.76, autoplay every 3.2s
 * (reset by manual navigation), chevrons + counter, swipe to navigate.
 * The mock's intro loader is intentionally dropped — it's a splash screen
 * for the standalone artifact, not something to replay on every visit.
 */

const AUTOPLAY_SECS = 3.2;

const DISH_FALLBACK_BG =
  'radial-gradient(ellipse 55% 35% at 50% 24%, rgba(232,200,90,0.28), transparent 70%), radial-gradient(ellipse 95% 65% at 50% 30%, rgba(212,175,55,0.22), transparent 65%), radial-gradient(ellipse 70% 45% at 50% 100%, rgba(212,175,55,0.10), transparent 70%), linear-gradient(180deg, #17120a 0%, #0a0806 100%)';

/** Coverflow placement by position relative to the active card. */
function cardStyle(rel: number): React.CSSProperties {
  const base: React.CSSProperties = {
    position: 'absolute',
    top: 15,
    left: '50%',
    marginLeft: -118,
    transition: 'transform 700ms var(--ease-card), opacity 700ms var(--ease-card)',
    willChange: 'transform',
  };
  if (rel === 0) return { ...base, transform: 'translateX(0) scale(1)', opacity: 1, zIndex: 3 };
  if (rel === 1) return { ...base, transform: 'translateX(150px) scale(0.76)', opacity: 0.38, zIndex: 2 };
  if (rel === -1) return { ...base, transform: 'translateX(-150px) scale(0.76)', opacity: 0.38, zIndex: 2 };
  const side = rel > 0 ? 1 : -1;
  return {
    ...base,
    transform: `translateX(${side * 280}px) scale(0.6)`,
    opacity: 0,
    zIndex: 1,
    pointerEvents: 'none',
  };
}

export default function FoodCarousel({ dishes }: { dishes: MenuItem[] }) {
  const { language } = useLanguage();
  const [active, setActive] = useState(0);
  const tickRef = useRef<number | null>(null);
  const touchStartX = useRef<number | null>(null);
  const n = dishes.length;

  const schedule = useCallback(() => {
    if (tickRef.current !== null) window.clearTimeout(tickRef.current);
    tickRef.current = window.setTimeout(() => {
      setActive((a) => (a + 1) % n);
      schedule();
    }, AUTOPLAY_SECS * 1000);
  }, [n]);

  useEffect(() => {
    if (n < 2) return;
    schedule();
    return () => {
      if (tickRef.current !== null) window.clearTimeout(tickRef.current);
    };
  }, [n, schedule]);

  const go = (dir: number) => {
    setActive((a) => (a + dir + n) % n);
    if (n >= 2) schedule(); // manual nav resets the autoplay timer
  };

  if (n === 0) return null;

  return (
    <section
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: 'var(--gradient-hero)',
        fontFamily: 'var(--font-sans)',
        padding: '44px 0 40px',
      }}
    >
      {/* ambient gold glow (breathing) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'var(--glow-hero)',
          animation: 'glow-breathe 6s ease-in-out infinite alternate',
          pointerEvents: 'none',
        }}
      />
      {/* faint gold dot pattern */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(rgba(212,175,55,0.12) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          maxWidth: 450,
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 26,
        }}
      >
        {/* heading */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center', padding: '0 28px' }}>
          <span className="eyebrow" style={{ fontSize: 11 }}>
            {language === 'en' ? 'OUR SELECTION' : 'ОНЦЛОХ'}
          </span>
          <h2 style={{ fontFamily: 'var(--font-serif)', fontWeight: 700, color: '#fff', fontSize: 34, lineHeight: 1.1, textWrap: 'balance' }}>
            {language === 'en' ? (
              <>Culinary <em>Journey</em></>
            ) : (
              <>Хоолны <em>аялал</em></>
            )}
          </h2>
        </div>

        {/* carousel */}
        <div
          style={{ position: 'relative', width: '100%', height: 330 }}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const delta = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
          }}
        >
          {dishes.map((dish, i) => {
            let rel = (i - active + n) % n;
            if (rel > n / 2) rel -= n;
            return (
              <div key={dish.id} style={cardStyle(rel)}>
                <div
                  style={{
                    position: 'relative',
                    width: 236,
                    height: 300,
                    borderRadius: 24,
                    overflow: 'hidden',
                    border: '1px solid var(--gold-soft-25)',
                    boxShadow: 'var(--shadow-stack-top)',
                    background: '#0a0806',
                  }}
                >
                  {dish.image ? (
                    <img
                      src={dish.image}
                      alt={dish.name}
                      referrerPolicy="no-referrer"
                      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    <div style={{ position: 'absolute', inset: 0, background: DISH_FALLBACK_BG }} />
                  )}
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(transparent 42%, rgba(0,0,0,0.85))',
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      gap: 6,
                      padding: '16px 14px',
                    }}
                  >
                    <span className="micro-label" style={{ fontSize: 8, letterSpacing: '0.24em', color: 'var(--gold)' }}>
                      {(dish.category || '').toUpperCase()}
                    </span>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21, fontWeight: 700, color: '#fff', textAlign: 'center', lineHeight: 1.15 }}>
                      {dish.name}
                    </span>
                    <span style={{ fontFamily: 'var(--font-serif)', fontSize: 16, fontWeight: 700, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
                      ₮{Math.round(dish.price).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* nav: chevrons + counter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
          <button
            onClick={() => go(-1)}
            aria-label={language === 'en' ? 'Previous' : 'Өмнөх'}
            className="transition-all hover:border-[var(--gold)] hover:bg-[var(--white-04)] active:scale-95"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: 999,
              background: 'transparent',
              border: '1px solid var(--gold-soft-40)',
              color: 'var(--gold)',
              cursor: 'pointer',
            }}
          >
            <ChevronLeft size={16} />
          </button>
          <span className="micro-label" style={{ fontSize: 10, letterSpacing: '0.3em', color: 'var(--white-45)', fontVariantNumeric: 'tabular-nums' }}>
            {String(active + 1).padStart(2, '0')} / {String(n).padStart(2, '0')}
          </span>
          <button
            onClick={() => go(1)}
            aria-label={language === 'en' ? 'Next' : 'Дараах'}
            className="transition-all hover:border-[var(--gold)] hover:bg-[var(--white-04)] active:scale-95"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 38,
              height: 38,
              borderRadius: 999,
              background: 'transparent',
              border: '1px solid var(--gold-soft-40)',
              color: 'var(--gold)',
              cursor: 'pointer',
            }}
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* CTA */}
        <Link
          to="/menu"
          className="transition-all hover:bg-[var(--red-deep-hover)] active:scale-95"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '13px 36px',
            borderRadius: 999,
            background: 'var(--red-deep)',
            color: '#fff',
            fontSize: 12,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.15em',
          }}
        >
          {language === 'en' ? 'View menu' : 'Цэс үзэх'}
        </Link>
      </div>
    </section>
  );
}
