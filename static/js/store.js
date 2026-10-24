// Decrypted, in-memory view of the user's data. Every write is encrypted before it leaves the browser.
import { api, apiBytes, ApiError } from "./api.js";
import { decryptBytes, decryptJSON, encryptBytes, encryptJSON, newId } from "./crypto.js";

export const KINDS = ["profile", "workplace", "supervisor", "course", "session", "konf", "therapy", "agreement", "agreementlog", "attachment"];
// Attachment metadata refers to encrypted files that are not part of a JSON backup.
export const BACKUP_KINDS = KINDS.filter((k) => k !== "attachment");

const state = {
  dek: null,
  items: new Map(), // id -> { id, version, data }
  listeners: new Set(),
  failed: 0,
};

export function setKey(dek) {
  state.dek = dek;
}

export function reset() {
  state.dek = null;
  state.items.clear();
  emit();
}

export const subscribe = (fn) => (state.listeners.add(fn), () => state.listeners.delete(fn));
const emit = () => state.listeners.forEach((fn) => fn());

export async function loadAll() {
  const rows = await api("GET", "/api/items");
  const items = new Map();
  let failed = 0;
  await Promise.all(rows.map(async (r) => {
    try {
      items.set(r.id, { id: r.id, version: r.version, data: await decryptJSON(state.dek, r.id, r.iv, r.ct) });
    } catch {
      failed++; // corrupted or foreign ciphertext – never silently overwrite it
    }
  }));
  state.items = items;
  state.failed = failed;
  emit();
  return { count: items.size, failed };
}

export function all(kind) {
  const out = [];
  for (const it of state.items.values()) if (it.data.kind === kind) out.push({ id: it.id, ...it.data });
  return out;
}

export const get = (id) => {
  const it = state.items.get(id);
  return it ? { id: it.id, ...it.data } : null;
};

export function profile() {
  return all("profile")[0] || { kind: "profile" };
}

export function snapshot() {
  const s = {};
  for (const k of KINDS) s[k] = all(k);
  s.profile = profile();
  return s;
}

/** Create or update. `obj.id` absent => create. Returns the stored object. */
export async function save(kind, obj) {
  const id = obj.id || newId();
  const existing = state.items.get(id);
  const { id: _drop, ...rest } = obj;
  const now = new Date().toISOString();
  const data = { ...rest, kind, createdAt: existing?.data.createdAt || rest.createdAt || now, updatedAt: now };
  const payload = await encryptJSON(state.dek, id, data);
  try {
    const res = await api("PUT", `/api/items/${id}`, { ...payload, version: existing?.version || 0 });
    state.items.set(id, { id, version: res.version, data });
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      await loadAll();
      throw new ApiError(409, "Data er ændret på en anden enhed. Siden er opdateret – prøv igen.");
    }
    throw e;
  }
  emit();
  return { id, ...data };
}

export async function remove(id) {
  await api("DELETE", `/api/items/${id}`);
  state.items.delete(id);
  emit();
}

/** Bulk import of plain objects (from a backup). Existing ids are left untouched. */
export async function importAll(objects, onProgress) {
  let n = 0;
  let added = 0;
  for (const o of objects) {
    if (!BACKUP_KINDS.includes(o.kind)) continue;
    if (o.kind === "profile" && all("profile").length) {
      await save("profile", { ...profile(), ...o, id: profile().id });
    } else if (!o.id || !state.items.has(o.id)) {
      await save(o.kind, o);
      added++;
    }
    onProgress?.(++n);
  }
  return added;
}

// ------------------------------------------------------------------ attachments (encrypted files)

export const attachments = (parentId) => all("attachment").filter((a) => a.parentId === parentId)
  .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

/** Encrypt and upload a File, then store its (encrypted) metadata as an item linked to `parentId`. */
export async function attach(parentId, file, meta = {}) {
  const blobId = newId();
  const bytes = new Uint8Array(await file.arrayBuffer());
  await apiBytes("PUT", `/api/blobs/${blobId}`, await encryptBytes(state.dek, blobId, bytes));
  try {
    return await save("attachment", { parentId, blobId, name: file.name, mime: file.type || "application/octet-stream", size: file.size, ...meta });
  } catch (e) {
    await api("DELETE", `/api/blobs/${blobId}`).catch(() => {});
    throw e;
  }
}

export async function openAttachment(att) {
  const data = await apiBytes("GET", `/api/blobs/${att.blobId}`);
  return new Blob([await decryptBytes(state.dek, att.blobId, data)], { type: att.mime });
}

export async function removeAttachment(att) {
  await api("DELETE", `/api/blobs/${att.blobId}`);
  await remove(att.id);
}

/** Download and decrypt the plaintext bytes of an attachment (null if the file is gone from the server). */
export async function attachmentBytes(att) {
  try {
    return await decryptBytes(state.dek, att.blobId, await apiBytes("GET", `/api/blobs/${att.blobId}`));
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Restore an attachment from a backup: re-encrypt the file with this account's key, then save its metadata. */
export async function importAttachment(att, bytes) {
  if (state.items.has(att.id)) return false;
  try {
    await apiBytes("PUT", `/api/blobs/${att.blobId}`, await encryptBytes(state.dek, att.blobId, bytes));
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 409)) throw e; // 409: the file is already on the server
  }
  await save("attachment", att);
  return true;
}

export const failedCount = () => state.failed;
