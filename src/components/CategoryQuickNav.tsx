import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Category } from '../types';
import { useLanguage } from '../context/LanguageContext';

const categories: { name: Category; image: string; translationKey: string; descKey: string }[] = [
  { name: 'European', image: 'https://picsum.photos/seed/european/800/600', translationKey: 'menu.european', descKey: 'menu.european_desc' },
  { name: 'Asian', image: 'https://picsum.photos/seed/asian/800/600', translationKey: 'menu.asian', descKey: 'menu.asian_desc' },
  { name: 'Mongolian', image: 'https://picsum.photos/seed/mongolian/800/600', translationKey: 'menu.mongolian', descKey: 'menu.mongolian_desc' },
  { name: 'Drinks', image: 'https://picsum.photos/seed/drinks/800/600', translationKey: 'menu.drinks', descKey: 'menu.drinks_desc' },
];

export default function CategoryQuickNav() {
  const { t } = useLanguage();

  return (
    <section id="categories" className="py-24 bg-stone-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="space-y-4"
          >
            <span className="text-xs uppercase tracking-[0.3em] text-amber-500 font-bold">Explore Our World</span>
            <h2 className="text-4xl md:text-6xl font-serif font-bold text-stone-100">Select Your <span className="italic">Cuisine</span></h2>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((cat, idx) => (
            <motion.div
              key={cat.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: idx * 0.1 }}
              className="group relative h-80 overflow-hidden rounded-3xl border border-stone-800"
            >
              <img
                src={cat.image}
                alt={cat.name}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/20 to-transparent opacity-80"></div>
              
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <h3 className="text-3xl font-serif font-bold text-stone-100 mb-2 group-hover:text-amber-500 transition-colors">{t(cat.translationKey)}</h3>
                <p className="text-xs text-stone-400 font-light uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                  {t(cat.descKey)}
                </p>
                <Link
                  to={`/menu?category=${cat.name}`}
                  className="mt-6 px-6 py-2 bg-amber-500 text-stone-900 text-[10px] font-bold uppercase tracking-widest rounded-full opacity-0 group-hover:opacity-100 transition-all duration-500 hover:bg-amber-400"
                >
                  View Items
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
