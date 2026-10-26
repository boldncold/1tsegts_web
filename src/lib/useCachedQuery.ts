import { useEffect, useMemo } from 'react';
import { useQuery } from 'convex/react';
import { getFunctionName, type FunctionReference, type FunctionReturnType } from 'convex/server';

type ArglessQuery = FunctionReference<'query', 'public', Record<string, never>>;

// Bump when a cached query's return shape changes, so old copies are ignored.
const VERSION = 1;
// One cache per deployment: a dev build on localhost never shows prod data.
const SCOPE = import.meta.env.VITE_CONVEX_URL;

function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * useQuery for public, argument-less queries, plus the last result kept on
 * the device. A returning visitor sees the menu at once instead of waiting on
 * the round trip to Convex (eu-west-1); the live result replaces it as soon
 * as it arrives, usually within a second.
 *
 * Only for display data. Anything that decides money or order state must use
 * the live result: here that holds by construction, since the server prices
 * every order from the menu itself (convex/lib/orderPricing.ts).
 */
export function useCachedQuery<Q extends ArglessQuery>(query: Q): FunctionReturnType<Q> | undefined {
  const key = `convex-cache:v${VERSION}:${SCOPE}:${getFunctionName(query)}`;
  const live = useQuery(query as ArglessQuery) as FunctionReturnType<Q> | undefined;
  const cached = useMemo(() => readCache<FunctionReturnType<Q>>(key), [key]);

  useEffect(() => {
    if (live === undefined) return;
    try {
      localStorage.setItem(key, JSON.stringify(live));
    } catch {
      // Storage full or blocked (private mode): the page still works, uncached.
    }
  }, [key, live]);

  return live ?? cached;
}
