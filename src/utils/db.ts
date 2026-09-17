/** IndexedDB: 操作日志 + 下载记录 */
const DB_NAME = 'labgreen'
const DB_VER = 1

let dbPromise: Promise<IDBDatabase> | null = null

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains('op_logs')) {
        const s = db.createObjectStore('op_logs', { keyPath: 'id', autoIncrement: true })
        s.createIndex('ts', 'ts')
        s.createIndex('module', 'module')
      }
      if (!db.objectStoreNames.contains('downloads')) {
        db.createObjectStore('downloads', { keyPath: 'id', autoIncrement: true })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

export interface OpLog { id?: number; ts: number; module: string; action: string; level: 'info' | 'warn' | 'error'; detail: string }

export async function addLog(module: string, action: string, level: OpLog['level'], detail = '') {
  try {
    const db = await openDb()
    const tx = db.transaction('op_logs', 'readwrite')
    tx.objectStore('op_logs').add({ ts: Date.now(), module, action, level, detail })
  } catch (e) { /* ignore */ }
}

export async function queryLogs(filter: { module?: string; level?: string; keyword?: string }): Promise<OpLog[]> {
  const db = await openDb()
  const rows: OpLog[] = await new Promise((resolve, reject) => {
    const req = db.transaction('op_logs', 'readonly').objectStore('op_logs').getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return rows
    .filter((r) => (!filter.module || r.module === filter.module) && (!filter.level || r.level === filter.level) && (!filter.keyword || (r.action + r.detail).toLowerCase().includes(filter.keyword.toLowerCase())))
    .sort((a, b) => b.ts - a.ts)
}

export async function pruneLogs(retainDays: number) {
  const db = await openDb()
  const cutoff = Date.now() - retainDays * 86400000
  const tx = db.transaction('op_logs', 'readwrite')
  const store = tx.objectStore('op_logs')
  const all: OpLog[] = await new Promise((res) => { const r = store.getAll(); r.onsuccess = () => res(r.result) })
  all.filter((r) => r.ts < cutoff).forEach((r) => store.delete(r.id))
}

export async function clearLogs() {
  const db = await openDb()
  db.transaction('op_logs', 'readwrite').objectStore('op_logs').clear()
}

export async function addDownload(name: string, url: string, size: number, status: string) {
  try {
    const db = await openDb()
    db.transaction('downloads', 'readwrite').objectStore('downloads').add({ ts: Date.now(), name, url, size, status })
  } catch (e) { /* ignore */ }
}
