import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Star, Clock, MapPin, Phone } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { MenuItem } from '../types';
import FoodCarousel from './FoodCarousel';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
};

interface HeroProps {
  dishes: MenuItem[];
}

export default function Hero({ dishes }: HeroProps) {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const motionTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.8, ease: [0.22, 0.95, 0.36, 1] as const };

  return (
    <section
      className="relative min-h-[92vh] text-white overflow-hidden"
      style={{ background: 'var(--gradient-hero)' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--glow-hero)' }} />
      <div
        className="absolute inset-0 opacity-[0.10] pointer-events-none"
        style={{
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'><circle cx=\'30\' cy=\'30\' r=\'1\' fill=\'%23d4af37\'/></svg>")',
        }}
      />
      <div className="absolute inset-x-0 bottom-0 h-[90px] bg-gradient-to-b from-transparent to-[var(--surface-page)] pointer-events-none" />

      <div className="relative max-w-[720px] md:max-w-[880px] mx-auto px-6 pt-[80px] pb-20 text-center flex flex-col items-center">
        <motion.div
          {...fadeUp}
          transition={motionTransition}
          className="inline-flex items-center gap-2 px-4 py-[7px] rounded-full border border-[rgba(212,175,55,0.30)] bg-[rgba(212,175,55,0.06)] backdrop-blur-[10px] mb-8"
        >
          <span className="flex gap-0.5 text-[#D4AF37]">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} size={11} fill="currentColor" />
            ))}
          </span>
          <span className="eyebrow !text-[10px]">{t('hero.premium')}</span>
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ ...motionTransition, delay: reduceMotion ? 0 : 0.09 }}
          className="mb-5"
          style={{ textShadow: '0 6px 40px rgba(212,175,55,0.25)' }}
        >
          <span className="font-serif font-bold tracking-tighter leading-none flex items-baseline justify-center">
            <span className="text-[#D4AF37]" style={{ fontSize: 'clamp(72px, 18vw, 120px)' }}>1</span>
            <span className="text-[#8B0000]" style={{ fontSize: 'clamp(36px, 9vw, 60px)' }}>ЦЭГЦ</span>
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ...motionTransition, delay: reduceMotion ? 0 : 0.18 }}
          className="flex items-center gap-3 mb-7"
        >
          <span className="block w-7 h-px bg-[rgba(212,175,55,0.4)]" />
          <span className="eyebrow !text-[10px]">{t('hero.tagline') || 'Three Worlds. One Table.'}</span>
          <span className="block w-7 h-px bg-[rgba(212,175,55,0.4)]" />
        </motion.div>

        <motion.h1
          {...fadeUp}
          transition={{ ...motionTransition, delay: reduceMotion ? 0 : 0.27 }}
          className="font-serif font-medium leading-[1.05] tracking-[-0.025em] mb-5 text-balance"
          style={{ fontSize: 'clamp(28px, 6vw, 44px)' }}
        >
          {t('hero.title')}
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={{ ...motionTransition, delay: reduceMotion ? 0 : 0.36 }}
          className="text-[15px] leading-[1.65] text-white/72 max-w-[520px] mb-9"
        >
          {t('hero.subtitle')}
        </motion.p>

        <motion.div
          {...fadeUp}
          transition={{ ...motionTransition, delay: reduceMotion ? 0 : 0.45 }}
          className="flex gap-3 justify-center flex-wrap mb-7 md:mb-12"
        >
          <Link
            to="/menu"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-[#D4AF37] text-[#080606] font-bold uppercase tracking-[0.12em] text-[13px] rounded-full active:scale-95 transition-all hover:bg-[#C5A028] hover:text-[#080606]"
            style={{ boxShadow: 'var(--shadow-cta-hero)' }}
          >
            {t('hero.cta')} <ArrowRight size={14} />
          </Link>
          <Link
            to="/menu"
            className="inline-flex items-center px-7 py-3.5 border border-[rgba(212,175,55,0.45)] text-[#D4AF37] font-bold uppercase tracking-[0.12em] text-[13px] rounded-full hover:bg-white/5 transition-all active:scale-95"
          >
            {t('hero.order_now')}
          </Link>
        </motion.div>

        <motion.div
          {...fadeUp}
          transition={{ ...motionTransition, delay: reduceMotion ? 0 : 0.54 }}
          className="hidden md:grid grid-cols-3 gap-2.5 w-full max-w-[480px]"
        >
          {[
            { icon: Clock, top: t('hero.hours'), bot: t('hero.hours_detail') },
            { icon: MapPin, top: t('hero.location'), bot: t('hero.location_detail') },
            { icon: Phone, top: t('hero.reservations') || 'Reservations', bot: '99138866' },
          ].map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-center text-center p-3.5 rounded-[14px] border border-[rgba(212,175,55,0.20)] bg-[rgba(212,175,55,0.10)]"
            >
              <item.icon size={16} className="text-[#D4AF37] mb-1.5" />
              <div className="micro-label !text-white/45 mb-1">{item.top}</div>
              <div className="text-[12px] text-white font-serif">{item.bot}</div>
            </div>
          ))}
        </motion.div>

        {/* Featured carousel lives in the hero on every viewport so the food
            is on the first screen — on desktop it follows the info cards. */}
        <motion.div
          {...fadeUp}
          transition={{ ...motionTransition, delay: reduceMotion ? 0 : 0.63 }}
          className="w-full max-w-[480px] md:max-w-[840px] md:mt-9"
        >
          <FoodCarousel dishes={dishes} />
        </motion.div>
      </div>

      {!reduceMotion && (
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          className="hidden sm:flex absolute bottom-8 left-1/2 -translate-x-1/2 flex-col items-center"
        >
          <div className="w-px h-10 bg-gradient-to-b from-[#D4AF37] to-transparent" />
        </motion.div>
      )}
    </section>
  );
}
