import Hero from './Hero';
import MenuSection from './MenuSection';
import CategoryQuickNav from './CategoryQuickNav';
import FeaturedDishes from './FeaturedDishes';
import { useFeaturedDishes } from '../lib/useFeaturedDishes';

export default function Home() {
  const featuredDishes = useFeaturedDishes();

  // No page-wide fade-in here: it started the whole page at opacity 0, and
  // browsers don't count invisible content as painted, so it pushed back the
  // moment the page looked loaded. The Hero keeps its own entrance motion.
  return (
    <div className="bg-[var(--surface-page)] min-h-screen">
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
    </div>
  );
}
