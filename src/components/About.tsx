import { motion } from 'motion/react';
import { useLanguage } from '../context/LanguageContext';

export default function About() {
  const { t } = useLanguage();

  return (
    <div className="pt-32 pb-20 bg-white min-h-screen">
      <div className="max-w-4xl mx-auto px-4 text-center space-y-8">
        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-5xl font-medium text-stone-900"
        >
          {t('about.title')}
        </motion.h1>
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-stone-600 text-lg leading-relaxed font-light"
        >
          {t('about.description')}
        </motion.p>
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="aspect-video rounded-3xl overflow-hidden border border-gray-100 shadow-xl"
        >
          <img src="https://picsum.photos/seed/kitchen/1200/800" alt="Our Kitchen" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </motion.div>
      </div>
    </div>
  );
}
