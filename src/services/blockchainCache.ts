import AsyncStorage from '@react-native-async-storage/async-storage';
import { BetData, getAllBets, getBetById, getContractBalance, getMaticPriceEur } from './blockchain';

// Cache keys
const CACHE_KEYS = {
  BETS: '@betsquad_cache_bets',
  BALANCE: '@betsquad_cache_balance_',
  MATIC_PRICE: '@betsquad_cache_matic_price',
  LAST_UPDATE: '@betsquad_cache_last_update_',
};

// Cache durations (in milliseconds)
const CACHE_DURATION = {
  BETS: 30 * 1000,        // 30 seconds
  BALANCE: 20 * 1000,     // 20 seconds
  MATIC_PRICE: 60 * 1000, // 1 minute
};

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Generic cache functions
async function getFromCache<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const cached = await AsyncStorage.getItem(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    console.warn('Cache read error:', error);
  }
  return null;
}

async function saveToCache<T>(key: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
    };
    await AsyncStorage.setItem(key, JSON.stringify(entry));
  } catch (error) {
    console.warn('Cache write error:', error);
  }
}

function isCacheValid(timestamp: number, duration: number): boolean {
  return Date.now() - timestamp < duration;
}

// Cached getAllBets - much faster for users
export async function getCachedBets(forceRefresh = false): Promise<BetData[]> {
  const cacheKey = CACHE_KEYS.BETS;
  
  if (!forceRefresh) {
    const cached = await getFromCache<BetData[]>(cacheKey);
    if (cached && isCacheValid(cached.timestamp, CACHE_DURATION.BETS)) {
      console.log('Using cached bets');
      return cached.data;
    }
  }
  
  // Fetch fresh data
  console.log('Fetching fresh bets from blockchain...');
  try {
    const bets = await getAllBets();
    await saveToCache(cacheKey, bets);
    return bets;
  } catch (error) {
    // If fetch fails, return cached data even if stale
    const cached = await getFromCache<BetData[]>(cacheKey);
    if (cached) {
      console.log('Using stale cache due to fetch error');
      return cached.data;
    }
    throw error;
  }
}

// Cached getContractBalance
export async function getCachedBalance(address: string, forceRefresh = false): Promise<string> {
  const cacheKey = CACHE_KEYS.BALANCE + address.toLowerCase();
  
  if (!forceRefresh) {
    const cached = await getFromCache<string>(cacheKey);
    if (cached && isCacheValid(cached.timestamp, CACHE_DURATION.BALANCE)) {
      console.log('Using cached balance');
      return cached.data;
    }
  }
  
  console.log('Fetching fresh balance from blockchain...');
  try {
    const balance = await getContractBalance(address);
    await saveToCache(cacheKey, balance);
    return balance;
  } catch (error) {
    const cached = await getFromCache<string>(cacheKey);
    if (cached) {
      return cached.data;
    }
    return '0';
  }
}

// Cached MATIC price
export async function getCachedMaticPrice(forceRefresh = false): Promise<number> {
  const cacheKey = CACHE_KEYS.MATIC_PRICE;
  
  if (!forceRefresh) {
    const cached = await getFromCache<number>(cacheKey);
    if (cached && isCacheValid(cached.timestamp, CACHE_DURATION.MATIC_PRICE)) {
      console.log('Using cached MATIC price');
      return cached.data;
    }
  }
  
  try {
    const price = await getMaticPriceEur();
    await saveToCache(cacheKey, price);
    return price;
  } catch (error) {
    const cached = await getFromCache<number>(cacheKey);
    if (cached) {
      return cached.data;
    }
    return 0.45; // Default fallback
  }
}

// Clear all cache
export async function clearCache(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(k => k.startsWith('@betsquad_cache'));
    await AsyncStorage.multiRemove(cacheKeys);
    console.log('Cache cleared');
  } catch (error) {
    console.warn('Cache clear error:', error);
  }
}

// Invalidate specific cache
export async function invalidateBetsCache(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEYS.BETS);
  } catch (error) {
    console.warn('Cache invalidate error:', error);
  }
}

export async function invalidateBalanceCache(address: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEYS.BALANCE + address.toLowerCase());
  } catch (error) {
    console.warn('Cache invalidate error:', error);
  }
}
