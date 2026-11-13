/** IndexedDB 세이브 저장소 (폰 앱용). 엔진 save.ts 의 Backend 모양(read/write/remove)을 맞춘다 */
const DB = 'samgukji';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((res, rej) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => res(req.result);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
      }),
  );
}

export function idbBackend() {
  return {
    read: async (name: string) => ((await run<unknown>('readonly', (s) => s.get(name))) as string | undefined) ?? null,
    write: async (name: string, text: string) => void (await run('readwrite', (s) => s.put(text, name))),
    remove: async (name: string) => void (await run('readwrite', (s) => s.delete(name))),
  };
}
