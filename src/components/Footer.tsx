import { MapPin, Phone, Mail, Instagram, Facebook, Twitter } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';

export default function Footer() {
  const { t } = useLanguage();
  const location = useLocation();

  const handleLinkClick = (path: string) => {
    if (location.pathname === path) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-gray-50 border-t border-gray-200 pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Brand */}
          <div className="space-y-6">
            <Link 
              to="/" 
              onClick={() => handleLinkClick('/')}
              className="flex items-center space-x-2"
            >
              <span className="text-2xl font-serif font-bold tracking-tighter flex items-baseline">
                <span className="text-[#D4AF37] text-4xl mr-1 leading-none">1</span>
                <span className="text-[#8B0000]">ЦЭГЦ</span>
              </span>
            </Link>
            <p className="text-stone-500 font-light leading-relaxed">
              {t('footer.description')}
            </p>
            <div className="print-hidden flex space-x-4">
              <a href="#" className="p-2 bg-white rounded-full text-stone-400 hover:text-[#D4AF37] hover:shadow-md transition-all border border-gray-100">
                <Instagram size={18} />
              </a>
              <a href="#" className="p-2 bg-white rounded-full text-stone-400 hover:text-[#D4AF37] hover:shadow-md transition-all border border-gray-100">
                <Facebook size={18} />
              </a>
              <a href="#" className="p-2 bg-white rounded-full text-stone-400 hover:text-[#D4AF37] hover:shadow-md transition-all border border-gray-100">
                <Twitter size={18} />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div className="print-hidden space-y-6">
            <h4 className="text-xs uppercase tracking-[0.3em] text-stone-900 font-bold">{t('footer.quick_links')}</h4>
            <ul className="space-y-4">
              {[
                { name: t('nav.home'), path: '/' },
                { name: t('nav.menu'), path: '/menu' },
                { name: t('nav.about'), path: '/about' },
                { name: t('nav.contact'), path: '/contact' },
              ].map((link) => (
                <li key={link.path}>
                  <Link 
                    to={link.path} 
                    onClick={() => handleLinkClick(link.path)}
                    className="text-stone-500 hover:text-[#D4AF37] transition-colors text-sm"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact Info */}
          <div className="space-y-6">
            <h4 className="text-xs uppercase tracking-[0.3em] text-stone-900 font-bold">{t('footer.contact_us')}</h4>
            <ul className="space-y-4">
              <li className="flex items-start space-x-3 text-stone-500 text-sm">
                <MapPin size={18} className="text-[#D4AF37] shrink-0" />
                <span>{t('footer.location_detail')}</span>
              </li>
              <li className="flex items-center space-x-3 text-stone-500 text-sm">
                <Phone size={18} className="text-[#D4AF37] shrink-0" />
                <span>{t('footer.phone')}</span>
              </li>
              <li className="flex items-center space-x-3 text-stone-500 text-sm">
                <Mail size={18} className="text-[#D4AF37] shrink-0" />
                <span>{t('footer.email')}</span>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div className="space-y-6">
            <h4 className="text-xs uppercase tracking-[0.3em] text-stone-900 font-bold">{t('footer.opening_hours')}</h4>
            <ul className="space-y-4">
              <li className="flex justify-between text-sm">
                <span className="text-stone-500">{t('footer.mon')}</span>
                <span className="text-[#8B0000] font-bold uppercase tracking-widest text-[10px]">{t('footer.closed')}</span>
              </li>
              <li className="flex justify-between text-sm">
                <span className="text-stone-500">{t('footer.tue_sun')}</span>
                <span className="text-stone-900 font-bold">11:00 - 19:00</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-10 border-t border-gray-200 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-stone-400 text-xs">
            {t('footer.rights')}
          </p>
          <div className="print-hidden flex space-x-6 text-stone-400 text-xs">
            <Link to="/admin" className="hover:text-stone-600 transition-colors">{t('footer.admin')}</Link>
            <a href="#" className="hover:text-stone-600 transition-colors">{t('footer.privacy')}</a>
            <a href="#" className="hover:text-stone-600 transition-colors">{t('footer.terms')}</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
