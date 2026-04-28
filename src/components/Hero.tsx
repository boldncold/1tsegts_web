import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Star, Clock, MapPin, Phone } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function Hero() {
  const { t } = useLanguage();

  return (
    <section
      className="relative min-h-screen text-white overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #1a1510 0%, #2c1810 50%, #4a1a0a 100%)',
      }}
    >
      {/* Radial glow texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 25% 20%, rgba(212,175,55,0.18), transparent 45%), radial-gradient(circle at 75% 80%, rgba(139,0,0,0.35), transparent 50%)',
        }}
      />
      {/* Subtle dot pattern */}
      <div
        className="absolute inset-0 opacity-[0.12] pointer-events-none"
        style={{
          backgroundImage:
            'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'><circle cx=\'30\' cy=\'30\' r=\'1\' fill=\'%23d4af37\'/></svg>")',
        }}
      />

      <div className="relative max-w-[720px] mx-auto px-6 pt-[80px] pb-20 text-center flex flex-col items-center">
        {/* Rating eyebrow pill */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[rgba(212,175,55,0.35)] mb-7"
        >
          <span className="flex gap-0.5 text-[#D4AF37]">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} size={11} fill="currentColor" />
            ))}
          </span>
          <span className="eyebrow">
            {t('hero.premium')}
          </span>
        </motion.div>

        {/* Wordmark */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08 }}
          className="mb-5"
        >
          <span className="font-serif font-bold tracking-tighter leading-none flex items-baseline justify-center">
            <span className="text-[#D4AF37]" style={{ fontSize: 'clamp(72px, 18vw, 120px)' }}>1</span>
            <span className="text-[#8B0000]" style={{ fontSize: 'clamp(36px, 9vw, 60px)' }}>ЦЭГЦ</span>
          </span>
        </motion.div>

        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.15 }}
          className="eyebrow mb-6"
        >
          ─ {t('hero.tagline') || 'Three Worlds. One Table.'} ─
        </motion.div>

        {/* Main headline */}
        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="font-serif font-medium leading-[1.05] tracking-[-0.025em] mb-5 text-balance"
          style={{ fontSize: 'clamp(28px, 6vw, 44px)' }}
        >
          {t('hero.title')}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.25 }}
          className="text-[15px] leading-[1.65] text-white/72 max-w-[520px] mb-9"
        >
          {t('hero.subtitle')}
        </motion.p>

        {/* CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex gap-3 justify-center flex-wrap mb-12"
        >
          <Link
            to="/menu"
            className="inline-flex items-center gap-2.5 px-7 py-3.5 bg-[#8B0000] text-white font-bold uppercase tracking-[0.12em] text-[13px] rounded-full active:scale-95 transition-all"
            style={{ boxShadow: '0 0 0 1px rgba(212,175,55,0.4), 0 12px 32px -8px rgba(139,0,0,0.6)' }}
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

        {/* Info chips */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.38 }}
          className="grid grid-cols-3 gap-2.5 w-full max-w-[480px]"
        >
          {[
            { icon: Clock, top: t('hero.hours'), bot: t('hero.hours_detail') },
            { icon: MapPin, top: t('hero.location'), bot: t('hero.location_detail') },
            { icon: Phone, top: t('hero.reservations') || 'Reservations', bot: '7711 0123' },
          ].map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-center text-center p-3.5 rounded-[14px] border border-[rgba(212,175,55,0.15)]"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              <item.icon size={16} className="text-[#D4AF37] mb-1.5" />
              <div className="micro-label !text-white/45 mb-1">{item.top}</div>
              <div className="text-[12px] text-white font-serif">{item.bot}</div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="hidden sm:flex absolute bottom-8 left-1/2 -translate-x-1/2 flex-col items-center"
      >
        <div className="w-px h-10 bg-gradient-to-b from-[#D4AF37] to-transparent" />
      </motion.div>
    </section>
  );
}
