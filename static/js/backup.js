// Password-protected backup: a standard ZIP whose payload is encrypted in the browser.
//
//   LAES-MIG.txt         plain explanation (no personal data)
//   backup.json          format + KDF parameters (salt, iterations) – not secret
//   data.bin             AES-256-GCM(all items as JSON)
//   files/<blobId>.bin   AES-256-GCM(attachment file), padded like on the server
//
// The key is PBKDF2-SHA256(600k) + HKDF from a backup password, independent of the account key,
// so the file can be restored into any account (also a new one after a lost password).
import { b64e, decryptBytes, deriveBackupKey, encryptBytes, ITERATIONS, randomBytes } from "./crypto.js";
import * as store from "./store.js";
import { makeZip, readZip } from "./zip.js";

export const FORMAT = "supervisionsregnskab-backup/v2";
const enc = new TextEncoder();
const dec = new TextDecoder();

const README = `Supervisionsregnskab – krypteret backup
=======================================

Denne fil er en krypteret backup fra Supervisionsregnskab. Indholdet (registreringer og
uploadede dokumenter) er krypteret med AES-256-GCM og kan kun læses med den adgangskode,
der blev valgt, da backuppen blev lavet.

Gendan backuppen i appen under Profil -> "Importér backup". Den kan gendannes på samme
eller en anden konto.

Mister du backup-adgangskoden, kan backuppen ikke åbnes af nogen.
`;

/** Build the encrypted backup. Returns { blob, items, files, missing }. */
export async function createBackup(password, onProgress = () => {}) {
  const salt = b64e(randomBytes(16));
  const key = await deriveBackupKey(password, salt, ITERATIONS);
  const items = store.BACKUP_KINDS.flatMap((k) => store.all(k));
  const entries = [];
  const atts = store.all("attachment");
  let missing = 0;
  for (const [i, att] of atts.entries()) {
    onProgress(`Krypterer dokument ${i + 1} af ${atts.length}…`);
    const bytes = await store.attachmentBytes(att);
    if (!bytes) { missing++; continue; }
    entries.push({ name: `files/${att.blobId}.bin`, data: await encryptBytes(key, `file:${att.blobId}`, bytes) });
    items.push(att);
  }
  onProgress("Pakker backup…");
  const payload = enc.encode(JSON.stringify({ format: FORMAT, exported: new Date().toISOString(), items }));
  const manifest = { format: FORMAT, kdf: { name: "PBKDF2-SHA256+HKDF", iterations: ITERATIONS, salt }, cipher: "AES-256-GCM" };
  const blob = makeZip([
    { name: "LAES-MIG.txt", data: enc.encode(README) },
    { name: "backup.json", data: enc.encode(JSON.stringify(manifest, null, 2)) },
    { name: "data.bin", data: await encryptBytes(key, "data", payload) },
    ...entries,
  ]);
  return { blob, items: items.length - (atts.length - missing), files: atts.length - missing, missing };
}

/** Parse a backup ZIP without the password (validates structure). */
export async function readBackup(file) {
  const zip = readZip(await file.arrayBuffer());
  let manifest;
  try { manifest = JSON.parse(dec.decode(zip.get("backup.json"))); } catch { manifest = null; }
  if (manifest?.format !== FORMAT || !zip.has("data.bin")) throw new Error("Filen er ikke en backup fra Supervisionsregnskab.");
  const { iterations, salt } = manifest.kdf || {};
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 10_000_000 || typeof salt !== "string") {
    throw new Error("Backuppens krypteringsparametre er ugyldige.");
  }
  return { zip, manifest };
}

/** Decrypt the item list. Throws a friendly error on a wrong password. */
export async function unlockBackup({ zip, manifest }, password) {
  const key = await deriveBackupKey(password, manifest.kdf.salt, manifest.kdf.iterations);
  let data;
  try {
    data = JSON.parse(dec.decode(await decryptBytes(key, "data", zip.get("data.bin"))));
  } catch {
    throw new Error("Forkert adgangskode – eller filen er beskadiget.");
  }
  if (data.format !== FORMAT || !Array.isArray(data.items)) throw new Error("Backuppen har et ukendt format.");
  return { key, data };
}

/** Restore into the current account. Existing ids are skipped. Returns counts of what was added. */
export async function restoreBackup({ zip }, { key, data }, onProgress = () => {}) {
  const plain = data.items.filter((o) => o && typeof o === "object" && o.kind !== "attachment");
  const atts = data.items.filter((o) => o?.kind === "attachment" && typeof o.blobId === "string" && typeof o.id === "string");
  const items = await store.importAll(plain, (n) => onProgress(`Gendanner poster ${n} af ${plain.length}…`));
  let files = 0;
  const failed = [];
  for (const [i, att] of atts.entries()) {
    onProgress(`Gendanner dokument ${i + 1} af ${atts.length}…`);
    const enc = zip.get(`files/${att.blobId}.bin`);
    try {
      if (!enc) throw new Error("mangler i backuppen");
      if (await store.importAttachment(att, await decryptBytes(key, `file:${att.blobId}`, enc))) files++;
    } catch (e) {
      failed.push(`${att.name}: ${e.message}`);
    }
  }
  return { items, files, failed };
}
