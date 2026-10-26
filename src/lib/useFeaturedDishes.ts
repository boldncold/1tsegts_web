import { useMemo } from 'react';
import { useCachedQuery } from './useCachedQuery';
import { api } from '../../convex/_generated/api';
import { MenuItem } from '../types';

export function useFeaturedDishes() {
  // Featured picks, or the most-ordered dishes when none are featured —
  // the fallback now lives server-side in convex/menu.ts.
  const dishes = useCachedQuery(api.menu.featured);

  return useMemo(() => {
    // The schema's category also admits legacy 'Specials'; the UI groups
    // specials by `pool` and never branches on that value.
    const items = (dishes ?? []) as MenuItem[];
    const featured = items.filter(
      (dish) => dish.tags?.includes('chefsPick') || dish.tags?.includes('popular') || dish.featured
    );
    const rest = items.filter((dish) => !featured.includes(dish));
    return [...featured, ...rest].slice(0, 10);
  }, [dishes]);
}
