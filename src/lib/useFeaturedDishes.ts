import { useEffect, useMemo, useState } from 'react';
import { collection, db, limit, onSnapshot, orderBy, query, where } from '../firebase';
import { MenuItem } from '../types';

export function useFeaturedDishes() {
  const [dishes, setDishes] = useState<MenuItem[]>([]);

  useEffect(() => {
    const featuredQuery = query(
      collection(db, 'menu'),
      where('available', '==', true),
      where('featured', '==', true),
      limit(10)
    );

    let fallbackUnsubscribe: (() => void) | null = null;
    const unsubscribe = onSnapshot(featuredQuery, (snapshot) => {
      if (!snapshot.empty) {
        fallbackUnsubscribe?.();
        fallbackUnsubscribe = null;
        setDishes(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as MenuItem[]);
        return;
      }

      if (!fallbackUnsubscribe) {
        const fallbackQuery = query(
          collection(db, 'menu'),
          where('available', '==', true),
          orderBy('orderCount', 'desc'),
          limit(10)
        );
        fallbackUnsubscribe = onSnapshot(fallbackQuery, (fallbackSnapshot) => {
          setDishes(
            fallbackSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as MenuItem[]
          );
        });
      }
    });

    return () => {
      unsubscribe();
      fallbackUnsubscribe?.();
    };
  }, []);

  return useMemo(() => {
    const featured = dishes.filter(
      (dish) => dish.tags?.includes('chefsPick') || dish.tags?.includes('popular') || dish.featured
    );
    const rest = dishes.filter((dish) => !featured.includes(dish));
    return [...featured, ...rest].slice(0, 10);
  }, [dishes]);
}
