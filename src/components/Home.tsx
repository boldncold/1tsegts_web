import Hero from './Hero';
import MenuSection from './MenuSection';
import CategoryQuickNav from './CategoryQuickNav';
import { motion } from 'motion/react';
import { useFeaturedDishes } from '../lib/useFeaturedDishes';

export default function Home() {
  const featuredDishes = useFeaturedDishes();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="bg-[var(--surface-page)] min-h-screen"
    >
      {/* The featured carousel lives inside the Hero — exactly one featured
          section on the page (the old marquee section was its duplicate). */}
      <Hero dishes={featuredDishes.slice(0, 6)} />
      <CategoryQuickNav />
      <div id="menu">
        <MenuSection />
      </div>
    </motion.div>
  );
}
