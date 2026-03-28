import { Redis } from 'ioredis';
import { env } from './env';

// Conexión Redis singleton
export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null, // Necesario para BullMQ
  enableReadyCheck: false,
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err.message);
});

redis.on('connect', () => {
  if (env.NODE_ENV === 'development') {
    console.warn('Redis connected');
  }
});

/**
 * Wrapper para cache con TTL
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached) as T;
  }

  const data = await fetcher();
  await redis.setex(key, ttlSeconds, JSON.stringify(data));
  return data;
}

/**
 * Invalida cache por prefijo
 */
export async function invalidateCache(pattern: string): Promise<void> {
  const keys = await redis.keys(pattern);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
