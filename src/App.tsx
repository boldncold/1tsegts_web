import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { LanguageProvider } from './context/LanguageContext';
import { StoreSettingsProvider } from './context/StoreSettingsContext';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from 'sonner';
import Home from './components/Home';
import MenuSection from './components/MenuSection';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CartDrawer from './components/CartDrawer';
import { useState, useEffect, lazy, Suspense } from 'react';

// Pages a customer rarely or never opens load as separate files on first
// visit to them, so the home page doesn't download them. The admin dashboard
// alone is ~40% of the app's code. Home, Menu and the cart (the order path)
// stay in the main file so ordering never waits on an extra download.
const AdminDashboard = lazy(() => import('./components/AdminDashboard'));
const About = lazy(() => import('./components/About'));
const Contact = lazy(() => import('./components/Contact'));

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function AppContent() {
  const [isCartOpen, setIsCartOpen] = useState(false);
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');
  // No auto-redirect from / → /admin. Admins land on /admin via the footer
  // link (or by typing the URL); from there they can use the Home button in
  // the dashboard to browse customer pages in test mode.

  return (
    <div className="bg-[var(--surface-page)] min-h-screen text-white selection:bg-[var(--gold)] selection:text-white">
      <ScrollToTop />
      <Toaster position="top-center" richColors theme="dark" />
      {!isAdminRoute && <Navbar onCartOpen={() => setIsCartOpen(true)} />}
      {/* min-h-screen keeps the footer from jumping up while a lazy page loads. */}
      <Suspense fallback={<div className="min-h-screen" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/menu" element={
            <div className="pt-14">
              <MenuSection />
            </div>
          } />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </Suspense>
      {!isAdminRoute && <Footer />}
      {!isAdminRoute && <CartDrawer isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />}
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <StoreSettingsProvider>
        <Router>
          <AuthProvider>
            <CartProvider>
              <AppContent />
            </CartProvider>
          </AuthProvider>
        </Router>
      </StoreSettingsProvider>
    </LanguageProvider>
  );
}
