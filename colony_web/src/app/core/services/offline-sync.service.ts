import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { NetworkStatusService } from './network-status.service';
import { firstValueFrom } from 'rxjs';

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
  timestamp: number;
}

const DB_NAME = 'colony_offline_queue';
const STORE_NAME = 'requests';
const DB_VERSION = 1;

@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly http = inject(HttpClient);
  private readonly network = inject(NetworkStatusService);
  private db: IDBDatabase | null = null;

  constructor() {
    this._initDb();
    // When network comes back, auto flush
    this.network.isOnline$.subscribe(online => {
      if (online) {
        this.flushQueue();
      }
    });
  }

  private _initDb(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      req.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
  }

  async enqueue(request: Omit<QueuedRequest, 'id' | 'timestamp'>): Promise<void> {
    if (!this.db) await this._initDb();
    const entry: QueuedRequest = {
      ...request,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async _getAll(): Promise<QueuedRequest[]> {
    if (!this.db) await this._initDb();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as QueuedRequest[]);
      req.onerror = () => reject(req.error);
    });
  }

  private async _delete(id: string): Promise<void> {
    if (!this.db) await this._initDb();
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async flushQueue(): Promise<void> {
    const items = await this._getAll();
    for (const item of items) {
      try {
        await firstValueFrom(
          this.http.request(item.method, item.url, {
            body: item.body,
            headers: item.headers,
          })
        );
        await this._delete(item.id);
        console.log(`[OfflineSync] Sincronizado: ${item.id} → ${item.url}`);
      } catch (err) {
        console.warn(`[OfflineSync] Fallo al sincronizar ${item.id}. Se reintentará luego.`, err);
      }
    }
  }

  async pendingCount(): Promise<number> {
    const items = await this._getAll();
    return items.length;
  }
}
