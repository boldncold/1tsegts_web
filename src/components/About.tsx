import { motion } from 'motion/react';
import { MapPin, Clock, Gem } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/**
 * The About page shows Mongolian and English together rather than switching
 * between them: guests at the food court read one, visitors read the other,
 * and nobody has to find the language toggle. Mongolian always leads.
 */

/** Renders the 1ЦЭГЦ wordmark inline wherever it appears in a copy string. */
function withBrand(text: string) {
  return text.split(/(1ЦЭГЦ)/g).map((part, i) =>
    part === '1ЦЭГЦ' ? (
      <strong
        key={i}
        className="font-serif font-bold tracking-tighter whitespace-nowrap inline-flex items-baseline"
      >
        <span className="text-[1.4em] text-[#D4AF37] leading-none mr-0.5">1</span>
        <span className="text-[0.7em] text-[#8B0000] leading-none">ЦЭГЦ</span>
      </strong>
    ) : (
      part
    )
  );
}

export default function About() {
  const { tl } = useLanguage();

  /** Mongolian and English of the same key, for the compact one-line slots. */
  const both = (key: string) => `${tl('mn', key)} · ${tl('en', key)}`;

  return (
    <div className="min-h-screen bg-[var(--surface-page)]">

      {/* ── Hero ────────────────────────────────────────────── */}
      <section
        className="relative min-h-[60vh] flex items-end pb-20 pt-32 overflow-hidden"
        style={{ background: 'var(--gradient-hero)' }}
      >
        {/* Radial glows */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'var(--glow-hero)',
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

            <span className="eyebrow">{both('about.eyebrow')}</span>

            <div className="space-y-3">
              <h1 className="text-5xl md:text-7xl font-serif font-bold text-white leading-[1.0] tracking-[-0.025em]">
                {tl('mn', 'about.title')}
              </h1>
              <p className="text-2xl md:text-3xl font-serif font-medium text-white/45 leading-tight tracking-[-0.015em]">
                {tl('en', 'about.title')}
              </p>
            </div>

            <div className="space-y-1">
              <p className="text-white/60 text-lg font-light max-w-xl leading-relaxed">
                {tl('mn', 'about.subtitle')}
              </p>
              <p className="text-white/35 text-base font-light max-w-xl leading-relaxed">
                {tl('en', 'about.subtitle')}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Story ───────────────────────────────────────────── */}
      <section className="py-24 bg-[var(--surface-page)]">
        <div className="max-w-3xl mx-auto px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            <span className="eyebrow">{both('about.story_label')}</span>

            <p className="text-white/60 text-[17px] leading-[1.75] font-light">
              {withBrand(tl('mn', 'about.description'))}
            </p>

            {/* English translation, marked as secondary by the gold rule */}
            <p className="text-white/35 text-[15px] leading-[1.7] font-light pl-4 border-l border-[rgba(212,175,55,0.25)]">
              {withBrand(tl('en', 'about.description'))}
            </p>

            {/* Location & hours pills */}
            <div className="flex flex-col gap-3 pt-2">
              <div className="inline-flex items-center gap-2.5 text-white/60 text-sm">
                <MapPin size={15} className="text-[#D4AF37] shrink-0" />
                <span>{tl('mn', 'footer.location_detail')}</span>
              </div>
              <div className="flex items-start gap-2.5 text-white/60 text-sm">
                <Clock size={15} className="text-[#D4AF37] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p>{tl('mn', 'about.hours_value')}</p>
                  <p className="text-white/35">{tl('en', 'about.hours_value')}</p>
                  <p className="text-[#D4AF37] font-semibold text-[11px] uppercase tracking-wider pt-0.5">
                    {both('about.closed_value')}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Location card ────────────────────────────────────── */}
      <section className="py-24 bg-[var(--surface-page)]">
        <div className="max-w-5xl mx-auto px-6">
          <div className="rounded-3xl overflow-hidden border border-[rgba(212,175,55,0.15)] shadow-xl bg-[var(--espresso)] max-w-2xl mx-auto">
            {/* Info */}
            <div className="p-10 flex flex-col justify-center space-y-6 bg-[var(--espresso)]">
              <div className="space-y-2">
                <span className="eyebrow">{both('about.location_label')}</span>
                <h3 className="text-2xl font-serif font-bold text-white">
                  {tl('mn', 'about.location_name')}
                </h3>
                <p className="text-white/45 text-base font-serif">
                  {tl('en', 'about.location_name')}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 text-white/60 text-sm">
                  <Clock size={15} className="text-[#D4AF37] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">{both('about.hours_label')}</p>
                    <p>{tl('mn', 'about.hours_value')}</p>
                    <p className="text-white/35">{tl('en', 'about.hours_value')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-[15px] shrink-0" />
                  <p className="text-[#D4AF37] font-semibold text-[11px] uppercase tracking-wider">
                    {both('about.closed_value')}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.06] space-y-2">
                <a
                  href="tel:99138866"
                  className="inline-flex items-center gap-2 text-white/60 hover:text-[#D4AF37] transition-colors text-sm font-medium"
                >
                  📞 99138866
                </a>
                <a
                  href="mailto:boldsaihan666@gmail.com"
                  className="flex items-center gap-2 text-white/60 hover:text-[#D4AF37] transition-colors text-sm font-medium"
                >
                  ✉ boldsaihan666@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
