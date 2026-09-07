import Hero from './Hero';
import MenuSection from './MenuSection';
import CategoryQuickNav from './CategoryQuickNav';
import FeaturedDishes from './FeaturedDishes';
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
      {/* Exactly one featured carousel per viewport: mobile has the compact
          widget inside the Hero; desktop gets the Онцлох хоол marquee moved
          up directly below it (the hero is height-trimmed on md+ so the
          marquee sits high). FeaturedDishes renders null on mobile itself. */}
      <Hero dishes={featuredDishes.slice(0, 6)} />
      <FeaturedDishes dishes={featuredDishes} />
      <CategoryQuickNav />
      <div id="menu">
        <MenuSection />
      </div>
    </motion.div>
  );
}
