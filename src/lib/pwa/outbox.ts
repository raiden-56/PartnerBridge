"use client";

/**
 * Tiny IndexedDB outbox for messages composed while offline. The service worker
 * drains it on the "pb-outbox" background-sync event. Cleared on logout.
 */
const DB = "pb-outbox";
const STORE = "messages";

export interface OutboxItem {
  clientId: string;
  conversationId: string;
  body: string;
  createdAt: number;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "clientId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function canBackgroundSync() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "SyncManager" in window && "indexedDB" in window;
}

export async function queueMessage(item: OutboxItem) {
  const db = await open();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const reg = await navigator.serviceWorker.ready;
  await (reg as ServiceWorkerRegistration & { sync: { register(tag: string): Promise<void> } }).sync.register("pb-outbox");
}
