// Keeps the (non-extractable) DEK in IndexedDB so a page reload does not require the password again.
// The key object cannot be exported by script; it is deleted on logout and on auto-lock.

const DB = "supervision-keys";

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("kv", mode);
    const req = fn(tx.objectStore("kv"));
    tx.oncomplete = () => { db.close(); resolve(req?.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function saveKey(username, key) {
  try { await run("readwrite", (s) => s.put({ username, key, at: Date.now() }, "dek")); } catch { /* private mode */ }
}

export async function loadKey(username) {
  try {
    const v = await run("readonly", (s) => s.get("dek"));
    return v && v.username === username ? v.key : null;
  } catch {
    return null;
  }
}

export async function clearKey() {
  try { await run("readwrite", (s) => s.delete("dek")); } catch { /* ignore */ }
}
