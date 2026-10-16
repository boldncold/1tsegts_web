import { MapPin, Phone } from 'lucide-react';
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

  const links = [
    { name: t('nav.home'), path: '/' },
    { name: t('nav.menu'), path: '/menu' },
    { name: t('nav.about'), path: '/about' },
    { name: t('nav.contact'), path: '/contact' },
  ];

  return (
    <footer className="bg-[var(--espresso)] text-white pt-14 pb-7">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          <div className="space-y-4">
            <Link to="/" onClick={() => handleLinkClick('/')} className="brand-wordmark text-2xl">
              <span className="one">1</span>
              <span className="word">ЦЭГЦ</span>
            </Link>
            <p className="text-sm max-w-[320px]">{t('footer.description')}</p>
          </div>

          <div className="space-y-4">
            <h4 className="label">{t('footer.quick_links')}</h4>
            <ul className="space-y-3 text-sm">
              {links.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    onClick={() => handleLinkClick(link.path)}
                    className="text-[var(--text-secondary)] hover:text-[var(--gold)]"
                  >
                    {link.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="label">{t('footer.contact_us')}</h4>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              <li className="flex items-start gap-2.5">
                <MapPin size={16} className="shrink-0 mt-0.5 text-[var(--gold)]" aria-hidden />
                <span>{t('footer.location_detail')}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone size={16} className="text-[var(--gold)]" aria-hidden />
                <a href={`tel:${t('footer.phone')}`} className="text-[var(--text-secondary)] hover:text-[var(--gold)]">
                  {t('footer.phone')}
                </a>
              </li>
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="label">{t('footer.opening_hours')}</h4>
            <ul className="space-y-3 text-sm text-[var(--text-secondary)]">
              <li className="flex justify-between">
                <span>{t('footer.tue_sun')}</span>
                <span className="text-white tabular-nums">11:00 – 19:00</span>
              </li>
              <li className="flex justify-between">
                <span>{t('footer.mon')}</span>
                <span className="text-[var(--text-muted)]">{t('footer.closed')}</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-[var(--border-gold)] flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>{t('footer.rights')}</span>
          <Link to="/admin" className="text-[var(--text-muted)] hover:text-white">
            {t('footer.admin')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
