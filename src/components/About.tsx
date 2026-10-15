import { motion } from 'motion/react';
import { MapPin, Clock, Phone, Mail } from 'lucide-react';
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
        className="brand-wordmark whitespace-nowrap text-[0.7em]"
      >
        <span className="one">1</span>
        <span className="word">ЦЭГЦ</span>
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
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'var(--glow-hero)' }} />

        <div className="relative max-w-5xl mx-auto px-6 w-full">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="space-y-5"
          >
            <span className="label">{both('about.eyebrow')}</span>

            <div className="space-y-3">
              <h1>
                {tl('mn', 'about.title')}
              </h1>
              <p className="font-serif text-xl text-[var(--text-muted)]">
                {tl('en', 'about.title')}
              </p>
            </div>

            <div className="space-y-1">
              <p className="max-w-xl">
                {tl('mn', 'about.subtitle')}
              </p>
              <p className="max-w-xl text-[var(--text-muted)]">
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
            <span className="label">{both('about.story_label')}</span>

            <p className="leading-[1.75]">
              {withBrand(tl('mn', 'about.description'))}
            </p>

            {/* English translation, marked as secondary by the gold rule */}
            <p className="text-[var(--text-muted)] leading-[1.75] pl-4 border-l border-[var(--gold-soft-25)]">
              {withBrand(tl('en', 'about.description'))}
            </p>

            {/* Location & hours pills */}
            <div className="flex flex-col gap-3 pt-2">
              <div className="inline-flex items-center gap-2.5 text-white/60 text-sm">
                <MapPin size={15} className="text-[var(--gold)] shrink-0" />
                <span>{tl('mn', 'footer.location_detail')}</span>
              </div>
              <div className="flex items-start gap-2.5 text-white/60 text-sm">
                <Clock size={15} className="text-[var(--gold)] shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p>{tl('mn', 'about.hours_value')}</p>
                  <p className="text-white/35">{tl('en', 'about.hours_value')}</p>
                  <p className="text-[var(--gold)] font-semibold text-xs uppercase tracking-[0.06em] pt-0.5">
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
                <span className="label">{both('about.location_label')}</span>
                <h3>
                  {tl('mn', 'about.location_name')}
                </h3>
                <p className="font-serif text-[var(--text-muted)]">
                  {tl('en', 'about.location_name')}
                </p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start gap-3 text-white/60 text-sm">
                  <Clock size={15} className="text-[var(--gold)] shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-white">{both('about.hours_label')}</p>
                    <p>{tl('mn', 'about.hours_value')}</p>
                    <p className="text-white/35">{tl('en', 'about.hours_value')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className="w-[15px] shrink-0" />
                  <p className="text-[var(--gold)] font-semibold text-xs uppercase tracking-[0.06em]">
                    {both('about.closed_value')}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-white/[0.06] space-y-2">
                <a
                  href="tel:99138866"
                  className="flex items-center gap-2.5 text-[var(--text-secondary)] hover:text-[var(--gold)] text-sm"
                >
                  <Phone size={16} className="text-[var(--gold)]" aria-hidden /> 99138866
                </a>
                <a
                  href="mailto:boldsaihan666@gmail.com"
                  className="flex items-center gap-2.5 text-[var(--text-secondary)] hover:text-[var(--gold)] text-sm"
                >
                  <Mail size={16} className="text-[var(--gold)]" aria-hidden /> boldsaihan666@gmail.com
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
