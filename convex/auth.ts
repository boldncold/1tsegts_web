import Google from "@auth/core/providers/google";
import { convexAuth } from "@convex-dev/auth/server";

// Admin sign-in only — customers never sign in. Signing in proves who someone
// is; whether they may administer is decided per call by requireAdmin
// (convex/lib/admin.ts). Needs AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET on the
// deployment, from a Google OAuth client whose redirect URI is
// <CONVEX_SITE_URL>/api/auth/callback/google.
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Google],
});
