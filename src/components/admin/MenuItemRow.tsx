import { Edit2, Star, Trash2 } from 'lucide-react';
import type { Key } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { cn, getScheduleLabel } from '../../lib/utils';
import { ItemStatus, MenuItem } from '../../types';

interface MenuItemRowProps {
  key?: Key;
  item: MenuItem;
  onEdit: (item: MenuItem) => void;
  onDelete: (id: string) => void;
  onChangeStatus: (item: MenuItem, status: ItemStatus) => void;
  onToggleFeatured: (item: MenuItem) => void;
  onChangeCategory: (item: MenuItem, value: string) => void;
  onChangeSchedule: (item: MenuItem, schedule: { todayOnly: boolean; scheduledDays: number[] }) => void;
}

export default function MenuItemRow({
  item,
  onEdit,
  onDelete,
  onChangeStatus,
  onToggleFeatured,
  onChangeCategory,
  onChangeSchedule,
}: MenuItemRowProps) {
  const { language, t } = useLanguage();
  const currentStatus = item.status || (item.available ? 'available' : 'hidden');
  const scheduleLabel = getScheduleLabel(item);
  const dayNames = language === 'en'
    ? ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
    : ['Ня', 'Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя'];
  const statusOptions: Array<{ value: ItemStatus; label: string; activeClass: string }> = [
    {
      value: 'available',
      label: language === 'en' ? 'Available' : 'Байгаа',
      activeClass: 'bg-[var(--admin-ok-soft)] text-[var(--admin-ok)]',
    },
    {
      value: 'sold_out_today',
      label: language === 'en' ? 'Sold out' : 'Дууссан',
      activeClass: 'bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]',
    },
    {
      value: 'hidden',
      label: language === 'en' ? 'Hidden' : 'Нуусан',
      activeClass: 'bg-[var(--white-06)] text-[var(--white-72)]',
    },
  ];

  return (
    <article className={cn(
      'border-t border-[var(--white-06)] transition-opacity',
      currentStatus === 'hidden' && 'opacity-55',
    )}>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-[180px] flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-sans text-[13px] font-semibold tracking-normal text-white">{item.name}</h3>
            {item.featured && <Star size={12} className="shrink-0 fill-[var(--gold)] text-[var(--gold)]" aria-label="Featured" />}
          </div>
          <p className="mt-1 truncate text-[11px] text-[var(--white-40)]">
            {item.pool === 'specials' ? 'Specials' : item.category} · ₮{Math.round(item.price).toLocaleString()}
            {scheduleLabel ? ` · ${scheduleLabel}` : ''} · {item.orderCount || 0} / 7d
          </p>
        </div>

        <div className="admin-scrollbar flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-[var(--white-06)] bg-[var(--stone-950)] p-0.5">
          {statusOptions.map((option) => (
            <button
              type="button"
              key={option.value}
              onClick={() => onChangeStatus(item, option.value)}
              className={cn(
                'h-7 whitespace-nowrap rounded-full px-2.5 text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--white-40)] transition-colors',
                currentStatus === option.value && option.activeClass,
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => onToggleFeatured(item)}
          title={language === 'en' ? 'Toggle featured' : 'Онцлох төлөв солих'}
          aria-label={language === 'en' ? 'Toggle featured' : 'Онцлох төлөв солих'}
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-[10px] border transition-colors',
            item.featured
              ? 'border-[var(--gold-soft-40)] bg-[var(--gold-soft-15)] text-[var(--gold)]'
              : 'border-[var(--white-06)] text-[var(--white-40)] hover:border-[var(--gold-soft-40)] hover:text-[var(--gold)]',
          )}
        >
          <Star size={14} className={item.featured ? 'fill-current' : ''} />
        </button>
        <button
          type="button"
          onClick={() => onEdit(item)}
          title={language === 'en' ? 'Edit' : 'Засах'}
          aria-label={language === 'en' ? 'Edit' : 'Засах'}
          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--white-06)] text-[var(--white-45)] transition-colors hover:border-[var(--gold-soft-40)] hover:text-[var(--gold)]"
        >
          <Edit2 size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          title={language === 'en' ? 'Delete' : 'Устгах'}
          aria-label={language === 'en' ? 'Delete' : 'Устгах'}
          className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--white-06)] text-[var(--white-40)] transition-colors hover:border-[var(--admin-danger-soft)] hover:text-[var(--admin-danger)]"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="admin-scrollbar flex items-center gap-1 overflow-x-auto border-t border-[var(--white-04)] px-4 py-2">
        <select
          value={item.pool === 'specials' ? 'Specials' : item.category}
          onChange={(event) => onChangeCategory(item, event.target.value)}
          className="admin-control h-7 min-h-7 shrink-0 rounded-full px-2.5 text-[10px] text-[var(--white-50)]"
          aria-label={language === 'en' ? 'Category' : 'Ангилал'}
        >
          <option value="Draft">{t('admin.menu.pool.master') || 'Draft'}</option>
          <option value="Specials">{t('menu.specials')}</option>
          <option value="European">{t('menu.european')}</option>
          <option value="Asian">{t('menu.asian')}</option>
          <option value="Mongolian">{t('menu.mongolian')}</option>
          <option value="Drinks">{t('menu.drinks')}</option>
        </select>
        <button
          type="button"
          onClick={() => onChangeSchedule(item, { todayOnly: !item.todayOnly, scheduledDays: [] })}
          className={cn(
            'h-7 shrink-0 rounded-full border px-2.5 text-[9px] font-bold uppercase tracking-[0.1em]',
            item.todayOnly
              ? 'border-[var(--gold-soft-40)] bg-[var(--gold-soft-15)] text-[var(--gold)]'
              : 'border-[var(--white-06)] text-[var(--white-40)]',
          )}
        >
          {language === 'en' ? 'Today' : 'Өнөөдөр'}
        </button>
        {dayNames.map((day, index) => {
          const selected = !item.todayOnly && item.scheduledDays?.includes(index);
          return (
            <button
              type="button"
              key={day}
              onClick={() => {
                const current = item.scheduledDays || [];
                const updated = selected ? current.filter((value) => value !== index) : [...current, index];
                onChangeSchedule(item, { scheduledDays: updated, todayOnly: false });
              }}
              className={cn(
                'size-7 shrink-0 rounded-full border text-[9px] font-bold',
                selected
                  ? 'border-[var(--gold-soft-40)] bg-[var(--gold-soft-15)] text-[var(--gold)]'
                  : 'border-[var(--white-06)] text-[var(--white-40)]',
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </article>
  );
}
