export interface BoundedCacheOptions {
  /** Maximum number of entries retained by this cache. */
  maxEntries: number
  /** Absolute lifetime of an entry after it is written. */
  ttlMs: number
  /** Injectable clock for deterministic tests. */
  now?: () => number
}

/**
 * A small Map-compatible LRU cache with a hard entry limit and TTL.
 *
 * Worker isolates can survive many requests, so a module-level Map must not
 * be treated as request-scoped memory.  This class bounds both the number of
 * retained values and their lifetime while keeping the Map API used by the
 * existing drivers.
 */
export class BoundedCache<K, V> extends Map<K, V> {
  private readonly maxEntries: number
  private readonly ttlMs: number
  private readonly now: () => number
  private readonly expiresAt = new Map<K, number>()

  constructor(options: BoundedCacheOptions) {
    super()
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries))
    this.ttlMs = Math.max(1, Math.floor(options.ttlMs))
    this.now = options.now || Date.now
  }

  override get(key: K): V | undefined {
    if (!this.isLive(key)) return undefined
    const value = super.get(key)
    if (value !== undefined || super.has(key)) {
      // Map insertion order is used as the LRU order.
      super.delete(key)
      super.set(key, value as V)
    }
    return value
  }

  override has(key: K): boolean {
    return this.isLive(key)
  }

  override set(key: K, value: V): this {
    this.prune()
    if (super.has(key)) {
      super.delete(key)
      this.expiresAt.delete(key)
    }
    while (super.size >= this.maxEntries) {
      const oldest = super.keys().next().value as K | undefined
      if (oldest === undefined) break
      this.delete(oldest)
    }
    super.set(key, value)
    this.expiresAt.set(key, this.now() + this.ttlMs)
    return this
  }

  override delete(key: K): boolean {
    this.expiresAt.delete(key)
    return super.delete(key)
  }

  override clear(): void {
    this.expiresAt.clear()
    super.clear()
  }

  override get size(): number {
    this.prune()
    return super.size
  }

  override keys(): MapIterator<K> {
    this.prune()
    return super.keys()
  }

  override values(): MapIterator<V> {
    this.prune()
    return super.values()
  }

  override entries(): MapIterator<[K, V]> {
    this.prune()
    return super.entries()
  }

  override [Symbol.iterator](): MapIterator<[K, V]> {
    return this.entries()
  }

  override forEach(
    callbackfn: (value: V, key: K, map: Map<K, V>) => void,
    thisArg?: any,
  ): void {
    this.prune()
    super.forEach((value, key) => callbackfn.call(thisArg, value, key, this))
  }

  /** Remove expired entries and return the number removed. */
  public prune(now = this.now()): number {
    let removed = 0
    for (const [key, expires] of this.expiresAt) {
      if (expires <= now) {
        if (this.delete(key)) removed++
      }
    }
    return removed
  }

  private isLive(key: K): boolean {
    if (!super.has(key)) return false
    const expires = this.expiresAt.get(key)
    if (expires !== undefined && expires <= this.now()) {
      this.delete(key)
      return false
    }
    return true
  }
}

export const WORKER_CACHE_TTL_MS = 10 * 60 * 1000
export const WORKER_CACHE_MAX_ENTRIES = 256

export function createWorkerCache<K, V>(
  maxEntries = WORKER_CACHE_MAX_ENTRIES,
  ttlMs = WORKER_CACHE_TTL_MS,
): BoundedCache<K, V> {
  return new BoundedCache<K, V>({ maxEntries, ttlMs })
}
