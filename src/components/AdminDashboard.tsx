import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, Edit2, Trash2, Check, X, LogOut, 
  LayoutDashboard, ShoppingBag, List, Settings, 
  ChevronRight, AlertCircle, Save, Image as ImageIcon,
  Clock, CheckCircle2, XCircle, Package, Star, Users,
  Search, Minus, Filter
} from 'lucide-react';
import { 
  auth, db, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
  collection, addDoc, updateDoc, deleteDoc, onSnapshot, query, orderBy, doc, getDoc, setDoc
} from '../firebase';
import { MenuItem, Order, Category, OrderStatus, Portion, OrderType, ItemStatus } from '../types';
import { handleFirestoreError, OperationType } from '../lib/firestoreErrorHandler';
import { cn, getMidnightTonight } from '../lib/utils';
import { toast } from 'sonner';
import { useLanguage } from '../context/LanguageContext';

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
  onChangeCategory
}: { 
  item: MenuItem, 
  onEdit: (item: MenuItem) => void, 
  onDelete: (id: string) => void,
  onChangeStatus: (item: MenuItem, status: ItemStatus) => void,
  onToggleFeatured: (item: MenuItem) => void,
  onChangeCategory: (item: MenuItem, value: string) => void,
  key?: React.Key
}) {
  const { t } = useLanguage();
  const currentStatus = item.status || (item.available ? 'available' : 'hidden');

  let statusColorClass = "bg-stone-500/20 text-stone-400 border-stone-500/30 hover:bg-stone-500/40";
  if (currentStatus === 'available') statusColorClass = "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/40";
  if (currentStatus === 'sold_out_today') statusColorClass = "bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/40";
  if (currentStatus === 'daily_special') statusColorClass = "bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/40";

  return (
    <div className="group relative h-56 bg-stone-950 border border-stone-800 rounded-3xl overflow-hidden hover:border-amber-500/50 transition-all shadow-lg flex flex-col">
      {/* Background Image */}
      <img 
        src={item.image || `https://picsum.photos/seed/${item.name}/400/300`} 
        alt={item.name} 
        className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-50 transition-opacity duration-500" 
        referrerPolicy="no-referrer" 
      />
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
          <option value="daily_special" className="bg-stone-900 text-yellow-400">Daily Special</option>
        </select>
        <button 
          onClick={(e) => { e.stopPropagation(); onToggleFeatured(item); }}
          className={cn(
            "p-2 rounded-full transition-colors backdrop-blur-md border shadow-lg",
            item.featured 
              ? "bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30" 
              : "bg-stone-900/50 text-stone-500 border-stone-800 hover:text-amber-400 hover:border-amber-500/30"
          )}
        >
          <Star size={16} className={item.featured ? "fill-amber-400" : ""} />
        </button>
      </div>

      {/* Content */}
      <div className="relative flex-1 flex flex-col items-center justify-center text-center px-6 mt-4">
        <p className="text-lg font-bold text-white leading-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] line-clamp-2">{item.name}</p>
        <p className="text-xs text-amber-400 font-bold uppercase tracking-[0.2em] tabular-nums mt-2 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
          ₮{Math.round(item.price).toLocaleString()}
        </p>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-stone-950/80 backdrop-blur-md border-t border-stone-800 flex items-center justify-between gap-2 translate-y-0 sm:translate-y-full sm:group-hover:translate-y-0 transition-transform duration-300 z-10">
        <select
          value={item.pool === 'specials' ? 'Specials' : item.category}
          onChange={(e) => onChangeCategory(item, e.target.value)}
          className="bg-stone-900 border border-stone-700 rounded-lg px-2 py-1.5 text-xs text-stone-300 focus:border-amber-500 outline-none flex-1"
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
            className="p-1.5 bg-stone-800 rounded-lg text-stone-300 hover:text-amber-500 transition-colors border border-stone-700 hover:border-amber-500/50"
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

export default function AdminDashboard() {
  const { t } = useLanguage();
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'menu' | 'orders' | 'staff'>('menu');
  
  // Search States
  const [menuSearchQuery, setMenuSearchQuery] = useState('');
  const [menuFilterCategory, setMenuFilterCategory] = useState<Category | 'All'>('All');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // Menu State
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [editForm, setEditForm] = useState<Partial<MenuItem>>({});

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [adminOrderItems, setAdminOrderItems] = useState<{item: MenuItem, quantity: number, selectedPortion?: Portion}[]>([]);
  const [adminOrderForm, setAdminOrderForm] = useState({
    orderType: 'pickup' as OrderType,
    kioskNumber: ''
  });

  const getUBDateString = (date: Date) => {
    return new Intl.DateTimeFormat('en-CA', { 
      timeZone: 'Asia/Ulaanbaatar', 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit' 
    }).format(date);
  };

  const [selectedDate, setSelectedDate] = useState<string>(() => getUBDateString(new Date()));

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Check if admin
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        const userData = userDoc.data();
        
        // Also check admin_emails collection
        const adminEmailDoc = await getDoc(doc(db, 'admin_emails', currentUser.email?.toLowerCase() || ''));
        
        if (userData?.role === 'admin' || currentUser.email === 'boldsaihanlolor@gmail.com' || adminEmailDoc.exists()) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          toast.error('Access denied. Admin privileges required.');
        }
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const menuUnsubscribe = onSnapshot(query(collection(db, 'menu'), orderBy('name')), (snapshot) => {
      setMenuItems(snapshot.docs.map(doc => {
        const data = doc.data();
        const { id, ...rest } = data;
        return { id: doc.id, ...rest } as MenuItem;
      }));
    });

    const ordersUnsubscribe = onSnapshot(query(collection(db, 'orders'), orderBy('timestamp', 'desc')), (snapshot) => {
      const allOrders = snapshot.docs.map(doc => {
        const data = doc.data();
        const { id, ...rest } = data;
        return { id: doc.id, ...rest };
      }) as Order[];
      
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const validOrders = allOrders.filter(order => {
        const orderDate = new Date(order.timestamp);
        if (orderDate < sevenDaysAgo) {
          deleteDoc(doc(db, 'orders', order.id)).catch(console.error);
          return false;
        }
        
        // Delete cancelled orders after 24 hours
        if (order.status === 'cancelled' && orderDate < oneDayAgo) {
          deleteDoc(doc(db, 'orders', order.id)).catch(console.error);
          return false;
        }
        return true;
      });
      
      setOrders(validOrders);
    });

    const staffUnsubscribe = onSnapshot(collection(db, 'admin_emails'), (snapshot) => {
      setAdminEmails(snapshot.docs.map(doc => ({ id: doc.id })));
    });

    return () => {
      menuUnsubscribe();
      ordersUnsubscribe();
      staffUnsubscribe();
    };
  }, [isAdmin]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Failed to login.');
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
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
      const total = adminOrderItems.reduce((acc, curr) => {
        const price = curr.selectedPortion ? curr.selectedPortion.price : curr.item.price;
        return acc + (price * curr.quantity);
      }, 0);

      // Get next order number
      const statsDoc = await getDoc(doc(db, 'stats', 'orders'));
      let orderNumber = '001';
      if (statsDoc.exists()) {
        const nextNum = (statsDoc.data().lastNumber || 0) + 1;
        orderNumber = nextNum.toString().padStart(3, '0');
        await updateDoc(doc(db, 'stats', 'orders'), { lastNumber: nextNum });
      } else {
        await setDoc(doc(db, 'stats', 'orders'), { lastNumber: 1 });
      }

      const orderData: any = {
        items: adminOrderItems.map(i => ({
          id: i.item.id,
          name: i.item.name,
          price: i.selectedPortion ? i.selectedPortion.price : i.item.price,
          quantity: i.quantity,
          selectedPortion: i.selectedPortion || null
        })),
        total,
        orderType: adminOrderForm.orderType,
        orderNumber,
        status: 'preparing', // Start immediately
        timestamp: new Date().toISOString()
      };

      if (adminOrderForm.orderType === 'kiosk' && adminOrderForm.kioskNumber) {
        orderData.kioskNumber = adminOrderForm.kioskNumber;
      }

      await addDoc(collection(db, 'orders'), orderData);
      toast.success(`Order #${orderNumber} created and started!`);
      setIsAddingOrder(false);
      setAdminOrderItems([]);
      setAdminOrderForm({
        orderType: 'pickup',
        kioskNumber: ''
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
      toast.error('Failed to create order.');
    }
  };

  // Menu Actions
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Strip id from editForm to avoid saving it as a field
      const { id, ...formData } = editForm;
      
      const uiCategory = (editForm.category as any) as string;
      const isSpecialsPool = uiCategory === 'Specials';
      const itemData = {
        ...formData,
        price: Math.round(Number(editForm.price)),
        packagingPrice: editForm.packagingPrice !== undefined ? Math.round(Number(editForm.packagingPrice)) : 0,
        available: editForm.available ?? true,
        status: editForm.status || 'available',
        statusUntil: editForm.statusUntil || null,
        featured: editForm.featured ?? false,
        orderCount: editForm.orderCount ?? 0,
        tags: editForm.tags || [],
        category: (isSpecialsPool ? 'Draft' : (editForm.category || 'Draft')) as Category,
        pool: isSpecialsPool ? 'specials' : null,
        image: editForm.image || `https://picsum.photos/seed/${editForm.name}/800/600`,
        sideImages: editForm.sideImages || [],
        portions: editForm.portions || []
      };

      if (isEditing) {
        await updateDoc(doc(db, 'menu', isEditing), itemData);
        toast.success('Item updated!');
      } else {
        await addDoc(collection(db, 'menu'), itemData);
        toast.success('Item added to Draft Pool!');
      }
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
      if (newStatus === 'available' || newStatus === 'daily_special') {
        updates.available = true;
      } else {
        updates.available = false;
      }

      if (newStatus === 'sold_out_today' || newStatus === 'daily_special') {
        updates.statusUntil = getMidnightTonight();
      } else {
        updates.statusUntil = null as any;
      }

      await updateDoc(doc(db, 'menu', item.id), updates);
      toast.success(`${item.name} status updated to ${newStatus.replace(/_/g, ' ')}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update status');
    }
  };

  const handleToggleFeatured = async (item: MenuItem) => {
    try {
      await updateDoc(doc(db, 'menu', item.id), { featured: !item.featured });
      toast.success(`${item.name} is ${!item.featured ? 'Featured' : 'Unfeatured'}`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to update featured status');
    }
  };

  const handleChangeCategory = async (item: MenuItem, newValue: string) => {
    try {
      if (newValue === 'Specials') {
        await updateDoc(doc(db, 'menu', item.id), { pool: 'specials' });
      } else {
        await updateDoc(doc(db, 'menu', item.id), { category: newValue as Category, pool: null });
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
          await deleteDoc(doc(db, 'menu', id));
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
      await updateDoc(doc(db, 'menu', item.id), { available: !item.available });
      toast.success(`Item ${!item.available ? 'available' : 'unavailable'}`);
    } catch (error) {
      console.error('Toggle error:', error);
    }
  };

  // Order Actions
  const updateOrderStatus = async (orderId: string, status: OrderStatus) => {
    try {
      await updateDoc(doc(db, 'orders', orderId), { status });
      toast.success(`Order status updated to ${status}`);
    } catch (error) {
      console.error('Status update error:', error);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (window.confirm('Are you sure you want to delete this order?')) {
      try {
        await deleteDoc(doc(db, 'orders', orderId));
        toast.success('Order deleted');
      } catch (error) {
        console.error('Error deleting order:', error);
        toast.error('Failed to delete order');
      }
    }
  };

  // Staff Actions
  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail) return;
    try {
      await setDoc(doc(db, 'admin_emails', newAdminEmail.toLowerCase().trim()), {
        addedAt: new Date().toISOString(),
        addedBy: user.email
      });
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
          await deleteDoc(doc(db, 'admin_emails', email));
          toast.success('Admin email removed.');
        } catch (error) {
          console.error('Delete admin error:', error);
          toast.error('Failed to remove admin email.');
        }
      }
    });
  };

  if (loading) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center">
      <div className="w-12 h-12 border-4 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!user || !isAdmin) return (
    <div className="min-h-screen bg-stone-950 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-3xl p-8 text-center space-y-6"
      >
        <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500 mx-auto">
          <Settings size={40} />
        </div>
        <h2 className="text-2xl font-bold text-stone-100">{t('admin.login.title')}</h2>
        <p className="text-stone-400 font-light">{t('admin.login.subtitle')}</p>
        <button
          onClick={handleLogin}
          className="w-full py-4 bg-amber-500 text-stone-900 font-bold uppercase tracking-widest rounded-full hover:bg-amber-400 transition-all active:scale-95"
        >
          {t('admin.login.button')}
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-stone-950 text-stone-100">
      {/* Container */}
      <div className="flex flex-col lg:flex-row h-[100dvh] overflow-hidden">
        {/* Mobile top header */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-stone-900 border-b border-stone-800 shrink-0 z-20">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-amber-500 rounded-xl flex items-center justify-center text-stone-900 font-bold text-sm shrink-0">EA</div>
            <span className="font-bold text-base">{t('admin.title')}</span>
          </div>
          <div className="flex items-center space-x-2">
            {orders.filter(o => o.status === 'pending').length > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">
                {orders.filter(o => o.status === 'pending').length} new
              </span>
            )}
            <img src={user?.photoURL} alt={user?.displayName || 'User'} className="w-8 h-8 rounded-full border border-stone-700" />
            <button onClick={handleLogout} className="p-2 text-stone-500 hover:text-red-500 transition-colors">
              <LogOut size={18} />
            </button>
          </div>
        </div>

        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:w-64 bg-stone-900 border-r border-stone-800 flex-col shrink-0 z-20">
          <div className="p-6 border-b border-stone-800 flex items-center">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center text-stone-900 font-bold shrink-0">EA</div>
              <span className="font-bold text-lg">{t('admin.title')}</span>
            </div>
          </div>

          <nav className="flex-1 p-4 space-y-2">
            <button
              onClick={() => setActiveTab('menu')}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'menu' ? "bg-amber-500 text-stone-900 font-bold" : "text-stone-400 hover:bg-stone-800"
              )}
            >
              <List size={20} />
              <span className="text-base">{t('admin.nav.menu')}</span>
            </button>
            <button
              onClick={() => setActiveTab('orders')}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'orders' ? "bg-amber-500 text-stone-900 font-bold" : "text-stone-400 hover:bg-stone-800"
              )}
            >
              <ShoppingBag size={20} />
              <span className="text-base">{t('admin.nav.orders')}</span>
              {orders.filter(o => o.status === 'pending').length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full">
                  {orders.filter(o => o.status === 'pending').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('staff')}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all",
                activeTab === 'staff' ? "bg-amber-500 text-stone-900 font-bold" : "text-stone-400 hover:bg-stone-800"
              )}
            >
              <Users size={20} />
              <span className="text-base">{t('admin.nav.staff')}</span>
            </button>
          </nav>

          <div className="p-4 border-t border-stone-800">
            <div className="flex items-center space-x-3 mb-4 px-2">
              <img src={user?.photoURL} alt={user?.displayName} className="w-8 h-8 rounded-full border border-stone-700" />
              <div className="flex-1 overflow-hidden">
                <p className="text-xs font-bold truncate">{user?.displayName}</p>
                <p className="text-[10px] text-stone-500 truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-stone-500 hover:text-red-500 transition-colors text-xs font-bold uppercase tracking-widest"
            >
              <LogOut size={16} />
              <span>{t('admin.nav.logout')}</span>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-10 pb-28 lg:pb-10 bg-stone-950">
          <AnimatePresence mode="wait">
            {activeTab === 'menu' ? (
              <motion.div
                key="menu"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="min-w-0">
                    <h2 className="text-3xl font-bold">{t('admin.menu.title')}</h2>
                    <p className="text-stone-500 text-sm">{t('admin.menu.subtitle')}</p>
                  </div>
                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3 w-full md:w-auto">
                    <div className="flex bg-stone-900 border border-stone-800 rounded-full p-1 overflow-x-auto custom-scrollbar min-w-0 max-w-full">
                      {['All', 'Draft', 'Specials', 'European', 'Asian', 'Mongolian', 'Drinks'].map((cat) => (
                        <button
                          key={cat}
                          onClick={() => setMenuFilterCategory(cat as Category | 'All')}
                          className={cn(
                            "px-4 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap",
                            menuFilterCategory === cat 
                              ? "bg-amber-500 text-stone-900 shadow-md" 
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
                        className="w-full bg-stone-900 border border-stone-800 rounded-full px-10 py-2 text-sm text-stone-200 focus:outline-none focus:border-amber-500 transition-colors"
                      />
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 items-stretch w-full sm:w-auto">
                      <button
                        onClick={async () => {
                          const initialItems = [
                            { name: 'Truffle Carbonara', description: 'Creamy pasta with black truffle oil, pancetta, and parmesan.', price: 18.99, category: 'European', available: true, image: 'https://picsum.photos/seed/pasta/800/600' },
                            { name: 'Sushi Platter', description: 'Assorted fresh nigiri and maki rolls with wasabi and ginger.', price: 24.99, category: 'Asian', available: true, image: 'https://picsum.photos/seed/sushi/800/600' },
                            { name: 'Beef Bourguignon', description: 'Slow-cooked beef in red wine sauce with carrots and onions.', price: 22.50, category: 'European', available: true, image: 'https://picsum.photos/seed/beef/800/600' },
                            { name: 'Pad Thai', description: 'Classic Thai rice noodles with shrimp, tofu, and peanuts.', price: 16.99, category: 'Asian', available: true, image: 'https://picsum.photos/seed/padthai/800/600' },
                            { name: 'Matcha Latte', description: 'Premium Japanese matcha with steamed milk.', price: 5.50, category: 'Drinks', available: true, image: 'https://picsum.photos/seed/matcha/800/600' },
                            { name: 'Buuz', description: 'Traditional Mongolian steamed dumplings.', price: 15.00, category: 'Mongolian', available: true, image: 'https://picsum.photos/seed/buuz/800/600' }
                          ];
                          for (const item of initialItems) {
                            await addDoc(collection(db, 'menu'), item);
                          }
                          toast.success('Seed data added!');
                        }}
                        className="w-full sm:w-auto text-xs text-stone-600 hover:text-amber-500 transition-colors"
                      >
                        Seed Data
                      </button>
                      <button
                        onClick={() => {
                          setIsAdding(true);
                          setIsEditing(null);
                          setEditForm({ category: 'Draft', available: false, status: 'hidden' });
                        }}
                        className="w-full sm:w-auto flex items-center justify-center space-x-2 px-6 py-3 bg-amber-500 text-stone-900 font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-amber-400 transition-all active:scale-95"
                      >
                        <Plus size={18} />
                        <span>{t('admin.menu.add')}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                  {menuItems
                    .filter(i => {
                      if (menuFilterCategory === 'All') return true;
                      if (menuFilterCategory === 'Specials') return i.pool === 'specials';
                      return i.category === menuFilterCategory && i.pool !== 'specials';
                    })
                    .filter(i => i.name.toLowerCase().includes(menuSearchQuery.toLowerCase()) || i.description.toLowerCase().includes(menuSearchQuery.toLowerCase()))
                    .map(item => (
                      <MenuItemCard 
                        key={item.id} 
                        item={item} 
                        onEdit={(item) => { setIsEditing(item.id); setEditForm(item.pool === 'specials' ? { ...item, category: 'Specials' as any } : item); }}
                        onDelete={handleDeleteItem}
                        onChangeStatus={handleChangeStatus}
                        onToggleFeatured={handleToggleFeatured}
                        onChangeCategory={handleChangeCategory}
                      />
                    ))}
                  
                  {menuItems.filter(i => {
                      if (menuFilterCategory === 'All') return true;
                      if (menuFilterCategory === 'Specials') return i.pool === 'specials';
                      return i.category === menuFilterCategory && i.pool !== 'specials';
                    }).length === 0 && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed border-stone-800 rounded-3xl text-stone-500">
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
                className="space-y-8"
              >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                    <h2 className="text-2xl md:text-3xl font-bold">{t('admin.orders.title')}</h2>
                    <p className="text-stone-500 text-sm">{t('admin.orders.subtitle')}</p>
                  </div>
                  <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                      <input
                        type="text"
                        placeholder="Search orders..."
                        value={orderSearchQuery}
                        onChange={(e) => setOrderSearchQuery(e.target.value)}
                        className="w-full bg-stone-900 border border-stone-800 rounded-full px-10 py-2.5 text-sm text-stone-200 focus:outline-none focus:border-amber-500 transition-colors"
                      />
                      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-500" size={16} />
                    </div>
                    <button
                      onClick={() => setIsAddingOrder(true)}
                      className="flex items-center space-x-2 px-5 py-2.5 bg-amber-500 text-stone-900 font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-amber-400 transition-all active:scale-95 shrink-0"
                    >
                      <Plus size={18} />
                      <span className="hidden sm:inline">New Order</span>
                    </button>
                  </div>
                </div>

                <div className="flex overflow-x-auto pb-2 gap-2 hide-scrollbar">
                  {last7Days.map(date => {
                    const d = new Date(date);
                    const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    return (
                      <button
                        key={date}
                        onClick={() => setSelectedDate(date)}
                        className={cn(
                          "px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all",
                          selectedDate === date
                            ? "bg-amber-500 text-stone-900"
                            : "bg-stone-900 text-stone-400 hover:bg-stone-800 border border-stone-800"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <div className="space-y-8">
                  {orders.filter(o => {
                    const matchesDate = getUBDateString(new Date(o.timestamp)) === selectedDate;
                    const matchesSearch = 
                      (o.customerName || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                      o.id.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                      (o.phone || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                      (o.orderNumber && o.orderNumber.toString().includes(orderSearchQuery)) ||
                      (o.kioskNumber && o.kioskNumber.toString().includes(orderSearchQuery));
                    return matchesDate && matchesSearch && o.status !== 'cancelled';
                  }).length === 0 ? (
                    <div className="bg-stone-900 border border-stone-800 rounded-3xl p-20 text-center">
                      <ShoppingBag className="mx-auto text-stone-800 mb-4" size={64} />
                      <p className="text-stone-500 italic">{t('admin.orders.empty')}</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 items-start">
                      {['pickup', 'kiosk'].map((type) => {
                        const typeOrders = orders.filter(o => {
                          const matchesDate = getUBDateString(new Date(o.timestamp)) === selectedDate;
                          const matchesSearch = 
                            (o.customerName || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                            o.id.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                            (o.phone || '').toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
                            (o.orderNumber && o.orderNumber.toString().includes(orderSearchQuery)) ||
                            (o.kioskNumber && o.kioskNumber.toString().includes(orderSearchQuery));
                          return matchesDate && matchesSearch && o.status !== 'cancelled' && o.orderType === type;
                        });
                        if (typeOrders.length === 0) return null;
                        
                        return (
                          <div key={type} className="space-y-4">
                            <h3 className="text-lg font-bold text-stone-300 flex items-center gap-2">
                              {type === 'pickup' ? <Package size={20} className="text-stone-500" /> : <ShoppingBag size={20} className="text-amber-500" />}
                              {type === 'pickup' ? t('admin.orders.type.pickup') : t('admin.orders.type.kiosk')}
                              <span className="text-xs bg-stone-800 text-stone-400 px-2 py-0.5 rounded-full">{typeOrders.length}</span>
                            </h3>
                            <div className="grid grid-cols-1 gap-6">
                              {typeOrders.map((order) => (
                                <div key={order.id} className="bg-stone-900 border border-stone-800 rounded-2xl overflow-hidden shadow-xl flex flex-col md:flex-row">
                                  <div className="p-4 md:p-6 border-b md:border-b-0 md:border-r border-stone-800 md:w-72 space-y-3">
                                    <div className="flex justify-between items-start">
                                      <div className="flex flex-col gap-1">
                                        <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">{t('admin.orders.id')}: {order.id.slice(-6)}</span>
                                        {order.orderNumber && (
                                          <span className="text-lg font-medium text-amber-500">#{order.orderNumber}</span>
                                        )}
                                        <div className="flex items-center gap-2">
                                          <span className={cn(
                                            "text-[10px] uppercase font-semibold tracking-[0.2em] px-2 py-0.5 rounded-md border",
                                            order.orderType === 'pickup' 
                                              ? "bg-stone-800 text-stone-400 border-stone-700" 
                                              : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                          )}>
                                            {order.orderType === 'pickup' ? t('admin.orders.type.pickup') : t('admin.orders.type.kiosk')}
                                          </span>
                                          {order.orderType === 'kiosk' && order.kioskNumber && (
                                            <span className="text-[10px] font-semibold text-amber-500 bg-amber-500/5 px-2 py-0.5 rounded-md border border-amber-500/10">
                                              #{order.kioskNumber}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                      <span className={cn(
                                        "text-[10px] uppercase font-semibold tracking-[0.2em] px-3 py-1 rounded-full",
                                        order.status === 'pending' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                                        order.status === 'preparing' ? "bg-blue-500/10 text-blue-500 border border-blue-500/20" :
                                        order.status === 'ready' ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                                        "bg-stone-800 text-stone-500"
                                      )}>
                                        {t(`admin.orders.status.${order.status}`)}
                                      </span>
                                    </div>
                                    <div>
                                      <h4 className="text-lg font-medium text-stone-200">{order.customerName || 'Walk-in Customer'}</h4>
                                      {order.phone && <p className="text-sm text-stone-400">{order.phone}</p>}
                                    </div>
                                    <div className="flex items-center text-xs text-stone-500">
                                      <Clock size={14} className="mr-2" />
                                      {new Date(order.timestamp).toLocaleString()}
                                    </div>
                                    {order.notes && (
                                      <div className="p-3 bg-stone-950 rounded-xl border border-stone-800">
                                        <p className="text-[10px] uppercase tracking-[0.2em] text-stone-600 font-semibold mb-1">{t('admin.orders.notes')}</p>
                                        <p className="text-xs text-stone-400 italic">"{order.notes}"</p>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex-1 p-4 md:p-6 flex flex-col">
                                    <div className="flex-1 space-y-4">
                                      <h5 className="text-[10px] uppercase tracking-[0.2em] text-stone-500 font-semibold">{t('admin.orders.items')}</h5>
                                      <div className="space-y-4">
                                        {order.items.map((item, idx) => (
                                          <div key={idx} className="flex justify-between text-sm">
                                            <div className="flex flex-col">
                                              <span className="text-stone-300 font-medium">
                                                <span className="font-semibold tabular-nums text-amber-500 mr-1">{item.quantity}x</span> {item.name}
                                              </span>
                                              {item.selectedPortion && (
                                                <span className="text-xs text-stone-500 ml-6 tracking-wide">Portion: {item.selectedPortion.name}</span>
                                              )}
                                              {item.packaging && (
                                                <span className="text-xs text-stone-500 ml-6 tracking-wide">Packaging (+₮<span className="tabular-nums">{(item.packagingPrice !== undefined ? item.packagingPrice : 0).toLocaleString()}</span>)</span>
                                              )}
                                            </div>
                                            <span className="text-stone-500 font-semibold tabular-nums">₮{((Math.round(item.price) + (item.packaging ? (item.packagingPrice !== undefined ? item.packagingPrice : 0) : 0)) * item.quantity).toLocaleString()}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="mt-4 pt-4 border-t border-stone-800 flex flex-col sm:flex-row justify-between items-center gap-3">
                                      <div className="text-xl font-medium tabular-nums shrink-0">
                                        <span className="text-stone-500 text-xs font-sans font-semibold uppercase tracking-[0.2em] mr-2">{t('admin.orders.total')}</span>
                                        ₮{Math.round(order.total).toLocaleString()}
                                      </div>
                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        {order.status === 'pending' && (
                                          <button
                                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                                            className="px-4 py-2 bg-blue-500 text-white text-xs font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-blue-400 transition-all"
                                          >
                                            {t('admin.orders.action.start')}
                                          </button>
                                        )}
                                        {order.status === 'preparing' && (
                                          <button
                                            onClick={() => updateOrderStatus(order.id, 'ready')}
                                            className="px-4 py-2 bg-green-500 text-white text-xs font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-green-400 transition-all"
                                          >
                                            {t('admin.orders.action.ready')}
                                          </button>
                                        )}
                                        {order.status === 'ready' && (
                                          <button
                                            onClick={() => updateOrderStatus(order.id, 'completed')}
                                            className="px-4 py-2 bg-stone-100 text-stone-900 text-xs font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-white transition-all"
                                          >
                                            {t('admin.orders.action.complete')}
                                          </button>
                                        )}
                                        {order.status !== 'completed' && order.status !== 'cancelled' && (
                                          <button
                                            onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                            className="p-2 text-stone-500 hover:text-amber-500 transition-colors"
                                            title="Cancel Order"
                                          >
                                            <XCircle size={20} />
                                          </button>
                                        )}
                                        <button
                                          onClick={() => handleDeleteOrder(order.id)}
                                          className="p-2 text-stone-500 hover:text-red-500 transition-colors"
                                          title="Delete Order"
                                        >
                                          <Trash2 size={20} />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="staff"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div>
                  <h2 className="text-3xl font-bold">{t('admin.staff.title')}</h2>
                  <p className="text-stone-500 text-sm">{t('admin.staff.subtitle')}</p>
                </div>

                <div className="max-w-xl">
                  <form onSubmit={handleAddAdmin} className="flex gap-4 mb-8">
                    <input
                      required
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder={t('admin.staff.form.placeholder')}
                      className="flex-1 bg-stone-900 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors"
                    />
                    <button
                      type="submit"
                      className="px-6 py-3 bg-amber-500 text-stone-900 font-bold uppercase tracking-widest rounded-xl hover:bg-amber-400 transition-all active:scale-95"
                    >
                      {t('admin.staff.form.button')}
                    </button>
                  </form>

                  <div className="bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden shadow-xl">
                    <div className="p-6 border-b border-stone-800">
                      <h4 className="text-xs uppercase tracking-widest text-stone-500 font-bold">{t('admin.staff.list.title')}</h4>
                    </div>
                    <div className="divide-y divide-stone-800">
                      <div className="px-6 py-4 flex justify-between items-center bg-stone-800/20">
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500">
                            <Star size={14} fill="currentColor" />
                          </div>
                          <span className="text-sm font-bold">boldsaihanlolor@gmail.com</span>
                        </div>
                        <span className="text-[10px] uppercase tracking-widest text-amber-500 font-bold">{t('admin.staff.primary')}</span>
                      </div>
                      {adminEmails.map((admin) => (
                        <div key={admin.id} className="px-6 py-4 flex justify-between items-center hover:bg-stone-800/30 transition-colors">
                          <span className="text-sm text-stone-300">{admin.id}</span>
                          <button
                            onClick={() => handleDeleteAdmin(admin.id)}
                            className="p-2 text-stone-600 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-stone-900/95 backdrop-blur-md border-t border-stone-800 flex items-stretch">
          <button
            onClick={() => setActiveTab('menu')}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors",
              activeTab === 'menu' ? "text-amber-500" : "text-stone-500"
            )}
          >
            <List size={22} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{t('admin.nav.menu')}</span>
          </button>
          <button
            onClick={() => setActiveTab('orders')}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors",
              activeTab === 'orders' ? "text-amber-500" : "text-stone-500"
            )}
          >
            <div className="relative">
              <ShoppingBag size={22} />
              {orders.filter(o => o.status === 'pending').length > 0 && (
                <span className="absolute -top-1.5 -right-2 bg-red-500 text-white text-[9px] w-4 h-4 flex items-center justify-center rounded-full font-bold">
                  {orders.filter(o => o.status === 'pending').length}
                </span>
              )}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">{t('admin.nav.orders')}</span>
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={cn(
              "flex-1 flex flex-col items-center justify-center py-3 gap-1 transition-colors",
              activeTab === 'staff' ? "text-amber-500" : "text-stone-500"
            )}
          >
            <Users size={22} />
            <span className="text-[10px] font-bold uppercase tracking-wider">{t('admin.nav.staff')}</span>
          </button>
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
                  <button onClick={() => { setIsEditing(null); setIsAdding(false); }} className="p-2 text-stone-500 hover:text-amber-500 transition-colors">
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
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors"
                        placeholder="e.g., Truffle Pasta"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('admin.modal.form.category')}</label>
                      <select
                        value={editForm.category || 'Draft'}
                        onChange={(e) => setEditForm({ ...editForm, category: e.target.value as Category })}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors appearance-none"
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
                        value={editForm.status || (editForm.available ? 'available' : 'hidden')}
                        onChange={(e) => {
                          const newStatus = e.target.value as ItemStatus;
                          setEditForm({ 
                            ...editForm, 
                            status: newStatus,
                            available: newStatus === 'available' || newStatus === 'daily_special',
                            statusUntil: (newStatus === 'sold_out_today' || newStatus === 'daily_special') ? getMidnightTonight() : null
                          });
                        }}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors appearance-none"
                      >
                        <option value="available">Available</option>
                        <option value="sold_out_today">Sold Out (Resets Tomorrow)</option>
                        <option value="hidden">Hidden / Off Menu</option>
                        <option value="daily_special">Daily Special (Ends Today)</option>
                      </select>
                    </div>
                     <div className="space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-stone-500 font-bold">{t('admin.modal.form.price')}</label>
                      <input
                        required
                        type="number"
                        value={editForm.price || ''}
                        onChange={(e) => setEditForm({ ...editForm, price: Math.round(Number(e.target.value)) })}
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors"
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
                        className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors"
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
                          className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 pl-10 text-stone-100 focus:border-amber-500 outline-none transition-colors cursor-pointer flex items-center gap-2 hover:border-amber-500/50"
                        >
                          <ImageIcon className="text-stone-600" size={18} />
                          <span className="text-sm text-stone-400 truncate">
                            {editForm.image || (editForm.sideImages && editForm.sideImages.length > 0) ? 'Add/Change Images' : 'Upload Images (1 Main, 2 Side)'}
                          </span>
                        </label>
                        <div className="mt-2 flex gap-2 overflow-x-auto">
                          {editForm.image && (
                            <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-amber-500 flex-shrink-0 group">
                              <img src={editForm.image} alt="Main Preview" className="w-full h-full object-cover group-hover:opacity-50 transition-opacity" />
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                <span className="text-[10px] font-bold text-white bg-black/50 px-2 py-1 rounded">Change</span>
                              </div>
                              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-0" onChange={(e) => handleReplaceImage(-1, e)} title="Change Main Image" />
                              <div className="absolute bottom-0 left-0 right-0 bg-amber-500/80 text-[8px] text-center font-bold text-stone-900 uppercase pointer-events-none">Main</div>
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
                                className="absolute bottom-0 left-0 bg-amber-500 text-stone-900 p-0.5 rounded-tr-lg text-[8px] font-bold px-1.5 z-10 hover:bg-amber-400"
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
                      className="w-full bg-stone-950 border border-stone-800 rounded-xl px-4 py-3 text-stone-100 focus:border-amber-500 outline-none transition-colors h-24 resize-none"
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
                        className="text-xs text-amber-500 hover:text-amber-400 font-bold flex items-center gap-1"
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
                              className="flex-1 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-100 focus:border-amber-500 outline-none"
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
                              className="w-24 bg-stone-950 border border-stone-800 rounded-xl px-3 py-2 text-sm text-stone-100 focus:border-amber-500 outline-none"
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
                          editForm.available ? "bg-amber-500" : "bg-stone-800"
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
                          editForm.featured ? "bg-amber-500" : "bg-stone-800"
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
                      className="flex items-center space-x-2 px-8 py-3 bg-amber-500 text-stone-900 font-semibold uppercase tracking-[0.15em] rounded-full hover:bg-amber-400 transition-all active:scale-95 shadow-lg shadow-amber-500/20"
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
                      <h4 className="text-xs uppercase tracking-[0.2em] font-bold text-amber-500">Service Type</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {['pickup', 'kiosk'].map((type) => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setAdminOrderForm({ ...adminOrderForm, orderType: type as OrderType })}
                            className={cn(
                              "py-3 md:py-4 rounded-2xl text-xs font-bold uppercase tracking-widest border transition-all flex flex-col items-center gap-2",
                              adminOrderForm.orderType === type
                                ? "bg-amber-500 text-stone-900 border-amber-500 shadow-lg shadow-amber-500/20"
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
                          className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-4 md:px-5 py-3 md:py-4 text-sm md:text-base focus:border-amber-500 outline-none transition-all focus:ring-1 focus:ring-amber-500/20"
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
                        className="w-full bg-stone-950 border border-stone-800 rounded-2xl px-10 md:px-12 py-3 md:py-4 text-sm md:text-base focus:border-amber-500 outline-none transition-all"
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
                            <h5 className="text-xs md:text-sm uppercase tracking-[0.3em] font-bold text-amber-500">{t(`menu.${cat.toLowerCase()}`)}</h5>
                            <div className="flex-1 h-px bg-stone-800"></div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                            {catItems.map((item) => (
                              <div key={item.id} className="group bg-stone-950 border border-stone-800 rounded-2xl p-3 md:p-4 space-y-3 md:space-y-4 hover:border-amber-500/50 transition-all">
                                <div className="flex justify-between items-start gap-3 md:gap-4">
                                  <div className="space-y-1">
                                    <span className="text-sm md:text-base font-bold block group-hover:text-amber-500 transition-colors">{item.name}</span>
                                    <p className="text-[10px] md:text-xs text-stone-500 line-clamp-2">{item.description}</p>
                                  </div>
                                  {!item.portions || item.portions.length === 0 ? (
                                    <button
                                      onClick={() => addToAdminOrder(item)}
                                      className="p-2 md:p-3 bg-amber-500 text-stone-900 rounded-xl hover:bg-amber-400 transition-all active:scale-90 shadow-lg shadow-amber-500/10 shrink-0"
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
                                        className="flex justify-between items-center px-3 py-2 bg-stone-900 border border-stone-800 rounded-xl text-xs hover:border-amber-500 transition-all group/btn"
                                      >
                                        <span className="text-stone-400 group-hover/btn:text-stone-200 truncate pr-2">{p.name}</span>
                                        <span className="font-bold text-amber-500 shrink-0">₮{p.price.toLocaleString()}</span>
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
                    <h4 className="text-xs uppercase tracking-[0.2em] font-bold text-amber-500">Order Summary</h4>
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
                                <span className="text-[10px] text-amber-500/70 uppercase tracking-widest font-bold block truncate">
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
                              <button onClick={() => removeFromAdminOrder(item.item.id, item.selectedPortion?.name)} className="text-stone-500 hover:text-amber-500 transition-colors p-1">
                                <Minus size={14} className="md:w-4 md:h-4" />
                              </button>
                              <span className="text-xs md:text-sm font-bold w-4 md:w-6 text-center tabular-nums">{item.quantity}</span>
                              <button onClick={() => addToAdminOrder(item.item, item.selectedPortion)} className="text-stone-500 hover:text-amber-500 transition-colors p-1">
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
                        <span className="text-xl md:text-3xl font-bold tabular-nums text-amber-500">
                          ₮{adminOrderItems.reduce((acc, curr) => acc + ((curr.selectedPortion ? curr.selectedPortion.price : curr.item.price) * curr.quantity), 0).toLocaleString()}
                        </span>
                      </div>
                      <button
                        onClick={handleCreateAdminOrder}
                        disabled={adminOrderItems.length === 0}
                        className={cn(
                          "w-full py-4 md:py-5 rounded-2xl text-sm md:text-base font-bold uppercase tracking-[0.2em] transition-all flex items-center justify-center gap-3 shadow-xl shadow-amber-500/10",
                          adminOrderItems.length > 0
                            ? "bg-amber-500 text-stone-900 hover:bg-amber-400 active:scale-95"
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
