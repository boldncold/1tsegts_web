import React, { createContext, useContext } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';

/** The signed-in admin, in the shape the dashboard already renders. */
export interface CurrentUser {
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

interface AuthContextValue {
  currentUser: CurrentUser | null;
  isAdmin: boolean;
  isAdminLoading: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  currentUser: null,
  isAdmin: false,
  isAdminLoading: true,
});

/**
 * Admin sign-in state from Convex Auth (convex/auth.ts). isAdmin only decides
 * what the UI shows — every admin function re-checks on the server
 * (convex/lib/admin.ts).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const viewer = useQuery(api.staff.viewer, isAuthenticated ? {} : 'skip');

  const value: AuthContextValue = {
    currentUser: viewer
      ? { email: viewer.email, displayName: viewer.name, photoURL: viewer.image }
      : null,
    isAdmin: viewer?.isAdmin ?? false,
    isAdminLoading: isLoading || (isAuthenticated && viewer === undefined),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
