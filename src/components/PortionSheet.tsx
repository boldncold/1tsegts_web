import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Minus, Plus, X } from 'lucide-react';
import { MenuItem, Portion } from '../types';
import { useLanguage } from '../context/LanguageContext';
import { useBodyScrollLock } from '../lib/useBodyScrollLock';
import { useEscapeKey } from '../lib/useEscapeKey';

interface PortionSheetProps {
  item: MenuItem | null;
  canOrder: boolean;
  onClose: () => void;
  onAdd: (item: MenuItem, portion: Portion | undefined, quantity: number) => void;
}

/** Size and quantity picker: a bottom sheet on phones, a centred dialog from md up. */
export default function PortionSheet({ item, canOrder, onClose, onAdd }: PortionSheetProps) {
  useBodyScrollLock(!!item);
  useEscapeKey(!!item, onClose);

  return createPortal(
    <AnimatePresence>
      {item && <Sheet key={item.id} item={item} canOrder={canOrder} onClose={onClose} onAdd={onAdd} />}
    </AnimatePresence>,
    document.body
  );
}

function Sheet({ item, canOrder, onClose, onAdd }: PortionSheetProps & { item: MenuItem; key?: string }) {
  const { t } = useLanguage();
  const reduceMotion = useReducedMotion();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  // A sheet opened from a touch tap (the featured strip opens on pointer-up)
  // gets that tap's synthetic click on its backdrop; don't let it close the sheet.
  const openedAt = useRef(performance.now());

  // 'Default' is the base price; the server prices that exact name, so only
  // its on-screen label is translated.
  const sizes: Portion[] = item.portions?.length ? [{ name: 'Default', price: item.price }, ...item.portions] : [];
  const [size, setSize] = useState<Portion | undefined>(sizes[0]);
  const [qty, setQty] = useState(1);
  const unitPrice = size?.price ?? item.price;

  // Move focus into the dialog, and back to whatever opened it on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => opener?.focus();
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center md:p-4">
      <motion.div
        className="absolute inset-0 bg-[var(--scrim)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => performance.now() - openedAt.current > 400 && onClose()}
      />
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 48 }}
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        className="relative w-full md:max-w-[440px] max-h-[90vh] overflow-y-auto overscroll-contain outline-none bg-[var(--espresso)] border border-[var(--border-gold)] rounded-t-[var(--radius-card)] md:rounded-[var(--radius-card)] p-5 pb-[max(20px,env(safe-area-inset-bottom))]"
      >
        <span className="md:hidden block mx-auto mb-4 h-1 w-10 rounded-full bg-[var(--white-15)]" aria-hidden />
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute top-3 right-3 w-11 h-11 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-white hover:bg-[var(--white-06)]"
        >
          <X size={20} />
        </button>

        <div className="flex gap-4 pr-10 mb-5">
          <div className="w-16 h-16 shrink-0 rounded-[var(--radius-control)] overflow-hidden bg-[var(--surface-dish)]">
            {item.image && <img src={item.image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />}
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="leading-tight">{item.name}</h3>
            {item.description && <p className="text-sm text-[var(--text-muted)] mt-1 line-clamp-2">{item.description}</p>}
          </div>
        </div>

        {sizes.length > 0 && (
          <fieldset className="mb-5">
            <legend className="label !text-[var(--text-muted)] mb-2">{t('menu.select_portion')}</legend>
            <div className="flex flex-col gap-2">
              {sizes.map((portion) => (
                <label
                  key={portion.name}
                  className="flex justify-between items-center px-4 min-h-12 rounded-[var(--radius-control)] border border-[var(--white-15)] text-[var(--text-secondary)] cursor-pointer transition-colors hover:border-[var(--gold-soft-35)] has-[:checked]:border-[var(--gold-soft-60)] has-[:checked]:bg-[var(--gold-soft-10)] has-[:checked]:text-[var(--gold)] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--gold)]"
                >
                  <input
                    type="radio"
                    name={`size-${item.id}`}
                    className="sr-only"
                    checked={size?.name === portion.name}
                    onChange={() => setSize(portion)}
                  />
                  <span>{portion.name === 'Default' ? t('menu.portion_default') : portion.name}</span>
                  <span className="tabular-nums font-semibold">₮{portion.price.toLocaleString()}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="flex justify-between items-center mb-5">
          <span className="text-[var(--text-secondary)]">{t('menu.quantity')}</span>
          <div className="inline-flex items-center gap-2 rounded-full bg-[var(--espresso-2)] p-1">
            <button
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              aria-label="−1"
              className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--gold)] hover:bg-[var(--white-06)]"
            >
              <Minus size={16} />
            </button>
            <span className="min-w-6 text-center font-semibold tabular-nums" aria-live="polite">{qty}</span>
            <button
              onClick={() => setQty((q) => q + 1)}
              aria-label="+1"
              className="w-10 h-10 rounded-full flex items-center justify-center bg-[var(--gold)] text-[var(--text-on-gold)] hover:bg-[var(--gold-hover)]"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        <button
          onClick={() => { onAdd(item, size, qty); onClose(); }}
          disabled={!canOrder}
          className="btn btn-primary w-full justify-between disabled:bg-[var(--white-06)] disabled:text-[var(--text-muted)] disabled:cursor-not-allowed"
        >
          <span className="inline-flex items-center gap-2">
            <Plus size={16} /> {canOrder ? t('menu.add_to_cart') : t('menu.closed')}
          </span>
          <span className="tabular-nums">₮{(unitPrice * qty).toLocaleString()}</span>
        </button>
      </motion.div>
    </div>
  );
}
