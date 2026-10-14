import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
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
  const stored = useQuery(api.settings.getStore);
  const settings = useMemo<StoreSettings>(
    () => (stored ? { ...DEFAULT_STORE_SETTINGS, ...stored } : DEFAULT_STORE_SETTINGS),
    [stored],
  );
  const [storeOpen, setStoreOpen] = useState(() => isStoreOpen(DEFAULT_STORE_SETTINGS));

  // Re-evaluate on every settings change, and every minute in case an hour
  // boundary crosses.
  useEffect(() => {
    setStoreOpen(isStoreOpen(settings));
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
