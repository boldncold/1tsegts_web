import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import { Link } from 'react-router-dom';
import { MenuItem } from '../types';
import { useLanguage } from '../context/LanguageContext';

const AUTOPLAY_MS = 3200;
const DISH_FALLBACK_BG =
  'radial-gradient(ellipse 55% 35% at 50% 24%, rgba(232,200,90,0.28), transparent 70%), linear-gradient(180deg, #17120a 0%, #0a0806 100%)';

function getRelativePosition(index: number, active: number, length: number) {
  let relative = (index - active + length) % length;
  if (relative > length / 2) relative -= length;
  return relative;
}

/**
 * The compact 226×142 geometry is sized for a phone; rendered verbatim on a
 * desktop hero it reads as a mobile widget lost in space. On md+ screens the
 * whole coverflow scales up by this factor instead.
 */
function useDesktopScale(breakpoint = 768) {
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined'
      ? window.matchMedia(`(min-width: ${breakpoint}px)`).matches
      : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${breakpoint}px)`);
    const handler = () => setIsDesktop(mq.matches);
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isDesktop ? 1.5 : 1;
}

function getCardStyle(relative: number, s: number): CSSProperties {
  const base: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: '50%',
    width: 226 * s,
    height: 142 * s,
    marginLeft: -113 * s,
    transition: 'transform 600ms var(--ease-card), opacity 600ms var(--ease-card)',
    willChange: 'transform',
  };

  if (relative === 0) {
    return { ...base, transform: 'translateX(0) scale(1)', opacity: 1, zIndex: 3 };
  }
  if (relative === 1 || relative === -1) {
    return {
      ...base,
      transform: `translateX(${relative * 170 * s}px) scale(0.82)`,
      opacity: 0.42,
      zIndex: 2,
      pointerEvents: 'none',
    };
  }

  return {
    ...base,
    transform: `translateX(${(relative > 0 ? 310 : -310) * s}px) scale(0.7)`,
    opacity: 0,
    zIndex: 1,
    pointerEvents: 'none',
  };
}

interface FoodCarouselProps {
  dishes: MenuItem[];
}

export default function FoodCarousel({ dishes }: FoodCarouselProps) {
  const { language, t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const count = dishes.length;
  const s = useDesktopScale();

  useEffect(() => {
    setActive((current) => (count === 0 ? 0 : Math.min(current, count - 1)));
  }, [count]);

  useEffect(() => {
    if (reduceMotion || count < 2) return;
    const timer = window.setTimeout(() => {
      setActive((current) => (current + 1) % count);
    }, AUTOPLAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, count, reduceMotion]);

  const go = (direction: number) => {
    if (count < 2) return;
    setActive((current) => (current + direction + count) % count);
  };

  if (count === 0) {
    return (
      <div className="h-[176px] w-full" aria-hidden="true">
        <div className="mx-auto h-[142px] w-[226px] animate-pulse rounded-[8px] border border-white/10 bg-white/5" />
      </div>
    );
  }

  return (
    <section aria-label={t('featured.title')} className="relative w-full overflow-hidden">
      <div className="mb-3 flex items-center justify-between px-1">
        <span className="eyebrow !text-[9px]">{t('featured.title')}</span>
        <span className="micro-label !text-white/45" aria-live="polite">
          {String(active + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
        </span>
      </div>

      <div
        className="relative touch-pan-y"
        style={{ height: 142 * s }}
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0].clientX;
        }}
        onTouchEnd={(event) => {
          if (touchStartX.current === null) return;
          const delta = event.changedTouches[0].clientX - touchStartX.current;
          touchStartX.current = null;
          if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
        }}
      >
        {dishes.map((dish, index) => {
          const relative = getRelativePosition(index, active, count);
          const minPrice = Math.min(
            dish.price,
            ...(dish.portions?.map((portion) => portion.price) || [dish.price])
          );

          return (
            <Link
              key={dish.id}
              to="/menu"
              style={getCardStyle(relative, s)}
              tabIndex={relative === 0 ? 0 : -1}
              aria-hidden={relative !== 0}
              className="overflow-hidden rounded-[8px] border border-[rgba(212,175,55,0.28)] bg-[#0a0806] text-left shadow-[0_18px_38px_-18px_rgba(0,0,0,0.9)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D4AF37]"
            >
              {dish.image ? (
                <img
                  src={dish.image}
                  alt={dish.name}
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0" style={{ background: DISH_FALLBACK_BG }} />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent" />
              <div className="absolute inset-y-0 left-0 flex w-[72%] flex-col justify-end p-3.5 md:p-5">
                <span className="micro-label mb-1 !text-[7px] !text-[#D4AF37] md:!text-[9px]">
                  {dish.category}
                </span>
                <h2 className="line-clamp-2 font-serif text-[17px] font-bold leading-[1.08] text-white md:text-[23px]">
                  {dish.name}
                </h2>
                <span className="mt-1.5 font-serif text-[14px] font-bold text-[#D4AF37] md:text-[17px]">
                  ₮{minPrice.toLocaleString()}
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      {count > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => go(-1)}
            aria-label={language === 'en' ? 'Previous dish' : 'Өмнөх хоол'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(212,175,55,0.35)] text-[#D4AF37] transition-colors hover:bg-white/5 active:scale-95"
          >
            <ChevronLeft size={15} />
          </button>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            {dishes.map((dish, index) => (
              <span
                key={dish.id}
                className={`block h-1 rounded-full transition-all ${
                  index === active ? 'w-5 bg-[#D4AF37]' : 'w-1 bg-white/25'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => go(1)}
            aria-label={language === 'en' ? 'Next dish' : 'Дараах хоол'}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[rgba(212,175,55,0.35)] text-[#D4AF37] transition-colors hover:bg-white/5 active:scale-95"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      )}
    </section>
  );
}
