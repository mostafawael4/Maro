import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface StorageEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  size: number; // in bytes
}

@Injectable({
  providedIn: 'root'
})
export class StorageCacheService {
  private readonly DEFAULT_TTL = 60 * 60 * 1000; // 1 hour
  private readonly MAX_TOTAL_SIZE = 2 * 1024 * 1024; // 2MB
  private readonly SIZE_TRACKING_KEY = '__cache_size_tracker__';
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    if (this.isBrowser) {
      this.cleanupExpired();
    }
  }

  set<T>(key: string, data: T, ttl: number = this.DEFAULT_TTL): boolean {
    if (!this.isBrowser) return false;
    try {
      const entry: StorageEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
        size: 0 // will calculate below
      };

      const serialized = JSON.stringify(entry);
      entry.size = new Blob([serialized]).size;

      // Check size limit for this entry
      // Relaxed limit: allow a single entry to take up to the entire cache space if needed
      if (entry.size > this.MAX_TOTAL_SIZE) {
        console.warn(`[StorageCache] Entry too large: ${key} (${entry.size} bytes > ${this.MAX_TOTAL_SIZE} bytes)`);
        return false;
      }

      // Check total size
      const currentSize = this.getTotalSize();
      if (currentSize + entry.size > this.MAX_TOTAL_SIZE) {
        console.log(`[StorageCache] Cache full (${currentSize} bytes), attempting eviction for ${entry.size} bytes`);
        this.evictLRU(entry.size);
      }

      localStorage.setItem(this.prefixKey(key), serialized);
      this.updateSizeTracking(key, entry.size);
      console.log(`[StorageCache] Saved ${key} (${entry.size} bytes)`);
      return true;
    } catch (error) {
      console.error('[StorageCache] Error setting cache:', error);
      return false;
    }
  }

  get<T>(key: string): T | null {
    if (!this.isBrowser) return null;
    try {
      const item = localStorage.getItem(this.prefixKey(key));
      if (!item) {
        // console.log(`[StorageCache] Miss (not found): ${key}`);
        return null;
      }

      const entry: StorageEntry<T> = JSON.parse(item);
      
      // Check expiration
      if (this.isExpired(entry)) {
        console.log(`[StorageCache] Miss (expired): ${key}`);
        this.delete(key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.error('[StorageCache] Error reading cache:', error);
      return null;
    }
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    if (!this.isBrowser) return;
    const prefixedKey = this.prefixKey(key);
    const item = localStorage.getItem(prefixedKey);
    if (item) {
      try {
        const entry: StorageEntry<any> = JSON.parse(item);
        this.updateSizeTracking(key, -entry.size);
      } catch (e) {
        // ignore
      }
    }
    localStorage.removeItem(prefixedKey);
  }

  clear(): void {
    if (!this.isBrowser) return;
    const keys = this.getAllCacheKeys();
    keys.forEach(key => {
      localStorage.removeItem(key);
    });
    localStorage.removeItem(this.SIZE_TRACKING_KEY);
  }

  clearPattern(pattern: string): void {
    if (!this.isBrowser) return;
    const regex = new RegExp(pattern.replace('*', '.*'));
    const keys = this.getAllCacheKeys();
    keys.forEach(key => {
      const unprefixed = this.unprefixKey(key);
      if (regex.test(unprefixed)) {
        this.delete(unprefixed);
      }
    });
  }

  private prefixKey(key: string): string {
    return `cache:${key}`;
  }

  private unprefixKey(key: string): string {
    return key.replace(/^cache:/, '');
  }

  private getAllCacheKeys(): string[] {
    if (!this.isBrowser) return [];
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cache:') && key !== this.SIZE_TRACKING_KEY) {
        keys.push(key);
      }
    }
    return keys;
  }

  private isExpired(entry: StorageEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private cleanupExpired(): void {
    if (!this.isBrowser) return;
    const keys = this.getAllCacheKeys();
    keys.forEach(key => {
      try {
        const item = localStorage.getItem(key);
        if (item) {
          const entry: StorageEntry<any> = JSON.parse(item);
          if (this.isExpired(entry)) {
            this.delete(this.unprefixKey(key));
          }
        }
      } catch (e) {
        // Remove corrupted entries
        localStorage.removeItem(key);
      }
    });
  }

  private getTotalSize(): number {
    if (!this.isBrowser) return 0;
    try {
      const tracker = localStorage.getItem(this.SIZE_TRACKING_KEY);
      return tracker ? JSON.parse(tracker).totalSize : 0;
    } catch {
      return 0;
    }
  }

  private updateSizeTracking(key: string, sizeDelta: number): void {
    if (!this.isBrowser) return;
    try {
      const tracker = localStorage.getItem(this.SIZE_TRACKING_KEY);
      const data = tracker ? JSON.parse(tracker) : { totalSize: 0, entries: {} };
      
      if (sizeDelta > 0) {
        data.entries[key] = { size: sizeDelta, timestamp: Date.now() };
        data.totalSize += sizeDelta;
      } else {
        const oldSize = data.entries[key]?.size || 0;
        delete data.entries[key];
        data.totalSize -= oldSize;
      }

      localStorage.setItem(this.SIZE_TRACKING_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Error updating size tracking:', e);
    }
  }

  private evictLRU(neededSpace: number): void {
    if (!this.isBrowser) return;
    try {
      const tracker = localStorage.getItem(this.SIZE_TRACKING_KEY);
      if (!tracker) return;

      const data = JSON.parse(tracker);
      const entries = Object.entries(data.entries)
        .map(([key, value]: [string, any]) => ({ key, ...value }))
        .sort((a, b) => a.timestamp - b.timestamp); // Oldest first

      let freedSpace = 0;
      for (const entry of entries) {
        if (freedSpace >= neededSpace) break;
        this.delete(entry.key);
        freedSpace += entry.size;
      }
    } catch (e) {
      console.error('Error evicting LRU:', e);
    }
  }

  getStats(): { totalSize: number; entryCount: number; keys: string[] } {
    if (!this.isBrowser) {
        return { totalSize: 0, entryCount: 0, keys: [] };
    }
    return {
      totalSize: this.getTotalSize(),
      entryCount: this.getAllCacheKeys().length,
      keys: this.getAllCacheKeys().map(k => this.unprefixKey(k))
    };
  }
}
