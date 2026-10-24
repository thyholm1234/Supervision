// End-to-end encryption. All keys are derived and used in the browser only.
//
//   password --PBKDF2-SHA256(600k)--> master --HKDF--> authKey (sent to server, re-hashed there)
//                                               \--HKDF--> KEK (AES-GCM, never leaves the browser)
//   DEK: random AES-256-GCM key, stored on the server only wrapped by the KEK (and by a recovery-code KEK).
//   Items: AES-GCM(DEK, iv, JSON) with the item id as additional authenticated data.

export const ITERATIONS = 600_000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64e(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64d(str) {
  const s = atob(str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export const randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

/** Derive the auth key (for the server) and the key-encryption key (local only) from a secret. */
export async function deriveKeys(secret, saltB64, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const master = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: b64d(saltB64), iterations }, base, 256);
  const hk = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveBits", "deriveKey"]);
  const hkdf = (info) => ({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode(info) });
  const authBits = await crypto.subtle.deriveBits(hkdf("supervision/auth/v1"), hk, 256);
  const kek = await crypto.subtle.deriveKey(hkdf("supervision/kek/v1"), hk,
    { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
  return { authKey: b64e(authBits), kek };
}

export async function generateDek() {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function wrapDek(dek, kek) {
  const iv = randomBytes(12);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv, additionalData: enc.encode("dek") });
  return { wrapped_dek: b64e(wrapped), dek_iv: b64e(iv) };
}

/** Unwrap the DEK. Throws if the KEK is wrong (i.e. wrong password). */
export async function unwrapDek(wrappedB64, ivB64, kek, extractable = false) {
  return crypto.subtle.unwrapKey("raw", b64d(wrappedB64), kek,
    { name: "AES-GCM", iv: b64d(ivB64), additionalData: enc.encode("dek") },
    { name: "AES-GCM", length: 256 }, extractable, ["encrypt", "decrypt"]);
}

export async function encryptJSON(dek, id, obj) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(id) }, dek,
    enc.encode(JSON.stringify(obj)));
  return { iv: b64e(iv), ct: b64e(ct) };
}

export async function decryptJSON(dek, id, ivB64, ctB64) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(ivB64), additionalData: enc.encode(id) }, dek,
    b64d(ctB64));
  return JSON.parse(dec.decode(pt));
}

// Files: the plaintext is length-prefixed and zero-padded to a multiple of 64 KiB before encryption,
// so the server only learns a coarse size. Stored as iv || ciphertext, with the blob id as AAD.
const PAD = 64 * 1024;
export async function encryptBytes(dek, id, bytes) {
  const total = Math.ceil((bytes.length + 4) / PAD) * PAD;
  const padded = new Uint8Array(total);
  new DataView(padded.buffer).setUint32(0, bytes.length);
  padded.set(bytes, 4);
  const iv = randomBytes(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`blob:${id}`) }, dek, padded));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}

export async function decryptBytes(dek, id, data) {
  const pt = new Uint8Array(await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: data.subarray(0, 12), additionalData: enc.encode(`blob:${id}`) }, dek, data.subarray(12)));
  const len = new DataView(pt.buffer).getUint32(0);
  return pt.slice(4, 4 + len);
}

/** Key for an encrypted backup file, derived from a backup password chosen at export time. */
export async function deriveBackupKey(password, saltB64, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  const master = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64d(saltB64), iterations }, base, 256);
  const hk = await crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("supervision/backup/v1") },
    hk, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

// Recovery code: 25 symbols from an unambiguous base32 alphabet (~125 bits), shown in groups of 5.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function generateRecoveryCode() {
  const bytes = randomBytes(25);
  const chars = Array.from(bytes, (b) => ALPHABET[b & 31]).join("");
  return chars.match(/.{5}/g).join("-");
}
export function normalizeRecoveryCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function newId() {
  return b64e(randomBytes(16));
}

/** Password policy: at least 12 characters with lower case, upper case, digit and special character. */
export function passwordChecks(pw) {
  return [
    { ok: pw.length >= 12, label: "Mindst 12 tegn" },
    { ok: /\p{Ll}/u.test(pw), label: "Små bogstaver (a-z)" },
    { ok: /\p{Lu}/u.test(pw), label: "Store bogstaver (A-Z)" },
    { ok: /\d/.test(pw), label: "Tal (0-9)" },
    { ok: /[^\p{L}\d\s]/u.test(pw), label: "Specialtegn (fx ! ? # % & @)" },
  ];
}
export const passwordValid = (pw) => passwordChecks(pw).every((c) => c.ok);
