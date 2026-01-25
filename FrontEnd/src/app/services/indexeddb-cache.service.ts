import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

interface IndexedDBEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  ttl: number;
  size: number;
}

@Injectable({
  providedIn: 'root'
})
export class IndexedDBCacheService {
  private readonly DB_NAME = 'media-cache-db';
  private readonly DB_VERSION = 1;
  private readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
  private readonly STORE_NAMES = {
    THUMBNAILS: 'thumbnails',
    LARGE_DATA: 'large-data',
    MEDIA: 'media'
  };

  private db: IDBDatabase | null = null;
  private initialized: Promise<void>;
  private isBrowser: boolean;

  constructor(@Inject(PLATFORM_ID) private platformId: Object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
    this.initialized = this.initDatabase();
  }

  /**
   * Initialize IndexedDB database with object stores
   */
  private async initDatabase(): Promise<void> {
    if (!this.isBrowser || typeof indexedDB === 'undefined') {
      // console.warn('IndexedDB not supported in this environment');
      return;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB failed to open:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('[IndexedDB] Database initialized successfully');
        this.cleanupExpired(); // Cleanup on init
        resolve();
      };

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object stores if they don't exist
        if (!db.objectStoreNames.contains(this.STORE_NAMES.THUMBNAILS)) {
          const thumbnailStore = db.createObjectStore(this.STORE_NAMES.THUMBNAILS, { keyPath: 'key' });
          thumbnailStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(this.STORE_NAMES.LARGE_DATA)) {
          const largeDataStore = db.createObjectStore(this.STORE_NAMES.LARGE_DATA, { keyPath: 'key' });
          largeDataStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains(this.STORE_NAMES.MEDIA)) {
          const mediaStore = db.createObjectStore(this.STORE_NAMES.MEDIA, { keyPath: 'key' });
          mediaStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        console.log('[IndexedDB] Object stores created');
      };
    });
  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isBrowser) return; // Don't block or error on server
    await this.initialized;
    if (!this.db) {
      // Gracefully handle failure to init without throwing
      // console.warn('IndexedDB requested but not available'); 
    }
  }

  /**
   * Set a value in IndexedDB
   */
  async set<T>(storeName: string, key: string, data: T, ttl: number = this.DEFAULT_TTL): Promise<boolean> {
    if (!this.isBrowser) return false;
    try {
      await this.ensureInitialized();
      if (!this.db) return false;

      const entry: IndexedDBEntry<T> = {
        key,
        data,
        timestamp: Date.now(),
        ttl,
        size: this.estimateSize(data)
      };

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(entry);

        request.onsuccess = () => {
          console.log(`[IndexedDB] Stored key: ${key} in store: ${storeName}`);
          resolve(true);
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Failed to store key: ${key}`, request.error);
          resolve(false); // Resolve false instead of reject to prevent app crash
        };
      });
    } catch (error) {
      console.error('[IndexedDB] Set operation failed:', error);
      return false;
    }
  }

  /**
   * Get a value from IndexedDB
   */
  async get<T>(storeName: string, key: string): Promise<T | null> {
    if (!this.isBrowser) return null;
    try {
      await this.ensureInitialized();
      if (!this.db) return null;

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);

        request.onsuccess = () => {
          const entry: IndexedDBEntry<T> | undefined = request.result;

          if (!entry) {
            resolve(null);
            return;
          }

          // Check expiration
          if (this.isExpired(entry)) {
            console.log(`[IndexedDB] Key expired: ${key}`);
            this.delete(storeName, key); // Async cleanup
            resolve(null);
            return;
          }

          console.log(`[IndexedDB] Retrieved key: ${key} from store: ${storeName}`);
          resolve(entry.data);
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Failed to retrieve key: ${key}`, request.error);
          resolve(null); // Resolve null instead of reject
        };
      });
    } catch (error) {
      console.error('[IndexedDB] Get operation failed:', error);
      return null;
    }
  }

  /**
   * Check if a key exists and is not expired
   */
  async has(storeName: string, key: string): Promise<boolean> {
    const value = await this.get(storeName, key);
    return value !== null;
  }

  /**
   * Delete keys matching a pattern from a specific store
   */
  async deletePattern(storeName: string, pattern: string): Promise<void> {
    if (!this.isBrowser) return;
    try {
      await this.ensureInitialized();
      if (!this.db) return;
      
      const regex = new RegExp(pattern.replace('*', '.*'));

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.openCursor();

        const keysToDelete: string[] = [];

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

          if (cursor) {
            const key = cursor.key as string;
            
            // Check if key matches pattern (checking actual key, not unprefixing since IDB keys are literal)
            if (regex.test(key)) {
              keysToDelete.push(key);
            }

            cursor.continue();
          } else {
            // Delete matching keys
            if (keysToDelete.length > 0) {
              keysToDelete.forEach(k => store.delete(k));
              console.log(`[IndexedDB] Deleted ${keysToDelete.length} keys matching pattern '${pattern}' from ${storeName}`);
            }
            resolve();
          }
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Pattern delete failed for ${storeName}`, request.error);
          resolve(); // Resolve anyway
        };
      });
    } catch (error) {
      console.error('[IndexedDB] Delete pattern operation failed:', error);
    }
  }

  /**
   * Delete a specific key
   */
  async delete(storeName: string, key: string): Promise<boolean> {
    if (!this.isBrowser) return false;
    try {
      await this.ensureInitialized();
      if (!this.db) return false;

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);

        request.onsuccess = () => {
          console.log(`[IndexedDB] Deleted key: ${key} from store: ${storeName}`);
          resolve(true);
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Failed to delete key: ${key}`, request.error);
          resolve(false);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] Delete operation failed:', error);
      return false;
    }
  }

  /**
   * Clear all data from a specific store
   */
  async clear(storeName: string): Promise<boolean> {
    if (!this.isBrowser) return false;
    try {
      await this.ensureInitialized();
      if (!this.db) return false;

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.clear();

        request.onsuccess = () => {
          console.log(`[IndexedDB] Cleared store: ${storeName}`);
          resolve(true);
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Failed to clear store: ${storeName}`, request.error);
          resolve(false);
        };
      });
    } catch (error) {
      console.error('[IndexedDB] Clear operation failed:', error);
      return false;
    }
  }

  /**
   * Clear all stores
   */
  async clearAll(): Promise<boolean> {
    if (!this.isBrowser) return false;
    try {
      await this.ensureInitialized();
      if (!this.db) return false;

      const stores = [
        this.STORE_NAMES.THUMBNAILS,
        this.STORE_NAMES.LARGE_DATA,
        this.STORE_NAMES.MEDIA
      ];

      const promises = stores.map(store => this.clear(store));
      await Promise.all(promises);

      console.log('[IndexedDB] All stores cleared');
      return true;
    } catch (error) {
      console.error('[IndexedDB] Clear all operation failed:', error);
      return false;
    }
  }

  /**
   * Cleanup expired entries from all stores
   */
  async cleanupExpired(): Promise<void> {
    if (!this.isBrowser) return;
    try {
      await this.ensureInitialized();
      if (!this.db) return;

      const stores = [
        this.STORE_NAMES.THUMBNAILS,
        this.STORE_NAMES.LARGE_DATA,
        this.STORE_NAMES.MEDIA
      ];

      for (const storeName of stores) {
        await this.cleanupExpiredInStore(storeName);
      }

      console.log('[IndexedDB] Expired entries cleanup complete');
    } catch (error) {
      console.error('[IndexedDB] Cleanup failed:', error);
    }
  }

  /**
   * Cleanup expired entries in a specific store
   */
  private async cleanupExpiredInStore(storeName: string): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.openCursor();

      const keysToDelete: string[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

        if (cursor) {
          const entry: IndexedDBEntry<any> = cursor.value;

          if (this.isExpired(entry)) {
            keysToDelete.push(entry.key);
          }

          cursor.continue();
        } else {
          // Delete expired keys
          keysToDelete.forEach(key => {
            store.delete(key);
          });

          if (keysToDelete.length > 0) {
            console.log(`[IndexedDB] Removed ${keysToDelete.length} expired entries from ${storeName}`);
          }

          resolve();
        }
      };

      request.onerror = () => {
        console.error(`[IndexedDB] Cleanup cursor failed for ${storeName}`, request.error);
        resolve(); // Don't fail the whole chain
      };
    });
  }

  /**
   * Get statistics about a store
   */
  async getStoreStats(storeName: string): Promise<{ count: number; totalSize: number }> {
    if (!this.isBrowser) return { count: 0, totalSize: 0 };
    try {
      await this.ensureInitialized();
      if (!this.db) return { count: 0, totalSize: 0 };

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.openCursor();

        let count = 0;
        let totalSize = 0;

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

          if (cursor) {
            const entry: IndexedDBEntry<any> = cursor.value;
            
            if (!this.isExpired(entry)) {
              count++;
              totalSize += entry.size || 0;
            }

            cursor.continue();
          } else {
            resolve({ count, totalSize });
          }
        };

        request.onerror = () => {
          console.error(`[IndexedDB] Stats failed for ${storeName}`, request.error);
          resolve({ count: 0, totalSize: 0 });
        };
      });
    } catch (error) {
      console.error('[IndexedDB] Get stats failed:', error);
      return { count: 0, totalSize: 0 };
    }
  }

  /**
   * Get statistics for all stores
   */
  async getAllStats(): Promise<Record<string, { count: number; totalSize: number }>> {
    const stores = [
      this.STORE_NAMES.THUMBNAILS,
      this.STORE_NAMES.LARGE_DATA,
      this.STORE_NAMES.MEDIA
    ];

    const stats: Record<string, { count: number; totalSize: number }> = {};

    for (const storeName of stores) {
      stats[storeName] = await this.getStoreStats(storeName);
    }

    return stats;
  }

  /**
   * Check if an entry is expired
   */
  private isExpired(entry: IndexedDBEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Estimate size of data in bytes
   */
  private estimateSize(data: any): number {
    try {
      const jsonString = JSON.stringify(data);
      return new Blob([jsonString]).size;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Public store name getters
   */
  get THUMBNAILS_STORE(): string {
    return this.STORE_NAMES.THUMBNAILS;
  }

  get LARGE_DATA_STORE(): string {
    return this.STORE_NAMES.LARGE_DATA;
  }

  get MEDIA_STORE(): string {
    return this.STORE_NAMES.MEDIA;
  }
}
