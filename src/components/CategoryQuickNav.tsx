import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useCachedQuery } from '../lib/useCachedQuery';
import { api } from '../../convex/_generated/api';
import { Category, MenuItem } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { getDynamicStatus } from '../lib/utils';

const categories: { name: Category; translationKey: string }[] = [
  { name: 'European', translationKey: 'menu.european' },
  { name: 'Asian', translationKey: 'menu.asian' },
  { name: 'Mongolian', translationKey: 'menu.mongolian' },
  { name: 'Drinks', translationKey: 'menu.drinks' },
];

/** Each tile shows a real dish from its category: featured first, then most ordered. */
function pickCover(items: MenuItem[]): string | undefined {
  return [...items]
    .filter((item) => item.image)
    .sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || (b.orderCount ?? 0) - (a.orderCount ?? 0))[0]?.image;
}

export default function CategoryQuickNav() {
  const { t } = useLanguage();
  const menu = useCachedQuery(api.menu.list);

  const tiles = useMemo(() => {
    const visible = ((menu ?? []) as MenuItem[]).filter(
      (item) => item.pool !== 'specials' && getDynamicStatus(item).isVisible
    );
    return categories.map((cat) => {
      const items = visible.filter((item) => item.category === cat.name);
      return { ...cat, count: items.length, cover: pickCover(items) };
    });
  }, [menu]);

  return (
    <section id="categories" className="pt-12 md:pt-16 bg-[var(--surface-page)]">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8">
        <h2 className="mb-6">{t('menu.select_cuisine')}</h2>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {tiles.map((tile) => (
            <Link
              key={tile.name}
              to={`/menu?category=${tile.name}`}
              className="group relative aspect-[4/3] overflow-hidden rounded-2xl border border-[var(--border-subtle)] hover:border-[var(--border-gold-strong)] transition-colors"
              style={tile.cover ? undefined : { background: 'var(--dish-fallback-bg)' }}
            >
              {tile.cover && (
                <img
                  src={tile.cover}
                  alt=""
                  // Not lazy: on phones these tiles are in the first screen and
                  // one of them is usually the page's largest image, which
                  // lazy loading would hold back until after layout.
                  decoding="async"
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3 sm:p-5">
                <h3 className="text-white group-hover:text-[var(--gold)] transition-colors">
                  {t(tile.translationKey)}
                </h3>
                {menu !== undefined && (
                  <p className="text-[var(--text-secondary)] mt-1">
                    {tile.count} {t(tile.count === 1 ? 'menu.dish' : 'menu.dishes')}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
