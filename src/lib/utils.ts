import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { MenuItem } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getMidnightTonight(): number {
  const d = new Date();
  d.setHours(24, 0, 0, 0);
  return d.getTime();
}

export function getDynamicStatus(item: MenuItem): { isVisible: boolean, isAvailable: boolean } {
  const now = Date.now();
  
  if (!item.status) {
    return {
      isVisible: true,
      isAvailable: item.available
    };
  }

  switch (item.status) {
    case 'hidden':
      return { isVisible: false, isAvailable: false };
      
    case 'available':
      return { isVisible: true, isAvailable: true };
      
    case 'sold_out_today':
      if (item.statusUntil && now < item.statusUntil) {
        return { isVisible: true, isAvailable: false };
      }
      return { isVisible: true, isAvailable: true };
      
    case 'daily_special':
      if (item.statusUntil && now < item.statusUntil) {
        return { isVisible: true, isAvailable: true };
      }
      return { isVisible: false, isAvailable: false };
      
    default:
      return { isVisible: true, isAvailable: item.available };
  }
}

export function isStoreOpen(): boolean {
  const now = new Date();
  
  // Get hour (0-23) in Ulaanbaatar
  const hourStr = new Intl.DateTimeFormat('en-US', { 
    timeZone: 'Asia/Ulaanbaatar', 
    hour: 'numeric', 
    hour12: false 
  }).format(now);
  
  // Get weekday in Ulaanbaatar
  const weekdayStr = new Intl.DateTimeFormat('en-US', { 
    timeZone: 'Asia/Ulaanbaatar', 
    weekday: 'short' 
  }).format(now);

  // hour12: false can return "24" for midnight in some environments, handle it
  const hour = hourStr === '24' ? 0 : parseInt(hourStr, 10);
  
  // Closed on Monday
  if (weekdayStr === 'Mon') return false;
  
  // Open between 11:00 and 19:00 (11:00:00 to 18:59:59)
  if (hour >= 11 && hour < 19) {
    return true;
  }
  
  return false;
}
