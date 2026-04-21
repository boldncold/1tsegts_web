import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { CartProvider } from './context/CartContext';
import { LanguageProvider } from './context/LanguageContext';
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
import { auth, db, onAuthStateChanged, doc, getDoc } from './firebase';

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
  const navigate = useNavigate();
  const isAdminRoute = location.pathname.startsWith('/admin');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser && location.pathname === '/') {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          const userData = userDoc.data();
          
          const adminEmailDoc = await getDoc(doc(db, 'admin_emails', currentUser.email?.toLowerCase() || ''));
          
          if (userData?.role === 'admin' || currentUser.email === 'boldsaihanlolor@gmail.com' || adminEmailDoc.exists()) {
            navigate('/admin');
          }
        } catch (error) {
          console.error("Error checking admin status for redirect:", error);
        }
      }
    });

    return () => unsubscribe();
  }, [location.pathname, navigate]);

  return (
    <div className="bg-white min-h-screen text-stone-900 selection:bg-[#D4AF37] selection:text-white">
      <ScrollToTop />
      <Toaster position="top-center" richColors theme="light" />
      {!isAdminRoute && <Navbar onCartOpen={() => setIsCartOpen(true)} />}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/menu" element={
          <div className="pt-20">
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
      <CartProvider>
        <Router>
          <AppContent />
        </Router>
      </CartProvider>
    </LanguageProvider>
  );
}
