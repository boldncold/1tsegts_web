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
      className="bg-stone-950 min-h-screen"
    >
      <FeaturedDishes />
      <CategoryQuickNav />
      <Hero />
      <div id="menu">
        <MenuSection />
      </div>
    </motion.div>
  );
}
