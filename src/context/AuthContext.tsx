import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User } from 'firebase/auth';
import { auth, db, onAuthStateChanged, doc, getDoc } from '../firebase';

interface AuthContextValue {
  currentUser: User | null;
  isAdmin: boolean;
  isAdminLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isAdmin: false,
  isAdminLoading: true,
});

const HARDCODED_OWNER_EMAIL = 'boldsaihanlolor@gmail.com';

async function resolveIsAdmin(user: User): Promise<boolean> {
  if (user.email === HARDCODED_OWNER_EMAIL) return true;
  try {
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (userDoc.data()?.role === 'admin') return true;
  } catch {
    // Firestore rules or network failure — fall through to admin_emails check.
  }
  try {
    const emailKey = user.email?.toLowerCase() || '';
    if (!emailKey) return false;
    const adminEmailDoc = await getDoc(doc(db, 'admin_emails', emailKey));
    return adminEmailDoc.exists();
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (!user) {
        setIsAdmin(false);
        setIsAdminLoading(false);
        return;
      }
      setIsAdminLoading(true);
      const adminFlag = await resolveIsAdmin(user);
      setIsAdmin(adminFlag);
      setIsAdminLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ currentUser, isAdmin, isAdminLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
