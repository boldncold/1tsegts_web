import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Clock, MapPin, Phone } from 'lucide-react';
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
  const step = (i: number) => ({ ...motionTransition, delay: reduceMotion ? 0 : i * 0.09 });

  const facts = [
    { icon: Clock, label: t('hero.hours'), value: t('hero.hours_detail') },
    { icon: MapPin, label: t('hero.location'), value: t('hero.location_detail') },
    { icon: Phone, label: t('hero.phone'), value: '99138866', href: 'tel:99138866' },
  ];

  return (
    <section
      className="relative min-h-[92vh] md:min-h-0 text-white overflow-hidden"
      style={{ background: 'var(--gradient-hero)' }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--glow-hero)' }} />
      <div className="absolute inset-x-0 bottom-0 h-[90px] bg-gradient-to-b from-transparent to-[var(--surface-page)] pointer-events-none" />

      {/* pt clears the fixed navbar (56px). */}
      <div className="relative max-w-[720px] mx-auto px-6 pt-[96px] pb-20 md:pb-16 text-center flex flex-col items-center">
        <motion.div {...fadeUp} transition={step(0)} className="mb-4">
          <span className="brand-wordmark" style={{ fontSize: 'clamp(40px, 9vw, 48px)' }}>
            <span className="one">1</span>
            <span className="word">ЦЭГЦ</span>
          </span>
        </motion.div>

        <motion.p {...fadeUp} transition={step(1)} className="label mb-6">
          {t('hero.tagline')}
        </motion.p>

        <motion.h1 {...fadeUp} transition={step(2)} className="mb-8 text-balance">
          {t('hero.title')}
        </motion.h1>

        <motion.div {...fadeUp} transition={step(3)} className="mb-8">
          <Link to="/menu" className="btn btn-primary">
            {t('hero.cta')} <ArrowRight size={16} />
          </Link>
        </motion.div>

        <motion.dl {...fadeUp} transition={step(4)} className="hidden md:grid grid-cols-3 gap-3 w-full max-w-[560px]">
          {facts.map(({ icon: Icon, label, value, href }) => (
            <div
              key={label}
              className="flex flex-col items-center gap-1 p-3 rounded-[var(--radius-chip)] border border-[var(--border-gold)] bg-[var(--gold-soft-10)]"
            >
              <dt className="label !text-[var(--text-muted)] inline-flex items-center gap-1.5">
                <Icon size={14} className="text-[var(--gold)]" aria-hidden />
                {label}
              </dt>
              <dd className="text-white">
                {href ? <a href={href} className="text-white hover:text-[var(--gold)]">{value}</a> : value}
              </dd>
            </div>
          ))}
        </motion.dl>

        {/* Mobile-only compact carousel. Desktop's featured section is the
            marquee rendered by Home directly under this hero. */}
        <motion.div {...fadeUp} transition={step(4)} className="md:hidden w-full">
          <FoodCarousel dishes={dishes} />
        </motion.div>
      </div>
    </section>
  );
}
