/**
 * Server-Side Caching Service
 *
 * Provides in-memory caching with TTL support for frequently accessed data.
 * This reduces database load and improves response times.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  hits: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  hitRate: number;
}

class CacheService {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private stats = {
    hits: 0,
    misses: 0,
  };

  // Default TTL values (in milliseconds)
  static readonly TTL = {
    SHORT: 30 * 1000,        // 30 seconds - for real-time data
    MEDIUM: 5 * 60 * 1000,   // 5 minutes - for user data
    LONG: 30 * 60 * 1000,    // 30 minutes - for static data
    HOUR: 60 * 60 * 1000,    // 1 hour - for rarely changing data
  };

  /**
   * Get a cached value
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    return entry.data as T;
  }

  /**
   * Set a cached value with TTL
   */
  set<T>(key: string, data: T, ttlMs: number = CacheService.TTL.MEDIUM): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      hits: 0,
    });
  }

  /**
   * Get or set pattern - returns cached value or fetches and caches
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlMs: number = CacheService.TTL.MEDIUM
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    this.set(key, data, ttlMs);
    return data;
  }

  /**
   * Invalidate a specific key
   */
  invalidate(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Invalidate all keys matching a pattern
   */
  invalidatePattern(pattern: string): number {
    let count = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    return count;
  }

  /**
   * Invalidate all keys for a specific user
   */
  invalidateUser(userId: string): number {
    return this.invalidatePattern(`user:${userId}`);
  }

  /**
   * Clear all cached data
   */
  clear(): void {
    this.cache.clear();
    this.stats.hits = 0;
    this.stats.misses = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Clean up expired entries (call periodically)
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
  }
}

// Singleton instance
export const cache = new CacheService();

// Start cleanup interval (every 5 minutes)
setInterval(() => {
  const removed = cache.cleanup();
  if (removed > 0) {
    console.log(`[Cache] Cleaned up ${removed} expired entries`);
  }
}, 5 * 60 * 1000);

// Cache key generators for consistency
export const cacheKeys = {
  // User-related
  userProfile: (userId: string) => `user:${userId}:profile`,
  userMetrics: (userId: string, type?: string) =>
    type ? `user:${userId}:metrics:${type}` : `user:${userId}:metrics`,
  userFoodEntries: (userId: string, date?: string) =>
    date ? `user:${userId}:food:${date}` : `user:${userId}:food`,
  userMacroProgress: (userId: string, date: string) =>
    `user:${userId}:macro:${date}`,
  userDashboard: (userId: string) => `user:${userId}:dashboard`,

  // Admin-related
  allParticipants: () => "admin:participants",
  allCoaches: () => "admin:coaches",
  dashboardStats: () => "admin:dashboard-stats",

  // Prompt system
  activePrompts: () => "prompts:active",
  promptRules: () => "prompts:rules",

  // Analytics
  analytics: (type: string, params: string) => `analytics:${type}:${params}`,
};

export default cache;
