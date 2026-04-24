import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, Star, Clock, MapPin } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function Hero() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-[100dvh] pb-10 flex items-center justify-center overflow-hidden bg-black pt-28">
      {/* Background Image with Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://picsum.photos/seed/asian-street-food/1920/1080?blur=1"
          alt="1ЦЭГЦ"
          className="w-full h-full object-cover opacity-60"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/80 via-black/40 to-white"></div>
      </div>

      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="space-y-6"
        >
          <div className="flex items-center justify-center space-x-2 text-[#D4AF37] mb-4">
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <Star size={16} fill="currentColor" />
            <span className="text-xs uppercase tracking-widest text-gray-300 ml-2">{t('hero.premium')}</span>
          </div>

          <h1 className="flex items-baseline justify-center text-7xl md:text-[10rem] font-serif font-bold tracking-tighter leading-none mb-4">
            <span className="text-[#D4AF37] mr-2">1</span>
            <span className="text-[#8B0000]">ЦЭГЦ</span>
          </h1>

          <p className="max-w-2xl mx-auto text-lg md:text-xl text-white font-light leading-relaxed">
            {t('hero.subtitle')}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-6 pt-8">
            <Link
              to="/menu"
              className="group relative px-8 py-4 bg-[#8B0000] text-white font-bold uppercase tracking-widest rounded-full overflow-hidden transition-all hover:bg-[#6b0000] hover:shadow-[0_0_20px_rgba(212,175,55,0.4)] active:scale-95"
            >
              <span className="relative z-10 flex items-center">
                {t('hero.cta')} <ArrowRight className="ml-2 group-hover:translate-x-1 transition-transform" size={18} />
              </span>
            </Link>
            <Link
              to="/menu"
              className="px-8 py-4 border border-white/30 text-white font-bold uppercase tracking-widest rounded-full hover:bg-white/10 hover:border-[#D4AF37] transition-all active:scale-95"
            >
              {t('hero.order_now')}
            </Link>
          </div>
          
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="pt-4"
          >
            <a 
              href="#categories" 
              className="text-[10px] uppercase tracking-[0.2em] text-gray-400 hover:text-[#D4AF37] transition-colors font-bold"
            >
              {t('hero.browse')}
            </a>
          </motion.div>
        </motion.div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-4xl mx-auto">
          {[
            { icon: Clock, title: t('hero.hours'), detail: t('hero.hours_detail') },
            { icon: MapPin, title: t('hero.location'), detail: t('hero.location_detail') },
            { icon: Star, title: t('hero.quality'), detail: t('hero.quality_detail') },
          ].map((item, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 + idx * 0.1 }}
              className="flex items-center space-x-4 p-4 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl shadow-lg"
            >
              <div className="p-3 bg-[#D4AF37]/20 rounded-xl text-[#D4AF37]">
                <item.icon size={20} />
              </div>
              <div className="text-left">
                <p className="text-[10px] uppercase tracking-widest text-gray-300 font-bold">{item.title}</p>
                <p className="text-sm text-white font-medium">{item.detail}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Scroll Indicator */}
      <motion.div
        animate={{ y: [0, 10, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="hidden sm:block absolute bottom-10 left-1/2 -translate-x-1/2 text-gray-400"
      >
        <div className="w-px h-12 bg-gradient-to-b from-[#8B0000] via-[#D4AF37] to-transparent"></div>
      </motion.div>
    </section>
  );
}
