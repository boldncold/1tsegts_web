import { motion } from 'motion/react';
import { MapPin, Clock, Gem } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function About() {
  const { t } = useLanguage();

  const pillars = [
    {
      num: '01',
      title: t('about.pillar1_title'),
      desc: t('about.pillar1_desc'),
      image: 'https://picsum.photos/seed/european-about/600/400',
    },
    {
      num: '02',
      title: t('about.pillar2_title'),
      desc: t('about.pillar2_desc'),
      image: 'https://picsum.photos/seed/asian-about/600/400',
    },
    {
      num: '03',
      title: t('about.pillar3_title'),
      desc: t('about.pillar3_desc'),
      image: 'https://picsum.photos/seed/mongolian-about/600/400',
    },
  ];

  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ────────────────────────────────────────────── */}
      <section
        className="relative min-h-[60vh] flex items-end pb-20 pt-32 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #1a1510 0%, #2c1810 55%, #4a1a0a 100%)' }}
      >
        {/* Radial glows */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 50%, rgba(212,175,55,0.15), transparent 50%), radial-gradient(circle at 80% 20%, rgba(139,0,0,0.25), transparent 45%)',
          }}
        />
        {/* Dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.10] pointer-events-none"
          style={{
            backgroundImage:
              'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'><circle cx=\'30\' cy=\'30\' r=\'1\' fill=\'%23d4af37\'/></svg>")',
          }}
        />

        <div className="relative max-w-5xl mx-auto px-6 w-full">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="space-y-5"
          >
            {/* Gem ornament */}
            <div className="flex items-center gap-3 mb-2">
              <span className="block w-8 h-px bg-[rgba(212,175,55,0.4)]" />
              <Gem size={13} className="text-[#D4AF37]" />
              <span className="block w-8 h-px bg-[rgba(212,175,55,0.4)]" />
            </div>

            <span className="eyebrow">{t('about.eyebrow')}</span>

            <h1 className="text-5xl md:text-7xl font-serif font-bold text-white leading-[1.0] tracking-[-0.025em]">
              {t('about.title')}
            </h1>

            <p className="text-white/60 text-lg font-light max-w-xl leading-relaxed">
              {t('about.subtitle')}
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Story ───────────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            {/* Text */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="space-y-6"
            >
              <span className="eyebrow !text-[#8B0000]">{t('about.story_label')}</span>
              <p className="text-stone-600 text-[17px] leading-[1.75] font-light">
                {t('about.description').split(/(1ЦЭГЦ)/g).map((part, i) =>
                  part === '1ЦЭГЦ' ? (
                    <strong key={i} className="font-serif font-bold tracking-tighter whitespace-nowrap inline-flex items-baseline">
                      <span className="text-[1.4em] text-[#D4AF37] leading-none mr-0.5">1</span>
                      <span className="text-[0.7em] text-[#8B0000] leading-none">ЦЭГЦ</span>
                    </strong>
                  ) : (
                    part
                  )
                )}
              </p>

              {/* Location & hours pills */}
              <div className="flex flex-col gap-3 pt-2">
                <div className="inline-flex items-center gap-2.5 text-stone-600 text-sm">
                  <MapPin size={15} className="text-[#D4AF37] shrink-0" />
                  <span>{t('footer.location_detail')}</span>
                </div>
                <div className="inline-flex items-center gap-2.5 text-stone-600 text-sm">
                  <Clock size={15} className="text-[#D4AF37] shrink-0" />
                  <span>{t('about.hours_value')}</span>
                  <span className="text-[#8B0000] font-semibold text-[11px] uppercase tracking-wider">
                    · {t('about.closed_value')}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Image */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="aspect-[4/3] rounded-3xl overflow-hidden shadow-xl border border-stone-100"
            >
              <img
                src="https://picsum.photos/seed/restaurant-interior/800/600"
                alt="1ЦЭГЦ Restaurant"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── Three Pillars ────────────────────────────────────── */}
      <section className="py-24 bg-stone-950">
        <div className="max-w-5xl mx-auto px-6">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16 space-y-4"
          >
            <div className="flex items-center justify-center gap-3">
              <span className="block w-8 h-px bg-[rgba(212,175,55,0.4)]" />
              <Gem size={13} className="text-[#D4AF37]" />
              <span className="block w-8 h-px bg-[rgba(212,175,55,0.4)]" />
            </div>
            <span className="eyebrow">What We Offer</span>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-white">
              Three Cuisines. One Kitchen.
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6">
            {pillars.map((pillar, idx) => (
              <motion.div
                key={pillar.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className="group relative overflow-hidden rounded-2xl border border-stone-800 hover:border-[rgba(212,175,55,0.4)] transition-colors duration-500"
              >
                {/* Image */}
                <div className="aspect-[4/3] overflow-hidden">
                  <img
                    src={pillar.image}
                    alt={pillar.title}
                    className="w-full h-full object-cover opacity-60 group-hover:opacity-80 group-hover:scale-105 transition-all duration-700"
                    referrerPolicy="no-referrer"
                  />
                </div>
                {/* Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/30 to-transparent" />
                {/* Content */}
                <div className="absolute inset-0 p-6 flex flex-col justify-end">
                  <span className="eyebrow !text-[rgba(212,175,55,0.5)] mb-1">{pillar.num}</span>
                  <h3 className="text-2xl font-serif font-bold text-white mb-2 group-hover:text-[#D4AF37] transition-colors">
                    {pillar.title}
                  </h3>
                  <p className="text-stone-400 text-sm leading-relaxed font-light opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                    {pillar.desc}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Location card ────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-3xl overflow-hidden border border-stone-200 shadow-xl grid md:grid-cols-2">
            {/* Map placeholder */}
            <div className="aspect-[4/3] md:aspect-auto bg-stone-100 relative overflow-hidden">
              <img
                src="https://picsum.photos/seed/shangri-la-map/800/600"
                alt="Shangri-La Mall"
                className="w-full h-full object-cover opacity-80"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-transparent to-white/10" />
            </div>

            {/* Info */}
            <div className="p-10 flex flex-col justify-center space-y-6 bg-white">
              <div className="space-y-2">
                <span className="eyebrow !text-[#8B0000]">{t('about.location_label')}</span>
                <h3 className="text-2xl font-serif font-bold text-stone-900">Shangri-La Mall</h3>
                <p className="text-stone-500 text-sm leading-relaxed">{t('footer.location_detail')}</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-center gap-3 text-stone-600 text-sm">
                  <Clock size={15} className="text-[#D4AF37] shrink-0" />
                  <div>
                    <p className="font-semibold text-stone-800">{t('about.hours_label')}</p>
                    <p>{t('about.hours_value')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-[15px] shrink-0" />
                  <p className="text-[#8B0000] font-semibold text-[11px] uppercase tracking-wider">{t('about.closed_value')}</p>
                </div>
              </div>

              <div className="pt-4 border-t border-stone-100 space-y-2">
                <a
                  href="tel:99138866"
                  className="inline-flex items-center gap-2 text-stone-700 hover:text-[#8B0000] transition-colors text-sm font-medium"
                >
                  📞 99138866
                </a>
                <a
                  href="mailto:1tsegts@gmail.com"
                  className="flex items-center gap-2 text-stone-700 hover:text-[#D4AF37] transition-colors text-sm font-medium"
                >
                  ✉ 1tsegts@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
