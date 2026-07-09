import Hero from './Hero';
import MenuSection from './MenuSection';
import CategoryQuickNav from './CategoryQuickNav';
import FeaturedDishes from './FeaturedDishes';
import { motion } from 'motion/react';

export default function Home() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-[var(--surface-page)] min-h-screen"
    >
      <Hero />
      <FeaturedDishes />
      <CategoryQuickNav />
      <div id="menu">
        <MenuSection />
      </div>
    </motion.div>
  );
}
