export type Category = 'European' | 'Asian' | 'Drinks' | 'Mongolian' | 'Draft';
export type ItemStatus = 'available' | 'sold_out_today' | 'hidden' | 'daily_special'; // daily_special kept for backward compat

export interface Portion {
  name: string;
  price: number;
  available?: boolean;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image: string;
  sideImages?: string[];
  category: Category;
  tags: string[];
  available: boolean; // Legacy, kept for backward compatibility
  status?: ItemStatus;
  statusUntil?: number;
  scheduledDays?: number[];  // 0=Sun, 1=Mon … 6=Sat; recurring weekly schedule
  todayOnly?: boolean;       // visible today only, resets at midnight
  featured?: boolean;
  orderCount?: number;
  packagingPrice?: number;
  portions?: Portion[];
  pool?: 'specials';
}

export interface CartItem extends MenuItem {
  cartItemId: string;
  quantity: number;
  packaging?: boolean;
  selectedPortion?: Portion;
}

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
export type OrderType = 'pickup' | 'kiosk';

export interface Order {
  id: string;
  items: {
    id: string;
    name: string;
    price: number;
    quantity: number;
  }[];
  total: number;
  customerName?: string;
  phone?: string;
  orderType: OrderType;
  kioskNumber?: string;
  orderNumber?: string;
  notes?: string;
  status: OrderStatus;
  timestamp: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'user';
}

export interface StoreSettings {
  openHour: number;
  closeHour: number;
  closedDays: number[];      // 0=Sun … 6=Sat
  closedUntil: string | null;       // YYYY-MM-DD — store closed through this date
  noClosedDayUntil: string | null;  // YYYY-MM-DD — closed-day rule suspended through this date
}
