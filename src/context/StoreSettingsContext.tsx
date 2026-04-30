import React, { createContext, useContext, useEffect, useState } from 'react';
import { db, doc, onSnapshot } from '../firebase';
import { StoreSettings } from '../types';
import { isStoreOpen, DEFAULT_STORE_SETTINGS } from '../lib/utils';

interface StoreSettingsContextType {
  settings: StoreSettings;
  storeOpen: boolean;
}

const StoreSettingsContext = createContext<StoreSettingsContextType>({
  settings: DEFAULT_STORE_SETTINGS,
  storeOpen: isStoreOpen(DEFAULT_STORE_SETTINGS),
});

export function StoreSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<StoreSettings>(DEFAULT_STORE_SETTINGS);
  const [storeOpen, setStoreOpen] = useState(() => isStoreOpen(DEFAULT_STORE_SETTINGS));

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'store'), (snap) => {
      const data: StoreSettings = snap.exists()
        ? { ...DEFAULT_STORE_SETTINGS, ...(snap.data() as Partial<StoreSettings>) }
        : DEFAULT_STORE_SETTINGS;
      setSettings(data);
      setStoreOpen(isStoreOpen(data));
    });
    return () => unsub();
  }, []);

  // Re-evaluate every minute in case hour boundary crosses
  useEffect(() => {
    const id = setInterval(() => setStoreOpen(isStoreOpen(settings)), 60_000);
    return () => clearInterval(id);
  }, [settings]);

  return (
    <StoreSettingsContext.Provider value={{ settings, storeOpen }}>
      {children}
    </StoreSettingsContext.Provider>
  );
}

export function useStoreSettings() {
  return useContext(StoreSettingsContext);
}
