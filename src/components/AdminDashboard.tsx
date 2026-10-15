import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Link } from 'react-router-dom';
import {
  Plus, Edit2, Trash2, Check, X, LogOut,
  LayoutDashboard, ShoppingBag, List, Settings,
  ChevronRight, AlertCircle, Save, Image as ImageIcon,
  Clock, CheckCircle2, XCircle, Package, Star, Users,
  Search, Minus, Filter, Banknote, Inbox, Link2, ExternalLink
} from 'lucide-react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { useAuthActions } from '@convex-dev/auth/react';
import { ConvexError } from 'convex/values';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { MenuItem, Order, Category, OrderStatus, Portion, OrderType, ItemStatus, StoreSettings, BankTransaction, BankTxMatchStatus } from '../types';
import PaymentBadge from './admin/PaymentBadge';
import MenuItemRow from './admin/MenuItemRow';
import OverviewTab from './admin/OverviewTab';
import OrdersTab from './admin/OrdersTab';
import { getUBDateString } from './admin/orderUtils';
import { cn, getMidnightTonight, getScheduleLabel, getDynamicStatus, DEFAULT_STORE_SETTINGS, isStoreOpen } from '../lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';

/** A menu image as the server stores it (convex/validators.ts imageRef). */
type ImageRef = { storageId: Id<'_storage'> } | { url: string };

/** The machine-readable code a Convex function threw, if any. */
function errorCode(error: unknown): string | undefined {
  return error instanceof ConvexError ? (error.data as { code?: string }).code : undefined;
}

const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

function MenuItemCard({
  item,
  onEdit,
  onDelete,
  onChangeStatus,
  onToggleFeatured,
  onChangeCategory,
  onChangeSchedule,
}: {
  item: MenuItem,
  onEdit: (item: MenuItem) => void,
  onDelete: (id: string) => void,
  onChangeStatus: (item: MenuItem, status: ItemStatus) => void,
  onToggleFeatured: (item: MenuItem) => void,
  onChangeCategory: (item: MenuItem, value: string) => void,
  onChangeSchedule: (item: MenuItem, schedule: { todayOnly: boolean; scheduledDays: number[] }) => void,
  key?: React.Key
}) {
  const { t } = useLanguage();
  const currentStatus = item.status || (item.available ? 'available' : 'hidden');
  const scheduleLabel = getScheduleLabel(item);

  let statusColorClass = "bg-stone-500/20 text-stone-400 border-stone-500/30 hover:bg-stone-500/40";
  if (currentStatus === 'available') statusColorClass = "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/40";
  if (currentStatus === 'sold_out_today') statusColorClass = "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/40";
  if (currentStatus === 'daily_special') statusColorClass = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/40";

  return (
    <div className="group relative h-56 bg-stone-950 border border-stone-800 rounded-3xl overflow-hidden hover:border-[var(--admin-accent-soft-50)] transition-all shadow-lg flex flex-col">
      {/* Background Image */}
      {item.image && (
        <img
          src={item.image}
          alt={item.name}
          className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-50 transition-opacity duration-500"
          referrerPolicy="no-referrer"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/60 to-stone-950/20" />

      {/* Top Controls */}
      <div className="absolute top-3 left-3 right-3 flex justify-between items-start z-10">
        <select
          value={currentStatus}
          onChange={(e) => { e.stopPropagation(); onChangeStatus(item, e.target.value as ItemStatus); }}
          className={cn(
            "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest transition-all backdrop-blur-md border outline-none appearance-none cursor-pointer text-center max-w-[160px] truncate shadow-sm",
            statusColorClass
          )}
        >
          <option value="available" className="bg-stone-900 text-green-400">Available</option>
          <option value="sold_out_today" className="bg-stone-900 text-red-400">Sold Out</option>
          <option value="hidden" className="bg-stone-900 text-stone-400">Hidden</option>
        </select>
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleFeatured(item); }}
          className={cn(
            "p-2 rounded-full transition-colors backdrop-blur-md border shadow-lg",
            item.featured 
              ? "bg-[var(--admin-accent-soft-20)] text-[var(--admin-accent-text)] border-[var(--admin-accent-soft-50)] hover:bg-[var(--admin-accent-soft-30)]" 
              : "bg-stone-900/50 text-stone-500 border-stone-800 hover:text-[var(--admin-accent-hover)] hover:border-[var(--admin-accent-soft-30)]"
          )}
        >
          <Star size={16} className={item.featured ? "fill-[var(--admin-accent-text)]" : ""} />
        </button>
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center text-center px-6 mt-4">
        <p className="text-lg font-bold text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] line-clamp-2">{item.name}</p>
        <p className="text-xs text-[var(--admin-accent-text)] font-bold uppercase tracking-[0.2em] tabular-nums mt-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          ₮{Math.round(item.price).toLocaleString()}
        </p>
        {scheduleLabel && (
          <span className="mt-2 inline-flex items-center gap-1 bg-stone-900/80 backdrop-blur-sm border border-[var(--admin-accent-soft-30)] px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest text-[var(--admin-accent-text)]">
            <Clock size={8} /> {scheduleLabel}
          </span>
        )}
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 bg-stone-950/80 backdrop-blur-md border-t border-stone-800 translate-y-0 sm:translate-y-full sm:group-hover:translate-y-0 transition-transform duration-300 z-10">
        {/* Schedule row */}
        <div className="px-3 pt-2.5 pb-1.5 border-b border-stone-800/60">
          <div className="flex items-center gap-1 flex-wrap">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onChangeSchedule(item, { todayOnly: !item.todayOnly, scheduledDays: [] });
              }}
              className={cn(
                "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest transition-colors border",
                item.todayOnly
                  ? "bg-[var(--admin-accent-soft-20)] text-[var(--admin-accent-text)] border-[var(--admin-accent-soft-40)]"
                  : "bg-stone-800 text-stone-500 border-stone-700 hover:border-[var(--admin-accent-soft-30)] hover:text-stone-300"
              )}
            >
              Today
            </button>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, idx) => {
              const selected = !item.todayOnly && item.scheduledDays?.includes(idx);
              return (
                <button
                  key={day}
                  onClick={(e) => {
                    e.stopPropagation();
                    const current = item.scheduledDays || [];
                    const updated = selected ? current.filter(d => d !== idx) : [...current, idx];
                    onChangeSchedule(item, { scheduledDays: updated, todayOnly: false });
                  }}
                  className={cn(
                    "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest transition-colors border",
                    selected
                      ? "bg-[var(--admin-accent-soft-20)] text-[var(--admin-accent-text)] border-[var(--admin-accent-soft-40)]"
                      : "bg-stone-800 text-stone-500 border-stone-700 hover:border-[var(--admin-accent-soft-30)] hover:text-stone-300"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
        {/* Category + actions row */}
        <div className="p-3 flex items-center justify-between gap-2">
          <select
            value={item.pool === 'specials' ? 'Specials' : item.category}
            onChange={(e) => onChangeCategory(item, e.target.value)}
            className="bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-300 focus:border-[var(--admin-accent)] outline-none flex-1"
          >
            <option value="Draft">{t('admin.menu.pool.master') || 'Draft Pool'}</option>
            <option value="Specials">{t('menu.specials')}</option>
            <option value="European">{t('menu.european')}</option>
            <option value="Asian">{t('menu.asian')}</option>
            <option value="Mongolian">{t('menu.mongolian')}</option>
            <option value="Drinks">{t('menu.drinks')}</option>
          </select>
          <div className="flex gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(item); }}
              className="p-1.5 bg-stone-800 rounded-lg text-stone-300 hover:text-[var(--admin-accent)] transition-colors border border-stone-700 hover:border-[var(--admin-accent-soft-50)]"
              title="Edit"
            >
              <Edit2 size={14} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
              className="p-1.5 bg-stone-800 rounded-lg text-stone-300 hover:text-red-500 transition-colors border border-stone-700 hover:border-red-500/50"
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  message 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  onConfirm: () => void, 
  title: string, 
  message: string 
}) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="relative w-full max-w-md bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl overflow-hidden"
          >
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                <AlertCircle className="text-red-500" size={32} />
              </div>
              <h3 className="text-xl font-bold text-stone-100 mb-2">{title}</h3>
              <p className="text-stone-400 text-sm leading-relaxed">{message}</p>
            </div>
            <div className="flex border-t border-stone-800">
              <button
                onClick={onClose}
                className="flex-1 py-4 text-sm font-bold uppercase tracking-widest text-stone-500 hover:bg-stone-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="flex-1 py-4 text-sm font-bold uppercase tracking-widest text-red-500 hover:bg-red-500 hover:text-white transition-colors border-l border-stone-800"
              >
                Confirm
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/**
 * Two-tone kitchen chime + background-tab title alert for incoming orders.
 * WebAudio needs no sound asset; browsers may keep the context suspended
 * until the admin has interacted with the page once — then it's silent, and
 * the title flash still works.
 */
function notifyNewOrder(pendingCount: number) {
  try {
    const ctx = new AudioContext();
    void ctx.resume?.();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.frequency.setValueAtTime(1175, ctx.currentTime + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.start();
    osc.stop(ctx.currentTime + 0.6);
  } catch {
    // no audio available — title flash below still fires
  }
  if (document.hidden) {
    document.title = `(${pendingCount}) Шинэ захиалга!`;
  }
}

/**
 * Now as a `datetime-local` value (YYYY-MM-DDTHH:mm). The input reads its value
 * as browser-local time, so this can't come from toISOString() — that's UTC and
 * would post every manual entry 8 hours early in Ulaanbaatar.
 */
function nowForDateTimeLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminDashboard() {
  const { t, language } = useLanguage();
  const { currentUser: user, isAdmin, isAdminLoading: loading } = useAuth();
  const { signIn, signOut } = useAuthActions();

  // Live admin data. 'skip' until the server confirms admin rights; every one
  // of these functions also checks on the server (convex/lib/admin.ts).
  const adminMenu = useQuery(api.menuAdmin.list, isAdmin ? {} : 'skip');
  const recentOrders = useQuery(api.ordersAdmin.recent, isAdmin ? {} : 'skip');
  const adminList = useQuery(api.staff.listAdmins, isAdmin ? {} : 'skip');
  const recentBankTxs = useQuery(api.bank.recent, isAdmin ? {} : 'skip');
  const savedStoreSettings = useQuery(api.settings.getStore, isAdmin ? {} : 'skip');

  const generateUploadUrl = useMutation(api.menuAdmin.generateUploadUrl);
  const saveMenuItem = useMutation(api.menuAdmin.save);
  const updateMenuItem = useMutation(api.menuAdmin.update);
  const removeMenuItem = useMutation(api.menuAdmin.remove);
  const setOrderStatus = useMutation(api.ordersAdmin.setStatus);
  const removeOrder = useMutation(api.ordersAdmin.remove);
  const createCounterOrder = useMutation(api.ordersAdmin.createCounterOrder);
  const confirmPayment = useMutation(api.payments.confirmPayment);
  const acceptReviewedPayment = useMutation(api.payments.acceptReviewedPayment);
  const markReviewRefunded = useMutation(api.payments.markReviewRefunded);
  const refundOrder = useAction(api.qpay.refund);
  const addBankTx = useMutation(api.bank.add);
  const addAdmin = useMutation(api.staff.addAdmin);
  const removeAdmin = useMutation(api.staff.removeAdmin);
  const saveStoreSettings = useMutation(api.settings.saveStore);
  const [activeTab, setActiveTab] = useState<'overview' | 'menu' | 'orders' | 'bank_history' | 'settings'>('overview');
  
  // Search States
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [menuFilterCategory, setMenuFilterCategory] = useState<Category | 'All'>('All');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // Menu State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editForm, setEditForm] = useState<Partial<MenuItem>>({});

  // Bank History State
  const [bankTransactions, setBankTransactions] = useState<BankTransaction[]>([]);
  const [bankFilter, setBankFilter] = useState<'all' | 'unmatched' | 'matched'>('all');
  const [showAddBankTx, setShowAddBankTx] = useState(false);
  const [bankTxForm, setBankTxForm] = useState({
    amountMnt: '',
    description: '',
    senderName: '',
    postedAt: nowForDateTimeLocal(),
  });

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [adminOrderItems, setAdminOrderItems] = useState<{item: MenuItem, quantity: number, selectedPortion?: Portion}[]>([]);
  const [adminOrderForm, setAdminOrderForm] = useState({
    orderType: 'pickup' as OrderType,
    kioskNumber: ''
  });

  // getUBDateString now lives in ./admin/orderUtils (shared with the filter).

  const [selectedDate, setSelectedDate] = useState<string>(() => getUBDateString(new Date()));

  // Baseline for the new-order alert (null until the first orders snapshot).
  const prevPendingIdsRef = useRef<Set<string> | null>(null);

  // Restore the tab title once the admin looks at the dashboard again.
  useEffect(() => {
    const restore = () => {
      if (!document.hidden) document.title = '1ЦЭГЦ';
    };
    document.addEventListener('visibilitychange', restore);
    return () => document.removeEventListener('visibilitychange', restore);
  }, []);

  const last7Days = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return getUBDateString(d);
  });

  // Staff State
  const [adminEmails, setAdminEmails] = useState<{id: string}[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const [storeSettings, setStoreSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);

  useEffect(() => {
    if (loading) return;
    if (user && !isAdmin) {
      toast.error('Access denied. Admin privileges required.');
    }
  }, [loading, user, isAdmin]);

  useEffect(() => {
    // Cast at the boundary: the schema's unions are wider than src/types.ts
    // (legacy 'Specials' category, legacy paidVia values).
    if (adminMenu) setMenuItems(adminMenu as unknown as MenuItem[]);
  }, [adminMenu]);

  useEffect(() => {
    if (!recentOrders) return;
    // Orders are no longer deleted from here (the old janitor removed paid
    // orders after 7 days); cancelled ones older than a day just stay off the board.
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const validOrders = (recentOrders as unknown as Order[]).filter(
      (order) => !(order.status === 'cancelled' && new Date(order.timestamp) < oneDayAgo),
    );
    setOrders(validOrders);

    // New-order alert: chime + tab-title flash when a pending order appears
    // that wasn't in the previous result. The first result only seeds the
    // baseline — no alert.
    const pendingIds = new Set(
      validOrders.filter((o) => o.status === 'pending').map((o) => o.id),
    );
    const prev = prevPendingIdsRef.current;
    if (prev && [...pendingIds].some((id) => !prev.has(id))) {
      notifyNewOrder(pendingIds.size);
    }
    prevPendingIdsRef.current = pendingIds;
  }, [recentOrders]);

  useEffect(() => {
    if (adminList) setAdminEmails(adminList.map((email) => ({ id: email })));
  }, [adminList]);

  useEffect(() => {
    if (recentBankTxs) setBankTransactions(recentBankTxs as unknown as BankTransaction[]);
  }, [recentBankTxs]);

  useEffect(() => {
    if (savedStoreSettings) setStoreSettings({ ...DEFAULT_STORE_SETTINGS, ...savedStoreSettings });
  }, [savedStoreSettings]);

  const handleLogin = async () => {
    try {
      // Redirects to Google and back to /admin (Convex Auth).
      await signIn('google', { redirectTo: '/admin' });
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Failed to login.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success('Logged out successfully.');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Admin Order Actions
  const addToAdminOrder = (item: MenuItem, portion?: Portion) => {
    setAdminOrderItems(prev => {
      const existing = prev.find(i => i.item.id === item.id && i.selectedPortion?.name === portion?.name);
      if (existing) {
        return prev.map(i => i.item.id === item.id && i.selectedPortion?.name === portion?.name ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { item, quantity: 1, selectedPortion: portion }];
    });
  };

  const removeFromAdminOrder = (itemId: string, portionName?: string) => {
    setAdminOrderItems(prev => {
      const existing = prev.find(i => i.item.id === itemId && i.selectedPortion?.name === portionName);
      if (existing && existing.quantity > 1) {
        return prev.map(i => i.item.id === itemId && i.selectedPortion?.name === portionName ? { ...i, quantity: i.quantity - 1 } : i);
      }
      return prev.filter(i => !(i.item.id === itemId && i.selectedPortion?.name === portionName));
    });
  };

  const handleCreateAdminOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (adminOrderItems.length === 0) {
      toast.error('Please add at least one item.');
      return;
    }

    try {
      // Priced and numbered on the server (convex/ordersAdmin.ts).
      const { orderNumber } = await createCounterOrder({
        items: adminOrderItems.map(i => ({
          menuId: i.item.id,
          quantity: i.quantity,
          ...(i.selectedPortion ? { portionName: i.selectedPortion.name } : {}),
        })),
        orderType: adminOrderForm.orderType,
        ...(adminOrderForm.orderType === 'kiosk' && adminOrderForm.kioskNumber
          ? { kioskNumber: adminOrderForm.kioskNumber }
          : {}),
      });
      toast.success(`Order #${orderNumber} created and started!`);
      setIsAddingOrder(false);
      setAdminOrderItems([]);
      setAdminOrderForm({
        orderType: 'pickup',
        kioskNumber: ''
      });
    } catch (error) {
      console.error('Create order error:', error);
      toast.error('Failed to create order.');
    }
  };

  // Menu Actions
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const uiCategory = (editForm.category as any) as string;
      const isSpecialsPool = uiCategory === 'Specials';

      // Images: a fresh upload is a data URL from compressImage; an unchanged
      // image comes back as the URL we served, mapped to its stored reference.
      const editing = isEditing ? adminMenu?.find((m) => m.id === isEditing) : undefined;
      const known = new Map<string, ImageRef>();
      if (editing?.imageRef && editing.image) known.set(editing.image, editing.imageRef);
      editing?.sideImages.forEach((url, i) => {
        const ref = editing.sideImageRefs[i];
        if (ref) known.set(url, ref);
      });
      const resolveImage = async (src: string): Promise<ImageRef> => {
        const existing = known.get(src);
        if (existing) return existing;
        if (!src.startsWith('data:')) return { url: src };
        const blob = await (await fetch(src)).blob();
        const res = await fetch(await generateUploadUrl(), {
          method: 'POST',
          headers: { 'Content-Type': blob.type },
          body: blob,
        });
        if (!res.ok) throw new Error(`Image upload failed: HTTP ${res.status}`);
        const { storageId } = (await res.json()) as { storageId: Id<'_storage'> };
        return { storageId };
      };
      // No photo means no image: the menu shows its own fallback. Never invent one.
      const image = editForm.image ? await resolveImage(editForm.image) : undefined;
      const sideImages = await Promise.all((editForm.sideImages || []).map(resolveImage));

      await saveMenuItem({
        ...(isEditing ? { id: isEditing as Id<'menu'> } : {}),
        item: {
          name: editForm.name ?? '',
          description: editForm.description ?? '',
          price: Math.round(Number(editForm.price)),
          packagingPrice: editForm.packagingPrice !== undefined ? Math.round(Number(editForm.packagingPrice)) : 0,
          available: editForm.available ?? true,
          status: editForm.status || 'available',
          statusUntil: editForm.statusUntil ?? null,
          todayOnly: editForm.todayOnly ?? false,
          scheduledDays: editForm.scheduledDays || [],
          featured: editForm.featured ?? false,
          tags: editForm.tags || [],
          category: (isSpecialsPool ? 'Draft' : (editForm.category || 'Draft')) as Category,
          pool: isSpecialsPool ? 'specials' : null,
          portions: (editForm.portions || []).map(p => ({
            name: p.name,
            price: Number(p.price),
            ...(p.available !== undefined ? { available: p.available } : {}),
          })),
        },
        image,
        sideImages,
      });
      toast.success(isEditing ? 'Item updated!' : 'Item added to Draft Pool!');
      setIsEditing(null);
      setIsAdding(false);
      setEditForm({});
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Failed to save item.');
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    try {
      const compressedImages = await Promise.all(files.slice(0, 3).map(compressImage));
      
      setEditForm(prev => {
        let mainImage = prev.image;
        const newSideImages = [...(prev.sideImages || [])];
        
        let startIndex = 0;
        if (!mainImage && compressedImages.length > 0) {
          mainImage = compressedImages[0];
          startIndex = 1;
        }
        
        for (let i = startIndex; i < compressedImages.length; i++) {
          if (newSideImages.length < 2) {
            newSideImages.push(compressedImages[i]);
          }
        }

        return { ...prev, image: mainImage, sideImages: newSideImages };
      });
    } catch (error) {
      console.error("Error compressing images:", error);
      toast.error("Failed to process images.");
    }
  };

  const handleReplaceImage = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      setEditForm(prev => {
        if (index === -1) {
          return { ...prev, image: compressed };
        } else {
          const newSide = [...(prev.sideImages || [])];
          newSide[index] = compressed;
          return { ...prev, sideImages: newSide };
        }
      });
    } catch (error) {
      console.error(error);
      toast.error("Failed to process image.");
    }
  };

  const handleChangeStatus = async (item: MenuItem, newStatus: ItemStatus) => {
    try {
      const updates: Partial<MenuItem> = { status: newStatus };
      
      // Keep legacy available flag in sync for backward compatibility
      if (newStatus === 'available') {
        updates.available = true;
      } else {
        updates.available = false;
      }

      if (newStatus === 'sold_out_today') {
        updates.statusUntil = getMidnightTonight();
      } else {
        updates.statusUntil = null as any;
      }

      await updateMenuItem({
        id: item.id as Id<'menu'>,
        changes: { status: newStatus, available: updates.available, statusUntil: updates.statusUntil ?? null },
      });
      toast.success(`${item.name} status updated to ${newStatus.replace(/_/g, ' ')}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update status');
    }
  };

  const handleToggleFeatured = async (item: MenuItem) => {
    try {
      await updateMenuItem({ id: item.id as Id<'menu'>, changes: { featured: !item.featured } });
      toast.success(`${item.name} is ${!item.featured ? 'Featured' : 'Unfeatured'}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update featured status');
    }
  };

  const handleChangeSchedule = async (item: MenuItem, schedule: { todayOnly: boolean; scheduledDays: number[] }) => {
    try {
      const updates: Partial<MenuItem> = {
        todayOnly: schedule.todayOnly,
        scheduledDays: schedule.scheduledDays,
      };
      if (schedule.todayOnly) updates.statusUntil = getMidnightTonight();
      await updateMenuItem({
        id: item.id as Id<'menu'>,
        changes: {
          todayOnly: schedule.todayOnly,
          scheduledDays: schedule.scheduledDays,
          ...(updates.statusUntil !== undefined ? { statusUntil: updates.statusUntil } : {}),
        },
      });
      toast.success(`${item.name} schedule updated`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update schedule');
    }
  };

  const handleChangeCategory = async (item: MenuItem, newValue: string) => {
    try {
      if (newValue === 'Specials') {
        await updateMenuItem({ id: item.id as Id<'menu'>, changes: { pool: 'specials' } });
      } else {
        await updateMenuItem({ id: item.id as Id<'menu'>, changes: { category: newValue as Category, pool: null } });
      }
      toast.success(`${item.name} moved to ${newValue}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update category');
    }
  };

  const handleDeleteItem = async (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Menu Item',
      message: 'Are you sure you want to delete this item? This action cannot be undone.',
      onConfirm: async () => {
        try {
          await removeMenuItem({ id: id as Id<'menu'> });
          toast.success('Item deleted.');
        } catch (error) {
          console.error('Delete error:', error);
          toast.error('Failed to delete item.');
        }
      }
    });
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      await updateMenuItem({ id: item.id as Id<'menu'>, changes: { available: !item.available } });
      toast.success(`Item ${!item.available ? 'available' : 'unavailable'}`);
    } catch (error) {
      console.error('Toggle error:', error);
    }
  };

  // Order Actions
  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    const order = orders.find((candidate) => candidate.id === orderId);
    if (!order) {
      toast.error('Order not found');
      return;
    }
    if (
      status === 'preparing' &&
      (order.paymentMethod === 'qpay' || order.paymentMethod === 'bank_transfer') &&
      order.paymentStatus !== 'CONFIRMED'
    ) {
      toast.error(t('admin.orders.payment.awaiting'));
      return;
    }
    try {
      await setOrderStatus({ orderId: orderId as Id<'orders'>, status });
      toast.success(`Order status updated to ${status}`);
    } catch (error) {
      console.error('Status update error:', error);
      // The server enforces the payment gate too (convex/ordersAdmin.ts).
      toast.error(errorCode(error) === 'AWAITING_PAYMENT'
        ? t('admin.orders.payment.awaiting')
        : 'Failed to update order status');
    }
  };

  // Reconciliation: asks payments.confirmPayment to flip paymentStatus →
  // CONFIRMED. Called from:
  //   1. The admin "Mark Paid" button on an order card
  //   2. The "Confirm Order" button on a matched bank tx row
  // The customer's screen updates through the orders.track subscription in CartContext.
  //
  // The mutation owns the state guard (only AWAITING_PAYMENT confirms), the
  // idempotency, and the bank-tx reconcile write — all in one transaction. The
  // client never writes paymentStatus itself.
  const markOrderPaid = async (
    orderId: string,
    matchedTxId?: string,
    opts?: { silent?: boolean; via?: 'admin_manual' }
  ) => {
    // Cash was handed over at the counter, so the prompt asks about the cash
    // rather than about a bank transfer the cashier never looked at.
    const isCashOrder =
      orders.find((o) => o.id === orderId)?.paymentMethod === 'cash';
    const prompt = isCashOrder
      ? t('admin.orders.confirm_cash')
      : t('admin.orders.confirm_paid');

    if (!opts?.silent && !window.confirm(prompt)) return;
    try {
      // Who confirmed is recorded server-side from the signed-in admin.
      const data = await confirmPayment({
        orderId: orderId as Id<'orders'>,
        ...(matchedTxId ? { bankTxId: matchedTxId as Id<'bankTransactions'> } : {}),
      });

      if (data.updated) {
        if (!opts?.silent) toast.success(t('admin.orders.confirm.success'));
        return;
      }

      // A refusal is never silent-by-default: an admin who believes money
      // arrived for an order the system has written off must see that.
      // 'already_confirmed' is the one benign case — the webhook won the race.
      if (data.reason === 'already_confirmed') {
        if (!opts?.silent) toast.info(t('admin.orders.confirm.already'));
      } else if (data.reason?.startsWith('bad_state:')) {
        const state = data.reason.slice('bad_state:'.length);
        toast.error(`${t('admin.orders.confirm.bad_state')}: ${state}`);
      } else if (data.reason === 'order_not_found') {
        toast.error(t('admin.orders.confirm.not_found'));
      } else {
        toast.error(t('admin.orders.confirm.failed'));
      }
      console.warn('confirmOrderPayment refused:', { orderId, matchedTxId, reason: data.reason });
    } catch (error) {
      console.error('Mark paid error:', error);
      toast.error(t('admin.orders.confirm.failed'));
    }
  };

  // Settling a flagged (MANUAL_REVIEW) payment: real money the server could not
  // confirm by itself. Accepting makes the order paid (and reopens it if the
  // customer had cancelled); refunded-by-hand records money returned outside QPay.
  const handleAcceptReview = async (orderId: string) => {
    if (!window.confirm(t('admin.orders.attention.confirm_accept'))) return;
    try {
      await acceptReviewedPayment({ orderId: orderId as Id<'orders'> });
      toast.success(t('admin.orders.attention.accepted'));
    } catch (error) {
      console.error('Accept reviewed payment error:', error);
      toast.error(t('admin.orders.attention.failed'));
    }
  };

  const handleRefundReview = async (orderId: string) => {
    const note = window.prompt(t('admin.orders.attention.prompt_refund'), '');
    if (note === null) return;
    try {
      await markReviewRefunded({ orderId: orderId as Id<'orders'>, ...(note.trim() ? { note } : {}) });
      toast.success(t('admin.orders.attention.refunded_done'));
    } catch (error) {
      console.error('Mark review refunded error:', error);
      toast.error(t('admin.orders.attention.failed'));
    }
  };

  // QPay refund — calls the qpay.refund action (admin-verified).
  // Card payments are auto-refunded by QPay; P2P (bank-app) payments can't be,
  // so the function returns a P2P_NOT_REFUNDABLE error we surface as guidance.
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const refundQpayOrder = async (orderId: string) => {
    if (!window.confirm(t('admin.orders.confirm_refund'))) return;
    setRefundingId(orderId);
    try {
      await refundOrder({ orderId: orderId as Id<'orders'> });
      toast.success(t('admin.orders.refund.success'));
    } catch (error: any) {
      // convex/qpay.ts refund: P2P_NOT_REFUNDABLE, or QPAY_REFUND_FAILED with QPay's key.
      const data = error instanceof ConvexError ? (error.data as { code?: string; reason?: string }) : {};
      if (data.code === 'P2P_NOT_REFUNDABLE') {
        toast.error(t('admin.orders.refund.p2p'));
      } else {
        const detail = data.code === 'QPAY_REFUND_FAILED' ? data.reason : data.code;
        toast.error(
          detail
            ? `${t('admin.orders.refund.failed')}: ${detail}`
            : t('admin.orders.refund.failed'),
        );
      }
      console.error('Refund error:', error);
    } finally {
      setRefundingId(null);
    }
  };

  /**
   * Reads the match the server computed. Matching moved to
   * functions/src/bankMatching.ts — reconcileBankTransaction on ingest and
   * sweepBankTransactions every 5 minutes — so there is one implementation
   * instead of one per open dashboard.
   *
   * matchedOrderId now means "the order this currently matches", not "the order
   * this was reconciled against"; check matchStatus === 'reconciled' for proof
   * of payment.
   */
  const readMatchStatus = (
    tx: BankTransaction,
  ): { status: BankTxMatchStatus; orderId?: string } => ({
    status: tx.matchStatus ?? 'unmatched',
    orderId: tx.matchedOrderId,
  });

  // Auto-confirm used to live here as a useEffect, which meant it only ran while
  // an admin had this page open. It is now reconcileBankTransaction (on ingest)
  // plus sweepBankTransactions (every 5 minutes) in functions/, so a customer's
  // transfer confirms whether or not anyone is looking at the dashboard.

  // Manual add — used while the Apps Script ingestion isn't set up yet, and as a
  // permanent escape hatch for transfers that come in via SMS or other channels.
  const handleAddBankTransaction = async () => {
    const amount = parseInt(bankTxForm.amountMnt, 10);
    if (!amount || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    try {
      // Matched against orders on the server as it is saved (convex/bank.ts).
      await addBankTx({
        amountMnt: amount,
        description: bankTxForm.description,
        ...(bankTxForm.senderName ? { senderName: bankTxForm.senderName } : {}),
        postedAt: new Date(bankTxForm.postedAt).toISOString(),
      });
      toast.success('Transaction added');
      setShowAddBankTx(false);
      setBankTxForm({
        amountMnt: '',
        description: '',
        senderName: '',
        postedAt: nowForDateTimeLocal(),
      });
    } catch (err) {
      console.error('Add bank tx error', err);
      toast.error('Failed to add transaction');
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (window.confirm('Are you sure you want to delete this order?')) {
      try {
        await removeOrder({ orderId: orderId as Id<'orders'> });
        toast.success('Order deleted');
      } catch (error) {
        console.error('Error deleting order:', error);
        // Paid, refunded and under-review orders are financial records; an
        // issued QPay invoice can still be paid.
        const code = errorCode(error);
        toast.error(code === 'HOLDS_PAYMENT'
          ? 'This order holds a payment and cannot be deleted. Cancel or refund it instead.'
          : code === 'HAS_QPAY_INVOICE'
            ? 'This order has a QPay invoice that could still be paid, so it cannot be deleted. Cancel it instead.'
            : 'Failed to delete order');
      }
    }
  };

  // Staff Actions
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail) return;
    try {
      await addAdmin({ email: newAdminEmail });
      setNewAdminEmail('');
      toast.success('Admin email added!');
    } catch (error) {
      console.error('Add admin error:', error);
      toast.error('Failed to add admin email.');
    }
  };

  const handleDeleteAdmin = async (email: string) => {
    if (email === 'boldsaihanlolor@gmail.com') {
      toast.error('Cannot remove the primary admin.');
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'Remove Admin',
      message: `Are you sure you want to remove ${email} from the admin list?`,
      onConfirm: async () => {
        try {
          await removeAdmin({ email });
          toast.success('Admin email removed.');
        } catch (error) {
          console.error('Delete admin error:', error);
          toast.error('Failed to remove admin email.');
        }
      }
    });
  };

  const handleUpdateStoreSetting = async (updates: Partial<StoreSettings>) => {
    try {
      const merged = { ...storeSettings, ...updates };
      await saveStoreSettings({ settings: merged });
      toast.success('Store settings updated');
    } catch (error) {
      console.error(error);
      toast.error('Failed to update store settings');
    }
  };

  const pendingOrderCount = orders.filter((order) => order.status === 'pending').length;
  const matchedBankCount = bankTransactions.filter(
    (transaction) => readMatchStatus(transaction).status === 'matched',
  ).length;
  const storeOpen = isStoreOpen(storeSettings);
  const adminNavigation = [
    { id: 'overview' as const, label: language === 'en' ? 'Overview' : 'Тойм', icon: LayoutDashboard },
    { id: 'menu' as const, label: t('admin.nav.menu'), icon: List },
    { id: 'orders' as const, label: t('admin.nav.orders'), icon: ShoppingBag, badge: pendingOrderCount },
    { id: 'bank_history' as const, label: t('admin.nav.bank_history'), icon: Banknote, badge: matchedBankCount },
    { id: 'settings' as const, label: language === 'en' ? 'Store' : 'Тохиргоо', icon: Settings },
  ];

  if (loading) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <div className="size-10 animate-spin rounded-full border-2 border-[var(--gold)] border-t-transparent"></div>
    </div>
  );

  if (!user || !isAdmin) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="admin-shell admin-card w-full max-w-[400px] space-y-6 border-[var(--gold-soft-15)] p-8 text-center"
      >
        <span className="brand-wordmark justify-center text-xl" aria-label="1ЦЭГЦ">
          <span className="one">1</span><span className="word">ЦЭГЦ</span>
        </span>
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-[var(--gold-soft-10)] text-[var(--gold)]">
          <Settings size={26} />
        </div>
        <h2 className="font-serif text-2xl font-semibold tracking-normal text-stone-100">{t('admin.login.title')}</h2>
        <p className="font-light text-[var(--white-50)]">{t('admin.login.subtitle')}</p>
        <button
          onClick={handleLogin}
          className="w-full rounded-full bg-[var(--gold)] py-3.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--stone-950)] transition-colors hover:bg-[var(--gold-hover)]"
        >
          {t('admin.login.button')}
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="admin-shell min-h-[100dvh] bg-[var(--stone-950)] text-stone-100">
      <div className="flex h-[100dvh] flex-col overflow-hidden lg:flex-row">
        <header className="z-20 flex h-[54px] shrink-0 items-center justify-between border-b border-[var(--gold-soft-15)] bg-[rgba(21,16,10,0.92)] px-4 backdrop-blur-xl lg:hidden">
          <div className="flex items-center gap-3">
            <span className="brand-wordmark text-sm" aria-label="1ЦЭГЦ">
              <span className="one">1</span><span className="word">ЦЭГЦ</span>
            </span>
            <span className="micro-label !text-[9px] !tracking-[0.22em] !text-[var(--gold)]">Admin</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.14em]',
              storeOpen
                ? 'bg-[var(--admin-ok-soft)] text-[var(--admin-ok)]'
                : 'bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]',
            )}>
              <span className="size-1.5 rounded-full bg-current" />
              {storeOpen ? (language === 'en' ? 'Open' : 'Нээлттэй') : (language === 'en' ? 'Closed' : 'Хаалттай')}
            </span>
            <Link
              to="/menu"
              title={language === 'en' ? 'View customer menu' : 'Үндсэн меню харах'}
              aria-label={language === 'en' ? 'View customer menu' : 'Үндсэн меню харах'}
              className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--gold-soft-25)] text-[var(--gold)] transition-colors hover:border-[var(--gold)] hover:bg-[var(--gold-soft-10)]"
            >
              <ExternalLink size={14} />
            </Link>
            <img src={user?.photoURL} alt={user?.displayName || 'User'} className="size-8 rounded-full border border-[var(--gold-soft-30)] object-cover" />
          </div>
        </header>

        <aside className="z-20 hidden h-[100dvh] w-[220px] shrink-0 flex-col border-r border-[var(--gold-soft-15)] bg-[var(--admin-sidebar)] lg:flex">
          <div className="flex items-center justify-between border-b border-[var(--white-06)] px-5 py-[18px]">
            <div className="flex flex-col gap-2">
              <span className="brand-wordmark text-[17px]" aria-label="1ЦЭГЦ">
                <span className="one">1</span><span className="word">ЦЭГЦ</span>
              </span>
              <span className="micro-label !text-[9px] !tracking-[0.22em] !text-[var(--gold)] opacity-75">Admin</span>
            </div>
            <Link
              to="/menu"
              title={language === 'en' ? 'View customer menu' : 'Үндсэн меню харах'}
              aria-label={language === 'en' ? 'View customer menu' : 'Үндсэн меню харах'}
              className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--white-06)] text-[var(--white-45)] transition-colors hover:border-[var(--gold-soft-40)] hover:text-[var(--gold)]"
            >
              <ExternalLink size={15} />
            </Link>
          </div>

          <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Admin">
            {adminNavigation.map(({ id, label, icon: NavIcon, badge }) => {
              const isActive = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] font-bold tracking-[0.04em] transition-colors',
                    isActive
                      ? 'bg-[var(--gold)] text-[var(--stone-950)]'
                      : 'text-[var(--white-45)] hover:bg-[var(--white-04)] hover:text-[var(--white-72)]',
                  )}
                >
                  <NavIcon size={17} />
                  <span className="truncate">{label}</span>
                  {!!badge && (
                    <span className={cn(
                      'ml-auto inline-flex min-w-[17px] items-center justify-center rounded-full px-1.5 py-0.5 text-[9px] font-bold tabular-nums',
                      isActive ? 'bg-[var(--stone-950)] text-[var(--gold)]' : 'bg-[var(--gold)] text-[var(--stone-950)]',
                    )}>
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div className="space-y-3 border-t border-[var(--white-06)] p-4">
            <Link
              to="/menu"
              className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--gold)] py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--stone-950)] transition-colors hover:bg-[var(--gold-hover)]"
            >
              <ExternalLink size={13} />
              <span>{language === 'en' ? 'View menu' : 'Үндсэн меню'}</span>
            </Link>
            <div className="flex items-center gap-2.5">
              <img src={user?.photoURL} alt={user?.displayName || 'User'} className="size-8 rounded-full border border-[var(--gold-soft-30)] object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-white">{user?.displayName}</p>
                <p className="truncate text-[10px] text-[var(--white-40)]">{user?.email}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-[var(--white-06)] py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--white-40)] transition-colors hover:border-[var(--admin-danger-soft)] hover:text-[var(--admin-danger)]"
            >
              <LogOut size={13} />
              <span>{t('admin.nav.logout')}</span>
            </button>
          </div>
        </aside>

        <main className="admin-scrollbar flex-1 overflow-y-auto bg-[var(--stone-950)] p-4 pb-28 lg:p-7 lg:pb-10">
          <div className="mx-auto w-full max-w-[1180px]">
          <AnimatePresence mode="wait">
            {activeTab === 'overview' ? (
              <motion.div
                key="overview"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="admin-pane"
              >
                <OverviewTab
                  orders={orders}
                  menuItems={menuItems}
                  bankTransactions={bankTransactions}
                  storeOpen={storeOpen}
                  getBankMatchStatus={readMatchStatus}
                  onNavigate={setActiveTab}
                  onUpdateStatus={updateOrderStatus}
                />
              </motion.div>
            ) : activeTab === 'menu' ? (
              <motion.div
                key="menu"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="min-w-0">
                    <h2 className="font-serif text-2xl font-semibold tracking-normal">{t('admin.menu.title')}</h2>
                    <p className="mt-1 text-sm text-[var(--white-45)]">{menuItems.length} {language === 'en' ? 'dishes' : 'хоол'} · {menuItems.filter((item) => item.status === 'sold_out_today').length} {language === 'en' ? 'sold out' : 'дууссан'}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full md:w-auto">
                    <div className="admin-scrollbar flex max-w-full min-w-0 overflow-x-auto rounded-full border border-[var(--white-06)] bg-[var(--stone-950)] p-1">
                      {['All', 'Draft', 'Specials', 'European', 'Asian', 'Mongolian', 'Drinks'].map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setMenuFilterCategory(cat as Category | 'All')}
                          className={cn(
                            "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap",
                            menuFilterCategory === cat 
                              ? "bg-[var(--admin-accent)] text-stone-900 shadow-md" 
                              : "text-stone-400 hover:text-stone-200 hover:bg-stone-800"
                          )}
                        >
                          {cat === 'Draft' ? (t('admin.menu.pool.master') || 'Drafts') : cat === 'All' ? t('menu.all') : t(`menu.${cat.toLowerCase()}`)}
                        </button>
                      ))}
                    </div>
                    <div className="relative w-full sm:w-auto flex-1 min-w-0">
                      <input
                        type="text"
                        placeholder="Search menu..."
                        value={menuSearchQuery}
                        onChange={(e) => setMenuSearchQuery(e.target.value)}
                        className="admin-control w-full rounded-[10px] px-10 py-2 text-sm"
                      />
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 items-stretch w-full sm:w-auto">
                      <button
                        onClick={() => {
                          setIsAdding(true);
                          setIsEditing(null);
                          setEditForm({ category: 'Draft', available: false, status: 'hidden' });
                        }}
                        className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 bg-[var(--admin-accent)] text-stone-900 font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-[var(--admin-accent-hover)] transition-all active:scale-95"
                      >
                        <Plus size={18} />
                        <span>{t('admin.menu.add')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="admin-card overflow-hidden">
                  {menuItems
                    .filter(i => {
                      if (menuFilterCategory === 'All') return true;
                      if (menuFilterCategory === 'Specials') return i.pool === 'specials';
                      return i.category === menuFilterCategory && i.pool !== 'specials';
                    })
                    .filter(i => i.name.toLowerCase().includes(menuSearchQuery.toLowerCase()) || i.description.toLowerCase().includes(menuSearchQuery.toLowerCase()))
                    .map(item => (
                      <MenuItemRow
                        key={item.id} 
                        item={item} 
                        onEdit={(item) => { setIsEditing(item.id); setEditForm(item.pool === 'specials' ? { ...item, category: 'Specials' as any } : item); }}
                        onDelete={handleDeleteItem}
                        onChangeStatus={handleChangeStatus}
                        onToggleFeatured={handleToggleFeatured}
                        onChangeCategory={handleChangeCategory}
                        onChangeSchedule={handleChangeSchedule}
                      />
                    ))}
                  
                  {menuItems.filter(i => {
                      if (menuFilterCategory === 'All') return true;
                      if (menuFilterCategory === 'Specials') return i.pool === 'specials';
                      return i.category === menuFilterCategory && i.pool !== 'specials';
                    }).length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-[var(--white-40)]">
                      <Package size={48} className="mb-4 opacity-20" />
                      <p className="text-lg font-bold">No items found</p>
                      <p className="text-sm">Try adjusting your filters or add a new item.</p>
                    </div>
                  )}
                </div>
              </motion.div>
            ) : activeTab === 'orders' ? (
              <motion.div
                key="orders"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
              >
                <OrdersTab
                  orders={orders}
                  selectedDate={selectedDate}
                  setSelectedDate={setSelectedDate}
                  last7Days={last7Days}
                  searchQuery={orderSearchQuery}
                  setSearchQuery={setOrderSearchQuery}
                  onNewOrder={() => setIsAddingOrder(true)}
                  onMarkPaid={(id) => markOrderPaid(id)}
                  onAcceptReview={handleAcceptReview}
                  onRefundReview={handleRefundReview}
                  onRefund={refundQpayOrder}
                  refundingId={refundingId}
                  onUpdateStatus={updateOrderStatus}
                  onDelete={handleDeleteOrder}
                />
              </motion.div>
            ) : activeTab === 'bank_history' ? (
              <motion.div
                key="bank_history"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                  <div>
                    <h2 className="font-serif text-2xl font-semibold tracking-normal">{t('admin.bank.title')}</h2>
                    <p className="mt-1 text-sm text-[var(--white-45)]">{t('admin.bank.subtitle')}</p>
                  </div>
                  <button
                    onClick={() => {
                      // The form state is created when the dashboard mounts, so
                      // without this the default time is however old the tab is.
                      setBankTxForm((f) => ({ ...f, postedAt: nowForDateTimeLocal() }));
                      setShowAddBankTx(true);
                    }}
                    className="flex min-h-9 items-center gap-2 rounded-full bg-[var(--gold)] px-4 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--stone-950)] transition-colors hover:bg-[var(--gold-hover)]"
                  >
                    <Plus size={16} />
                    {t('admin.bank.action.add_manual')}
                  </button>
                </div>

                {/* Stats row */}
                {(() => {
                  const todayStart = new Date();
                  todayStart.setHours(0, 0, 0, 0);
                  const todayTotal = bankTransactions
                    .filter((tx) => tx.direction === 'credit' && new Date(tx.postedAt) >= todayStart)
                    .reduce((sum, tx) => sum + tx.amountMnt, 0);
                  const weekTotal = bankTransactions
                    .filter((tx) => tx.direction === 'credit')
                    .reduce((sum, tx) => sum + tx.amountMnt, 0);
                  const unmatchedCount = bankTransactions.filter(
                    (tx) => readMatchStatus(tx).status === 'unmatched'
                              || readMatchStatus(tx).status === 'unknown_ref'
                  ).length;
                  const matchedReadyCount = bankTransactions.filter(
                    (tx) => readMatchStatus(tx).status === 'matched'
                  ).length;
                  return (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="admin-card p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-1">
                          {t('admin.bank.stats.today')}
                        </p>
                        <p className="text-xl font-bold text-stone-100 tabular-nums">₮{todayTotal.toLocaleString()}</p>
                      </div>
                      <div className="admin-card p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-1">
                          {t('admin.bank.stats.week')}
                        </p>
                        <p className="text-xl font-bold text-stone-100 tabular-nums">₮{weekTotal.toLocaleString()}</p>
                      </div>
                      <div className="admin-card border-[var(--gold-soft-30)] bg-[var(--gold-soft-10)] p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-yellow-500/80 font-semibold mb-1">
                          {t('admin.bank.stats.matched')}
                        </p>
                        <p className="text-xl font-bold text-yellow-400 tabular-nums">{matchedReadyCount}</p>
                      </div>
                      <div className="admin-card p-4">
                        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold mb-1">
                          {t('admin.bank.stats.unmatched')}
                        </p>
                        <p className="text-xl font-bold text-stone-300 tabular-nums">{unmatchedCount}</p>
                      </div>
                    </div>
                  );
                })()}

                {/* Filter pills */}
                <div className="flex w-fit rounded-full border border-[var(--white-06)] bg-[var(--stone-950)] p-1">
                  {(['all', 'unmatched', 'matched'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setBankFilter(f)}
                      className={cn(
                        "px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all",
                        bankFilter === f
                          ? "bg-[var(--admin-accent)] text-stone-900"
                          : "text-stone-400 hover:text-stone-200"
                      )}
                    >
                      {t(`admin.bank.filter.${f}`)}
                    </button>
                  ))}
                </div>

                {/* Transactions list */}
                {(() => {
                  const filtered = bankTransactions.filter((tx) => {
                    if (bankFilter === 'all') return true;
                    const m = readMatchStatus(tx).status;
                    if (bankFilter === 'matched') return m === 'matched' || m === 'reconciled';
                    return m === 'unmatched' || m === 'unknown_ref' || m === 'amount_mismatch';
                  });

                  if (filtered.length === 0) {
                    return (
                      <div className="admin-card border-dashed p-12 text-center">
                        <Inbox className="mx-auto text-stone-600 mb-3" size={40} />
                        <p className="text-stone-500 italic">{t('admin.bank.empty')}</p>
                      </div>
                    );
                  }

                  // Below md each row stacks as a card (time + amount, then
                  // description, then match + action); from md up it's a table.
                  return (
                    <div className="admin-card admin-scrollbar overflow-x-auto">
                      <table className="block w-full md:table md:min-w-[720px]">
                        <thead className="hidden md:table-header-group bg-stone-950 border-b border-stone-800">
                          <tr>
                            <th className="text-left text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold p-4">
                              {t('admin.bank.col.time')}
                            </th>
                            <th className="text-left text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold p-4 hidden md:table-cell">
                              {t('admin.bank.col.sender')}
                            </th>
                            <th className="text-right text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold p-4">
                              {t('admin.bank.col.amount')}
                            </th>
                            <th className="text-left text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold p-4">
                              {t('admin.bank.col.description')}
                            </th>
                            <th className="text-right text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold p-4">
                              {t('admin.bank.col.match')}
                            </th>
                          </tr>
                        </thead>
                        <tbody className="block md:table-row-group divide-y divide-stone-800">
                          {filtered.map((tx) => {
                            const m = readMatchStatus(tx);
                            const matchedOrder = m.orderId ? orders.find((o) => o.id === m.orderId) : undefined;
                            return (
                              <tr key={tx.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 p-4 md:table-row md:p-0 hover:bg-stone-800/40 transition-colors">
                                <td className="md:p-4 align-top">
                                  <p className="text-xs text-stone-300 tabular-nums whitespace-nowrap">
                                    {new Date(tx.postedAt).toLocaleString('en-GB', {
                                      day: '2-digit', month: 'short',
                                      hour: '2-digit', minute: '2-digit',
                                    })}
                                  </p>
                                  <p className="text-[10px] text-stone-600 mt-0.5">
                                    {t(`admin.bank.source.${tx.source}`)}
                                  </p>
                                </td>
                                <td className="p-4 align-top hidden md:table-cell">
                                  <p className="text-sm text-stone-300 truncate max-w-[200px]">
                                    {tx.senderName || '—'}
                                  </p>
                                </td>
                                <td className="md:p-4 align-top text-right">
                                  <p className="text-sm font-bold text-green-400 tabular-nums whitespace-nowrap">
                                    +₮{tx.amountMnt.toLocaleString()}
                                  </p>
                                </td>
                                <td className="col-span-2 md:p-4 align-top md:max-w-[280px]">
                                  <p className="text-xs text-stone-400 break-words">
                                    {/* highlight ref code if present */}
                                    {tx.description?.split(/(GR-[A-Z2-9]{6})/i).map((part, i) =>
                                      /^GR-[A-Z2-9]{6}$/i.test(part) ? (
                                        <span key={i} className="inline-block px-1.5 py-0.5 bg-[var(--admin-accent-soft-15)] text-[var(--admin-accent-text)] rounded font-bold tabular-nums">
                                          {part.toUpperCase()}
                                        </span>
                                      ) : (
                                        <span key={i}>{part}</span>
                                      )
                                    )}
                                  </p>
                                </td>
                                <td className="col-span-2 flex flex-wrap items-center gap-2 md:table-cell md:p-4 align-top md:text-right md:space-y-1.5">
                                  <span className={cn(
                                    "inline-block text-[9px] uppercase tracking-[0.18em] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap",
                                    m.status === 'matched' && "bg-yellow-500/15 text-yellow-400 border-yellow-500/40",
                                    m.status === 'reconciled' && "bg-green-500/10 text-green-400 border-green-500/30",
                                    m.status === 'amount_mismatch' && "bg-red-500/10 text-red-400 border-red-500/30",
                                    m.status === 'unknown_ref' && "bg-stone-800 text-stone-500 border-stone-700",
                                    m.status === 'unmatched' && "bg-stone-800 text-stone-500 border-stone-700",
                                  )}>
                                    {t(`admin.bank.match.${m.status}`)}
                                  </span>
                                  {matchedOrder && (
                                    <p className="text-[10px] text-stone-500 flex items-center justify-end gap-1">
                                      <Link2 size={10} />
                                      #{(matchedOrder as any).orderNumber ?? matchedOrder.id.slice(-6)}
                                    </p>
                                  )}
                                  {m.status === 'matched' && m.orderId && (
                                    <button
                                      onClick={() => markOrderPaid(m.orderId!, tx.id)}
                                      className="block w-full md:w-auto md:ml-auto md:mt-1 px-3 py-2 md:py-1 bg-yellow-500 text-stone-900 text-[10px] font-bold uppercase tracking-wider rounded-full hover:bg-yellow-400 transition-all"
                                    >
                                      ₮ {t('admin.bank.action.confirm_order')}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Add-manual modal */}
                {showAddBankTx && (
                  <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="admin-card w-full max-w-md space-y-4 border-[var(--gold-soft-15)] p-5">
                      <div className="flex justify-between items-start">
                        <h3 className="text-xl font-bold text-stone-100">{t('admin.bank.modal.title')}</h3>
                        <button
                          onClick={() => setShowAddBankTx(false)}
                          className="p-1 text-stone-400 hover:text-stone-200"
                        >
                          <X size={20} />
                        </button>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">
                            {t('admin.bank.modal.amount')}
                          </label>
                          <input
                            type="number"
                            value={bankTxForm.amountMnt}
                            onChange={(e) => setBankTxForm({ ...bankTxForm, amountMnt: e.target.value })}
                            className="admin-control mt-1 w-full px-3 py-2.5 tabular-nums"
                            placeholder="50000"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">
                            {t('admin.bank.modal.description')}
                          </label>
                          <input
                            type="text"
                            value={bankTxForm.description}
                            onChange={(e) => setBankTxForm({ ...bankTxForm, description: e.target.value })}
                            className="admin-control mt-1 w-full px-3 py-2.5 text-sm"
                            placeholder="GR-K7P3M9"
                          />
                          <p className="text-[10px] text-stone-500 mt-1">
                            Include the GR-XXXXXX code so it can auto-match.
                          </p>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">
                            {t('admin.bank.modal.sender')}
                          </label>
                          <input
                            type="text"
                            value={bankTxForm.senderName}
                            onChange={(e) => setBankTxForm({ ...bankTxForm, senderName: e.target.value })}
                            className="admin-control mt-1 w-full px-3 py-2.5 text-sm"
                            placeholder="Optional"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">
                            {t('admin.bank.modal.posted_at')}
                          </label>
                          <input
                            type="datetime-local"
                            value={bankTxForm.postedAt}
                            onChange={(e) => setBankTxForm({ ...bankTxForm, postedAt: e.target.value })}
                            className="admin-control mt-1 w-full px-3 py-2.5 [color-scheme:dark]"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleAddBankTransaction}
                        className="w-full py-3 bg-[var(--admin-accent)] text-stone-900 font-bold uppercase tracking-widest text-xs rounded-full hover:bg-[var(--admin-accent-hover)] transition-all"
                      >
                        {t('admin.bank.modal.save')}
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            ) : (
              <motion.div
                key="settings"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div>
                  <h2 className="font-serif text-2xl font-semibold tracking-normal">{language === 'en' ? 'Store' : 'Тохиргоо'}</h2>
                  <p className="mt-1 text-sm text-[var(--white-45)]">{language === 'en' ? 'Hours, temporary closures, and staff access' : 'Цагийн хуваарь, түр хаалт, ажилтны эрх'}</p>
                </div>

                <div className="max-w-3xl space-y-4">
                  {/* Operating Hours card */}
                  <div className="admin-card space-y-5 p-5">
                    <h4 className="text-xs uppercase tracking-widest text-stone-500 font-bold">Operating Hours</h4>

                    <div className="flex items-end gap-4">
                      <div className="flex-1 space-y-1.5">
                        <label className="text-xs text-stone-400">Opens at</label>
                        <select
                          value={storeSettings.openHour}
                          onChange={(e) => handleUpdateStoreSetting({ openHour: Number(e.target.value) })}
                          className="admin-control w-full px-3 py-2 text-sm"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                          ))}
                        </select>
                      </div>
                      <div className="pb-2.5 text-stone-600 font-bold">→</div>
                      <div className="flex-1 space-y-1.5">
                        <label className="text-xs text-stone-400">Closes at</label>
                        <select
                          value={storeSettings.closeHour}
                          onChange={(e) => handleUpdateStoreSetting({ closeHour: Number(e.target.value) })}
                          className="admin-control w-full px-3 py-2 text-sm"
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={i}>{i.toString().padStart(2, '0')}:00</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-stone-400">Regular Closed Days</label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day, idx) => {
                          const isClosed = storeSettings.closedDays.includes(idx);
                          return (
                            <button
                              key={day}
                              onClick={() => {
                                const updated = isClosed
                                  ? storeSettings.closedDays.filter(d => d !== idx)
                                  : [...storeSettings.closedDays, idx];
                                handleUpdateStoreSetting({ closedDays: updated });
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors border",
                                isClosed
                                  ? "bg-red-500/20 text-red-400 border-red-500/40"
                                  : "bg-stone-800 text-stone-400 border-stone-700 hover:border-[var(--admin-accent-soft-30)] hover:text-stone-200"
                              )}
                            >
                              {day}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-stone-600">Red = closed that day every week</p>
                    </div>
                  </div>

                  {/* Temporary Overrides card */}
                  <div className="admin-card space-y-6 p-5">
                    <h4 className="text-xs uppercase tracking-widest text-stone-500 font-bold">Temporary Overrides</h4>

                    {/* Closed Until */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-stone-300">Closed Until Date</label>
                      <p className="text-xs text-stone-500">Customers cannot order until the day after this date</p>
                      <div className="flex gap-3">
                        <input
                          type="date"
                          value={storeSettings.closedUntil || ''}
                          onChange={(e) => handleUpdateStoreSetting({ closedUntil: e.target.value || null })}
                          className="admin-control flex-1 px-3 py-2 text-sm [color-scheme:dark]"
                        />
                        {storeSettings.closedUntil && (
                          <button
                            onClick={() => handleUpdateStoreSetting({ closedUntil: null })}
                            className="px-4 py-2 bg-stone-800 border border-stone-700 rounded-xl text-stone-400 hover:text-red-400 hover:border-red-500/40 transition-colors text-xs font-bold"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {storeSettings.closedUntil && (
                        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                          <AlertCircle size={14} />
                          <span>Store is closed to customers through {storeSettings.closedUntil}</span>
                        </div>
                      )}
                    </div>

                    {/* No closed day until */}
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-stone-300">Open All Days Until Date</label>
                      <p className="text-xs text-stone-500">Closed-day rule is suspended through this date</p>
                      <div className="flex gap-3">
                        <input
                          type="date"
                          value={storeSettings.noClosedDayUntil || ''}
                          onChange={(e) => handleUpdateStoreSetting({ noClosedDayUntil: e.target.value || null })}
                          className="admin-control flex-1 px-3 py-2 text-sm [color-scheme:dark]"
                        />
                        {storeSettings.noClosedDayUntil && (
                          <button
                            onClick={() => handleUpdateStoreSetting({ noClosedDayUntil: null })}
                            className="px-4 py-2 bg-stone-800 border border-stone-700 rounded-xl text-stone-400 hover:text-red-400 hover:border-red-500/40 transition-colors text-xs font-bold"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      {storeSettings.noClosedDayUntil && (
                        <div className="flex items-center gap-2 text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2">
                          <CheckCircle2 size={14} />
                          <span>Open every day through {storeSettings.noClosedDayUntil}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <section className="admin-card overflow-hidden">
                    <div className="border-b border-[var(--white-06)] p-5">
                      <h3 className="font-serif text-lg font-semibold tracking-normal text-white">{t('admin.staff.title')}</h3>
                      <p className="mt-1 text-xs text-[var(--white-45)]">{t('admin.staff.subtitle')}</p>
                      <form onSubmit={handleAddAdmin} className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <input
                          required
                          type="email"
                          value={newAdminEmail}
                          onChange={(event) => setNewAdminEmail(event.target.value)}
                          placeholder={t('admin.staff.form.placeholder')}
                          className="admin-control flex-1 px-3 text-sm"
                        />
                        <button
                          type="submit"
                          className="min-h-9 rounded-full bg-[var(--gold)] px-5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--stone-950)] transition-colors hover:bg-[var(--gold-hover)]"
                        >
                          {t('admin.staff.form.button')}
                        </button>
                      </form>
                    </div>
                    <div className="divide-y divide-[var(--white-06)]">
                      <div className="flex items-center justify-between gap-3 px-5 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--gold-soft-15)] text-[var(--gold)]">
                            <Star size={13} fill="currentColor" />
                          </span>
                          <span className="truncate text-xs font-semibold text-white">boldsaihanlolor@gmail.com</span>
                        </div>
                        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--gold)]">{t('admin.staff.primary')}</span>
                      </div>
                      {adminEmails.map((admin) => (
                        <div key={admin.id} className="flex items-center justify-between gap-3 px-5 py-3">
                          <span className="truncate text-xs text-[var(--white-72)]">{admin.id}</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteAdmin(admin.id)}
                            title={language === 'en' ? 'Remove admin' : 'Админ хасах'}
                            aria-label={language === 'en' ? 'Remove admin' : 'Админ хасах'}
                            className="inline-flex size-8 items-center justify-center rounded-[10px] border border-[var(--white-06)] text-[var(--white-40)] transition-colors hover:border-[var(--admin-danger-soft)] hover:text-[var(--admin-danger)]"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--gold-soft-15)] bg-[rgba(21,16,10,0.94)] px-1 pb-[calc(6px+env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden" aria-label="Admin">
          {adminNavigation.map(({ id, label, icon: NavIcon, badge }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={cn(
                'relative flex min-w-0 flex-col items-center gap-1 px-0 py-1.5 text-[var(--white-40)] transition-colors',
                activeTab === id && 'text-[var(--gold)]',
              )}
            >
              <NavIcon size={19} />
              <span className="w-full truncate text-[8px] font-bold uppercase tracking-[0.08em]">{label}</span>
              {!!badge && (
                <span className="absolute left-1/2 top-0 ml-1.5 inline-flex min-w-3.5 items-center justify-center rounded-full bg-[var(--gold)] px-1 py-0.5 text-[8px] font-bold text-[var(--stone-950)] tabular-nums">
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Edit/Add Modal */}
      <AnimatePresence>
        {(isEditing || isAdding) && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => { setIsEditing(null); setIsAdding(false); }}
              className="fixed inset-0 z-[100] bg-stone-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="fixed inset-0 z-[110] flex items-center justify-center p-4 pointer-events-none"
            >
              <div className="w-full max-w-2xl max-h-[90dvh] flex flex-col bg-stone-900 border border-stone-800 rounded-3xl shadow-2xl pointer-events-auto overflow-hidden">
                <div className="p-4 sm:p-6 border-b border-stone-800 flex justify-between items-center shrink-0">
                  <h3 className="text-xl font-bold">{isEditing ? t('admin.modal.edit.title') : t('admin.modal.add.title')}</h3>
                  <button onClick={() => { setIsEditing(null); setIsAdding(false); }} className="p-2 text-stone-500 hover:text-[var(--admin-accent)] transition-colors">
                    <X size={24} />
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 custom-scrollbar">
                  <form onSubmit={handleSaveItem} className="p-4 sm:p-6 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('admin.modal.form.name')}</label>
                      <input
                        required
                        type="text"
                        value={editForm.name || ''}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-[var(--admin-accent)] outline-none transition-colors"
                        placeholder="e.g., Truffle Pasta"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('admin.modal.form.category')}</label>
                      <select
                        value={editForm.category || 'Draft'}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value as Category })}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-[var(--admin-accent)] outline-none transition-colors appearance-none"
                      >
                        <option value="Draft">{t('admin.menu.pool.master')}</option>
                        <option value="Specials">{t('menu.specials')}</option>
                        <option value="European">{t('menu.european')}</option>
                        <option value="Asian">{t('menu.asian')}</option>
                        <option value="Drinks">{t('menu.drinks')}</option>
                        <option value="Mongolian">{t('menu.mongolian')}</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">Status</label>
                      <select
                        value={editForm.status && editForm.status !== 'daily_special' ? editForm.status : (editForm.available ? 'available' : 'hidden')}
                        onChange={(e) => {
                          const newStatus = e.target.value as ItemStatus;
                          setEditForm({
                            ...editForm,
                            status: newStatus,
                            available: newStatus === 'available',
                            statusUntil: newStatus === 'sold_out_today' ? getMidnightTonight() : (editForm.todayOnly ? editForm.statusUntil : null)
                          });
                        }}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-[var(--admin-accent)] outline-none transition-colors appearance-none"
                      >
                        <option value="available">Available</option>
                        <option value="sold_out_today">Sold Out (Resets Tomorrow)</option>
                        <option value="hidden">Hidden / Off Menu</option>
                      </select>
                    </div>

                    {/* Schedule */}
                    <div className="space-y-3 col-span-full border border-stone-800 rounded-xl p-4">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">Schedule <span className="text-stone-600 normal-case tracking-normal font-normal">— leave empty to always show</span></label>

                      {/* Today Only toggle */}
                      <label className="flex items-center gap-3 cursor-pointer select-none">
                        <button
                          type="button"
                          onClick={() => {
                            const enabling = !editForm.todayOnly;
                            setEditForm({
                              ...editForm,
                              todayOnly: enabling,
                              scheduledDays: enabling ? [] : editForm.scheduledDays,
                              statusUntil: enabling ? getMidnightTonight() : (editForm.status === 'sold_out_today' ? editForm.statusUntil : null)
                            });
                          }}
                          className={cn(
                            "w-10 h-5 rounded-full transition-colors relative flex-shrink-0",
                            editForm.todayOnly ? "bg-[var(--admin-accent)]" : "bg-stone-700"
                          )}
                        >
                          <div className={cn(
                            "absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all shadow",
                            editForm.todayOnly ? "left-5" : "left-0.5"
                          )} />
                        </button>
                        <span className="text-sm text-stone-300">Today Only <span className="text-stone-500 text-xs font-normal">— hides at midnight</span></span>
                      </label>

                      {/* Day-of-week picker */}
                      {!editForm.todayOnly && (
                        <div className="space-y-2">
                          <p className="text-xs text-stone-600">Or choose specific days of the week</p>
                          <div className="flex flex-wrap gap-2">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, idx) => {
                              const selected = editForm.scheduledDays?.includes(idx);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  onClick={() => {
                                    const current = editForm.scheduledDays || [];
                                    const updated = selected
                                      ? current.filter(d => d !== idx)
                                      : [...current, idx];
                                    setEditForm({ ...editForm, scheduledDays: updated });
                                  }}
                                  className={cn(
                                    "px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-colors",
                                    selected ? "bg-[var(--admin-accent)] text-white" : "bg-stone-800 text-stone-400 hover:bg-stone-700"
                                  )}
                                >
                                  {day}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                     <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('admin.modal.form.price')}</label>
                      <input
                        required
                        type="number"
                        value={editForm.price || ''}
                        onChange={(e) => setEditForm({ ...editForm, price: Math.round(Number(e.target.value)) })}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-[var(--admin-accent)] outline-none transition-colors"
                        placeholder="12000"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">Packaging Price (₮)</label>
                      <input
                        required
                        type="number"
                        value={editForm.packagingPrice !== undefined ? editForm.packagingPrice : 0}
                        onChange={(e) => setEditForm({ ...editForm, packagingPrice: Math.round(Number(e.target.value)) })}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-[var(--admin-accent)] outline-none transition-colors"
                        placeholder="1000"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('admin.modal.form.image')} (Max 3)</label>
                      <div className="relative">
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={handleImageChange}
                          className="hidden"
                          id="image-upload"
                        />
                        <label
                          htmlFor="image-upload"
                          className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 pl-10 text-stone-100 focus:border-[var(--admin-accent)] outline-none transition-colors cursor-pointer flex items-center gap-2 hover:border-[var(--admin-accent-soft-50)]"
                        >
                          <ImageIcon className="text-stone-600" size={18} />
                          <span className="text-sm text-stone-400 truncate">
                            {editForm.image || (editForm.sideImages && editForm.sideImages.length > 0) ? 'Add/Change Images' : 'Upload Images (1 Main, 2 Side)'}
                          </span>
                        </label>
                        <div className="mt-2 flex gap-2 overflow-x-auto">
                          {editForm.image && (
                            <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-[var(--admin-accent)] flex-shrink-0 group">
                              <img src={editForm.image} alt="Main Preview" className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded">Change</span>
                              </div>
                              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-0" onChange={(e) => handleReplaceImage(-1, e)} title="Change Main Image" />
                              <div className="absolute bottom-0 left-0 right-0 bg-[var(--admin-accent-soft-80)] text-[8px] text-center font-bold text-stone-900 uppercase pointer-events-none">Main</div>
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); setEditForm({ ...editForm, image: editForm.sideImages?.[0] || '', sideImages: editForm.sideImages?.slice(1) || [] }); }}
                                className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg z-10"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          )}
                          {editForm.sideImages?.map((img, idx) => (
                            <div key={idx} className="relative w-20 h-20 rounded-lg overflow-hidden border border-stone-800 flex-shrink-0 group">
                              <img src={img} alt={`Side Preview ${idx + 1}`} className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded">Change</span>
                              </div>
                              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-0" onChange={(e) => handleReplaceImage(idx, e)} title="Change Side Image" />
                              <button
                                type="button"
                                onClick={(e) => { e.preventDefault(); setEditForm({ ...editForm, sideImages: editForm.sideImages?.filter((_, i) => i !== idx) }); }}
                                className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg z-10"
                              >
                                <X size={12} />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  setEditForm(prev => ({
                                    ...prev,
                                    image: img,
                                    sideImages: [prev.image, ...(prev.sideImages?.filter((_, i) => i !== idx) || [])].filter(Boolean) as string[]
                                  }));
                                }}
                                className="absolute bottom-0 left-0 bg-[var(--admin-accent)] text-stone-900 p-0.5 rounded-tr-lg text-[8px] font-bold px-1.5 z-10 hover:bg-[var(--admin-accent-hover)]"
                              >
                                Make Main
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('admin.modal.form.description')}</label>
                    <textarea
                      required
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-[var(--admin-accent)] outline-none transition-colors h-24 resize-none"
                      placeholder="Describe the dish..."
                    />
                  </div>

                  {/* Portions Management */}
                  <div className="space-y-4 border-t border-stone-800 pt-4">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">Portions (Optional)</label>
                      <button
                        type="button"
                        onClick={() => setEditForm({
                          ...editForm,
                          portions: [...(editForm.portions || []), { name: '', price: editForm.price || 0 }]
                        })}
                        className="text-xs text-[var(--admin-accent)] hover:text-[var(--admin-accent-hover)] font-bold flex items-center gap-1"
                      >
                        <Plus size={12} /> Add Portion
                      </button>
                    </div>
                    
                    {editForm.portions && editForm.portions.length > 0 && (
                      <div className="space-y-3">
                        {editForm.portions.map((portion, index) => (
                          <div key={index} className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => {
                                const newPortions = [...(editForm.portions || [])];
                                newPortions[index].available = !(newPortions[index].available ?? true);
                                setEditForm({ ...editForm, portions: newPortions });
                              }}
                              className={cn(
                                "p-2 rounded-xl transition-colors border flex-shrink-0",
                                (portion.available ?? true) 
                                  ? "bg-green-500/10 border-green-500/30 text-green-500 hover:bg-green-500/20" 
                                  : "bg-stone-900 border-stone-800 text-stone-500 hover:bg-stone-800"
                              )}
                              title={(portion.available ?? true) ? "Portion Available" : "Portion Hidden"}
                            >
                              {(portion.available ?? true) ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
                            </button>
                            <input
                              type="text"
                              value={portion.name}
                              onChange={(e) => {
                                const newPortions = [...(editForm.portions || [])];
                                newPortions[index].name = e.target.value;
                                setEditForm({ ...editForm, portions: newPortions });
                              }}
                              placeholder="e.g., Half, 2-Person"
                              className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-100 focus:border-[var(--admin-accent)] outline-none"
                            />
                            <input
                              type="number"
                              value={portion.price}
                              onChange={(e) => {
                                const newPortions = [...(editForm.portions || [])];
                                newPortions[index].price = Math.round(Number(e.target.value));
                                setEditForm({ ...editForm, portions: newPortions });
                              }}
                              placeholder="Price"
                              className="w-24 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-100 focus:border-[var(--admin-accent)] outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newPortions = [...(editForm.portions || [])];
                                newPortions.splice(index, 1);
                                setEditForm({ ...editForm, portions: newPortions });
                              }}
                              className="p-2 text-stone-600 hover:text-red-500 transition-colors flex-shrink-0"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-8">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <div 
                        onClick={() => setEditForm({ ...editForm, available: !editForm.available })}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative",
                          editForm.available ? "bg-[var(--admin-accent)]" : "bg-stone-800"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          editForm.available ? "left-7" : "left-1"
                        )} />
                      </div>
                      <span className="text-sm text-stone-300 font-bold uppercase tracking-widest">{t('admin.modal.form.available')}</span>
                    </label>

                    <label className="flex items-center space-x-3 cursor-pointer">
                      <div 
                        onClick={() => setEditForm({ ...editForm, featured: !editForm.featured })}
                        className={cn(
                          "w-12 h-6 rounded-full transition-colors relative",
                          editForm.featured ? "bg-[var(--admin-accent)]" : "bg-stone-800"
                        )}
                      >
                        <div className={cn(
                          "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                          editForm.featured ? "left-7" : "left-1"
                        )} />
                      </div>
                      <span className="text-sm text-stone-300 font-bold uppercase tracking-widest">{t('admin.modal.form.featured')}</span>
                    </label>
                  </div>
                  <div className="flex justify-end space-x-4 pt-4">
                    <button
                      type="button"
                      onClick={() => { setIsEditing(null); setIsAdding(false); }}
                      className="px-6 py-3 text-stone-500 font-semibold uppercase tracking-[0.15em] text-xs hover:text-stone-300 transition-colors"
                    >
                      {t('admin.nav.logout')}
                    </button>
                    <button
                      type="submit"
                      className="flex items-center space-x-2 px-8 py-3 bg-[var(--admin-accent)] text-stone-900 font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-[var(--admin-accent-hover)] transition-all active:scale-95 shadow-lg shadow-[color:var(--admin-accent-soft-20)]"
                    >
                      <Save size={18} />
                      <span>{t('admin.modal.form.save')}</span>
                    </button>
                  </div>
                </form>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* New Order Modal */}
      <AnimatePresence>
        {isAddingOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAddingOrder(false)}
              className="absolute inset-0 bg-stone-950/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-7xl bg-stone-900 border border-stone-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col h-[95vh] md:h-[90vh]"
            >
              <div className="p-6 md:p-8 border-b border-stone-800 flex justify-between items-center bg-stone-900/50 z-10 shrink-0">
                <div className="space-y-1">
                  <h3 className="text-xl md:text-2xl font-bold">Create New Order</h3>
                  <p className="text-xs md:text-sm text-stone-500">Add customer details and select items from the menu.</p>
                </div>
                <button onClick={() => setIsAddingOrder(false)} className="p-2 md:p-3 hover:bg-stone-800 rounded-full transition-colors shrink-0">
                  <X size={24} className="md:w-7 md:h-7" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto lg:overflow-hidden flex flex-col lg:flex-row pb-24 lg:pb-0 relative">
                {/* Left Column: Customer Form (1/4) */}
                <div className="w-full lg:w-1/4 border-b lg:border-b-0 lg:border-r border-stone-800 p-6 md:p-8 lg:overflow-y-auto custom-scrollbar bg-stone-950/30 shrink-0">
                  <div className="space-y-8">
                    <div className="space-y-4">
                      <h4 className="text-xs uppercase tracking-[0.2em] font-bold text-[var(--admin-accent)]">Service Type</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {['pickup', 'kiosk'].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setAdminOrderForm({ ...adminOrderForm, orderType: type as OrderType })}
                            className={cn(
                              "py-3 md:py-4 rounded-2xl text-xs font-bold uppercase tracking-widest border transition-all flex flex-col items-center gap-2",
                              adminOrderForm.orderType === type
                                ? "bg-[var(--admin-accent)] text-stone-900 border-[var(--admin-accent)] shadow-lg shadow-[color:var(--admin-accent-soft-20)]"
                                : "bg-stone-950 text-stone-500 border-stone-800 hover:border-stone-600"
                            )}
                          >
                            {type === 'pickup' ? <ShoppingBag size={20} /> : <LayoutDashboard size={20} />}
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    {adminOrderForm.orderType === 'kiosk' && (
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-stone-400 uppercase tracking-widest">Kiosk / Table #</label>
                        <input
                          type="text"
                          value={adminOrderForm.kioskNumber}
                          onChange={(e) => setAdminOrderForm({ ...adminOrderForm, kioskNumber: e.target.value })}
                          className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 md:px-5 py-3 md:py-4 text-sm md:text-base focus:border-[var(--admin-accent)] outline-none transition-all focus:ring-1 focus:ring-[var(--admin-accent-soft-20)]"
                          placeholder="Table 12"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Middle Column: Menu Selection (2/4) */}
                <div className="w-full lg:w-2/4 border-b lg:border-b-0 lg:border-r border-stone-800 flex flex-col bg-stone-900 shrink-0 lg:shrink h-[50vh] lg:h-auto">
                  <div className="p-4 md:p-6 border-b border-stone-800 bg-stone-950/20 shrink-0">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search menu items..."
                        className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-10 md:px-12 py-3 md:py-4 text-sm md:text-base focus:border-[var(--admin-accent)] outline-none transition-all"
                        onChange={(e) => {
                          setMenuSearchQuery(e.target.value);
                        }}
                        value={menuSearchQuery}
                      />
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" size={18} />
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 md:space-y-10 custom-scrollbar">
                    {['European', 'Asian', 'Mongolian', 'Drinks'].map((cat) => {
                      const catItems = menuItems.filter(i => 
                        i.category === cat && 
                        i.available && 
                        (i.name.toLowerCase().includes(menuSearchQuery.toLowerCase()) || 
                         i.description.toLowerCase().includes(menuSearchQuery.toLowerCase()))
                      );
                      if (catItems.length === 0) return null;
                      return (
                        <div key={cat} className="space-y-4">
                          <div className="flex items-center gap-4">
                            <h5 className="text-xs md:text-sm uppercase tracking-[0.3em] font-bold text-[var(--admin-accent)]">{t(`menu.${cat.toLowerCase()}`)}</h5>
                            <div className="flex-1 h-px bg-stone-800"></div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                            {catItems.map((item) => (
                              <div key={item.id} className="group bg-stone-950 border border-stone-800 rounded-2xl p-3 md:p-4 space-y-3 md:space-y-4 hover:border-[var(--admin-accent-soft-50)] transition-all">
                                <div className="flex justify-between items-start gap-3 md:gap-4">
                                  <div className="space-y-1">
                                    <span className="text-sm md:text-base font-bold block group-hover:text-[var(--admin-accent)] transition-colors">{item.name}</span>
                                    <p className="text-[10px] md:text-xs text-stone-500 line-clamp-2">{item.description}</p>
                                  </div>
                                  {!item.portions || item.portions.length === 0 ? (
                                    <button
                                      onClick={() => addToAdminOrder(item)}
                                      className="p-2 md:p-3 bg-[var(--admin-accent)] text-stone-900 rounded-xl hover:bg-[var(--admin-accent-hover)] transition-all active:scale-90 shadow-lg shadow-[color:var(--admin-accent-soft-10)] shrink-0"
                                    >
                                      <Plus size={18} className="md:w-5 md:h-5" />
                                    </button>
                                  ) : null}
                                </div>
                                {item.portions && item.portions.length > 0 && (
                                  <div className="grid grid-cols-1 gap-2">
                                    {[{ name: 'Default', price: item.price }, ...item.portions].map((p, idx) => (
                                      <button
                                        key={idx}
                                        onClick={() => addToAdminOrder(item, p)}
                                        className="flex justify-between items-center px-3 py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs hover:border-[var(--admin-accent)] transition-all group/btn"
                                      >
                                        <span className="text-stone-400 group-hover/btn:text-stone-200 truncate pr-2">{p.name}</span>
                                        <span className="font-bold text-[var(--admin-accent)] shrink-0">₮{p.price.toLocaleString()}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Order Summary (1/4) */}
                <div className="w-full lg:w-1/4 flex flex-col bg-stone-950/50 shrink-0 lg:shrink h-[40vh] lg:h-auto">
                  <div className="p-4 md:p-8 border-b border-stone-800 bg-stone-900/30 shrink-0">
                    <h4 className="text-xs uppercase tracking-[0.2em] font-bold text-[var(--admin-accent)]">Order Summary</h4>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3 custom-scrollbar">
                    {adminOrderItems.length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-50 pb-8">
                        <ShoppingBag size={40} className="text-stone-700 md:w-12 md:h-12" />
                        <p className="text-xs md:text-sm text-stone-500 italic">Your order is empty.<br/>Select items from the menu.</p>
                      </div>
                    ) : (
                      adminOrderItems.map((item, idx) => (
                        <div key={idx} className="bg-stone-900 p-3 md:p-4 rounded-2xl border border-stone-800 space-y-3">
                          <div className="flex justify-between items-start gap-2">
                            <div className="space-y-1 min-w-0">
                              <span className="text-xs md:text-sm font-bold block truncate">{item.item.name}</span>
                              {item.selectedPortion && (
                                <span className="text-[10px] text-[var(--admin-accent-soft-70)] uppercase tracking-widest font-bold block truncate">
                                  {item.selectedPortion.name}
                                </span>
                              )}
                            </div>
                            <span className="text-xs md:text-sm font-bold tabular-nums shrink-0">
                              ₮{((item.selectedPortion ? item.selectedPortion.price : item.item.price) * item.quantity).toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center justify-between pt-2 border-t border-stone-800/50">
                            <div className="flex items-center gap-3 md:gap-4 bg-stone-950 rounded-xl px-2 md:px-3 py-1.5 md:py-2 border border-stone-800">
                              <button onClick={() => removeFromAdminOrder(item.item.id, item.selectedPortion?.name)} className="text-stone-500 hover:text-[var(--admin-accent)] transition-colors p-1">
                                <Minus size={14} className="md:w-4 md:h-4" />
                              </button>
                              <span className="text-xs md:text-sm font-bold w-4 md:w-6 text-center tabular-nums">{item.quantity}</span>
                              <button onClick={() => addToAdminOrder(item.item, item.selectedPortion)} className="text-stone-500 hover:text-[var(--admin-accent)] transition-colors p-1">
                                <Plus size={14} className="md:w-4 md:h-4" />
                              </button>
                            </div>
                            <button
                              onClick={() => {
                                setAdminOrderItems(prev => prev.filter((_, i) => i !== idx));
                              }}
                              className="p-2 text-stone-600 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="p-4 md:p-8 border-t border-stone-800 bg-stone-900 shrink-0 sticky bottom-0 z-20">
                    <div className="space-y-4 md:space-y-6">
                      <div className="flex justify-between items-end">
                        <span className="text-[10px] md:text-xs text-stone-500 uppercase tracking-[0.2em] font-bold">Total Amount</span>
                        <span className="text-xl md:text-3xl font-bold tabular-nums text-[var(--admin-accent)]">
                          ₮{adminOrderItems.reduce((acc, curr) => acc + ((curr.selectedPortion ? curr.selectedPortion.price : curr.item.price) * curr.quantity), 0).toLocaleString()}
                        </span>
                      </div>
                      <button
                        onClick={handleCreateAdminOrder}
                        disabled={adminOrderItems.length === 0}
                        className={cn(
                          "w-full py-4 md:py-5 rounded-2xl text-sm md:text-base font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl shadow-[color:var(--admin-accent-soft-10)]",
                          adminOrderItems.length > 0
                            ? "bg-[var(--admin-accent)] text-stone-900 hover:bg-[var(--admin-accent-hover)] active:scale-95"
                            : "bg-stone-800 text-stone-600 cursor-not-allowed"
                        )}
                      >
                        <CheckCircle2 size={18} className="md:w-5 md:h-5" />
                        Start Order
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
      />
    </div>
  );
}
