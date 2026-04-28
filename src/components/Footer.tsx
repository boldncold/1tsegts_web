import { MapPin, Phone, Instagram, Facebook, Twitter, Gem } from 'lucide-react';
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
    <footer style={{ background: '#1a1510' }} className="text-white pt-14 pb-7">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          {/* Brand */}
          <div className="space-y-5">
            <Link
              to="/"
              onClick={() => handleLinkClick('/')}
              className="inline-flex items-baseline font-serif font-bold tracking-tighter"
            >
              <span className="text-[#D4AF37] text-4xl mr-0.5 leading-none">1</span>
              <span className="text-[#8B0000] text-2xl">ЦЭГЦ</span>
            </Link>
            <p
              className="font-serif italic text-sm leading-relaxed max-w-[320px]"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              {t('footer.description')}
            </p>
            <div className="flex gap-3">
              {[
                { Icon: Instagram, href: '#' },
                { Icon: Facebook, href: '#' },
                { Icon: Twitter, href: '#' },
              ].map(({ Icon, href }, i) => (
                <a
                  key={i}
                  href={href}
                  style={{ color: 'rgba(255,255,255,0.5)' }}
                  className="p-1.5 hover:text-[#D4AF37] transition-colors"
                >
                  <Icon size={16} />
                </a>
              ))}
            </div>
          </div>

          {/* Quick links */}
          <div className="space-y-5">
            <h4
              className="eyebrow"
              style={{ color: '#D4AF37' }}
            >
              {t('footer.quick_links')}
            </h4>
            <ul className="space-y-3">
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
                    className="text-sm transition-colors"
                    style={{ color: 'rgba(255,255,255,0.7)' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#D4AF37')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div className="space-y-5">
            <h4
              className="eyebrow"
              style={{ color: '#D4AF37' }}
            >
              {t('footer.contact_us')}
            </h4>
            <ul className="space-y-3">
              <li
                className="flex items-start gap-2.5 text-sm"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                <MapPin size={14} className="shrink-0 mt-0.5" style={{ color: '#D4AF37' }} />
                <span>{t('footer.location_detail')}</span>
              </li>
              <li
                className="flex items-center gap-2.5 text-sm"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                <Phone size={14} style={{ color: '#D4AF37' }} />
                <span>{t('footer.phone')}</span>
              </li>
            </ul>
          </div>

          {/* Hours */}
          <div className="space-y-5">
            <h4
              className="eyebrow"
              style={{ color: '#D4AF37' }}
            >
              {t('footer.opening_hours')}
            </h4>
            <ul className="space-y-3 text-sm">
              <li
                className="flex justify-between"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                <span>{t('footer.mon')}</span>
                <span
                  className="font-bold text-[10px] uppercase tracking-widest"
                  style={{ color: '#8B0000' }}
                >
                  {t('footer.closed')}
                </span>
              </li>
              <li
                className="flex justify-between"
                style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                <span>{t('footer.tue_sun')}</span>
                <span className="font-bold text-white font-variant-numeric tabular-nums">
                  11:00 – 19:00
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          className="pt-6 flex flex-col sm:flex-row justify-between items-center gap-3"
          style={{ borderTop: '1px solid rgba(212,175,55,0.15)' }}
        >
          <div
            className="flex items-center gap-2 text-[11px] tracking-[0.1em]"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            <Gem size={11} style={{ color: '#D4AF37' }} />
            {t('footer.rights')}
          </div>
          <div
            className="flex gap-5 text-[11px]"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            <Link
              to="/admin"
              className="hover:text-white transition-colors"
            >
              {t('footer.admin')}
            </Link>
            <a href="#" className="hover:text-white transition-colors">
              {t('footer.privacy')}
            </a>
            <a href="#" className="hover:text-white transition-colors">
              {t('footer.terms')}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
