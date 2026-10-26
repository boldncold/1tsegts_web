import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ConvexReactClient} from 'convex/react';
import {ConvexAuthProvider} from '@convex-dev/auth/react';
import App from './App.tsx';
import './index.css';

// Written to .env.local by `npx convex dev`; set it in Vercel for deployed builds.
const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is not set — run `npx convex dev` or add it to the deployment env.');
}
const convex = new ConvexReactClient(convexUrl);

// Pages split into their own files (see App.tsx) have hashed names that
// change on every deploy. A tab opened before a deploy can ask for a file
// that no longer exists; reload once to pick up the new version instead of
// showing a blank page. The session flag stops a reload loop if the file is
// missing for some other reason.
window.addEventListener('vite:preloadError', (event) => {
  const key = 'reloaded-after-deploy';
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Convex Auth: admin sign-in only; customers never sign in. */}
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </StrictMode>,
);
