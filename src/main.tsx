import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {ConvexProvider, ConvexReactClient} from 'convex/react';
import App from './App.tsx';
import './index.css';

// Written to .env.local by `npx convex dev`; set it in Vercel for deployed builds.
const convexUrl = import.meta.env.VITE_CONVEX_URL;
if (!convexUrl) {
  throw new Error('VITE_CONVEX_URL is not set — run `npx convex dev` or add it to the deployment env.');
}
const convex = new ConvexReactClient(convexUrl);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexProvider client={convex}>
      <App />
    </ConvexProvider>
  </StrictMode>,
);
