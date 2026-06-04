import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { LanguageProvider } from './context/LanguageContext';
import { StoreSettingsProvider } from './context/StoreSettingsContext';
import { AuthProvider } from './context/AuthContext';
import { Toaster } from 'sonner';
import Home from './components/Home';
import AdminDashboard from './components/AdminDashboard';
import MenuSection from './components/MenuSection';
import About from './components/About';
import Contact from './components/Contact';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import CartDrawer from './components/CartDrawer';
import { useState, useEffect } from 'react';

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
    <div className="bg-white min-h-screen text-stone-900 selection:bg-[#D4AF37] selection:text-white">
      <ScrollToTop />
      <Toaster position="top-center" richColors theme="light" />
      {!isAdminRoute && <Navbar onCartOpen={() => setIsCartOpen(true)} />}
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
