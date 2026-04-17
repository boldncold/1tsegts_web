import { motion } from 'motion/react';
import { MapPin, Phone, Mail, Clock } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

export default function Contact() {
  const { t } = useLanguage();

  return (
    <div className="pt-32 pb-20 bg-stone-950 min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16 space-y-4">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-serif font-bold text-stone-100"
          >
            {t('contact.title')}
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-stone-400 text-lg"
          >
            {t('contact.subtitle')}
          </motion.p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-8"
          >
            <div className="flex items-start space-x-6">
              <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-500">
                <MapPin size={24} />
              </div>
              <div>
                <h3 className="text-xl font-serif font-bold text-stone-100">{t('contact.location')}</h3>
                <p className="text-stone-400">{t('contact.location.detail')}</p>
              </div>
            </div>
            <div className="flex items-start space-x-6">
              <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-500">
                <Phone size={24} />
              </div>
              <div>
                <h3 className="text-xl font-serif font-bold text-stone-100">{t('contact.phone')}</h3>
                <p className="text-stone-400">{t('contact.phone_detail')}</p>
              </div>
            </div>
            <div className="flex items-start space-x-6">
              <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-500">
                <Mail size={24} />
              </div>
              <div>
                <h3 className="text-xl font-serif font-bold text-stone-100">{t('contact.email')}</h3>
                <p className="text-stone-400">hello@euroasiacuisine.com</p>
              </div>
            </div>
            <div className="flex items-start space-x-6">
              <div className="p-4 bg-amber-500/10 rounded-2xl text-amber-500">
                <Clock size={24} />
              </div>
              <div>
                <h3 className="text-xl font-serif font-bold text-stone-100">{t('contact.hours')}</h3>
                <p className="text-stone-400">{t('contact.hours.detail')}</p>
              </div>
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-stone-900 border border-stone-800 rounded-3xl p-8 shadow-xl"
          >
            <form className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('contact.form.name')}</label>
                <input type="text" className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors" placeholder={t('contact.form.placeholder.name')} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('contact.form.email')}</label>
                <input type="email" className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors" placeholder={t('contact.form.placeholder.email')} />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('contact.form.message')}</label>
                <textarea className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors h-32 resize-none" placeholder={t('contact.form.placeholder.message')}></textarea>
              </div>
              <button className="w-full py-4 bg-amber-500 text-stone-900 font-bold uppercase tracking-widest rounded-full hover:bg-amber-400 transition-all active:scale-95 shadow-lg shadow-amber-500/20">
                {t('contact.form.send')}
              </button>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
