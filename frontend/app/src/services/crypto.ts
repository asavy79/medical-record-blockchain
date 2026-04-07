/**
 * Client-side encryption utilities for medical record protection.
 *
 * - AES-256-GCM for symmetric file encryption (Web Crypto API)
 * - ECIES encrypt/decrypt using ephemeral ECDH + AES-GCM
 * - ECDH shared-secret derivation for doctor key sharing
 *
 * All keys/ciphertext are represented as hex strings for JSON transport.
 */

import { getPublicKey, getSharedSecret } from '@noble/secp256k1';
// @ts-ignore — @noble/hashes v2 exports use .js suffix in package.json exports map
import { hkdf } from '@noble/hashes/hkdf.js';
// @ts-ignore
import { sha256 } from '@noble/hashes/sha2.js';

// ── Hex helpers ──────────────────────────────────────────────────────────────

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

// ── AES-256-GCM (Web Crypto) ────────────────────────────────────────────────

export function generateMasterKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', raw.buffer as ArrayBuffer, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** AES-GCM encrypt. Returns `iv (12 bytes) || ciphertext`. */
export async function aesGcmEncrypt(key: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ck = await importAesKey(key);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, ck, plaintext.buffer as ArrayBuffer));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return out;
}

/** AES-GCM decrypt. Expects `iv (12 bytes) || ciphertext`. */
export async function aesGcmDecrypt(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  const ck = await importAesKey(key);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv.buffer as ArrayBuffer }, ck, ct.buffer as ArrayBuffer));
}

// ── ECDH shared secret ──────────────────────────────────────────────────────

/**
 * Derive an AES-256 key from ECDH between `myPrivateKey` and `theirPublicKey`.
 * Uses HKDF-SHA256 for key derivation.
 */
export function ecdhDeriveKey(myPrivateKey: Uint8Array, theirPublicKey: Uint8Array): Uint8Array {
  const rawShared = getSharedSecret(myPrivateKey, theirPublicKey, true); // compressed point
  // HKDF extract+expand → 32-byte AES key
  const info = new TextEncoder().encode('medvault-ecdh');
  return hkdf(sha256, rawShared, /*salt*/ undefined, info, 32);
}

// ── ECIES encrypt / decrypt ─────────────────────────────────────────────────
//
// Format: ephemeralPubKey (33 bytes compressed) || iv (12) || ciphertext
//

export async function eciesEncrypt(recipientPubKey: Uint8Array, plaintext: Uint8Array): Promise<Uint8Array> {
  // Generate ephemeral key pair
  const ephPriv = crypto.getRandomValues(new Uint8Array(32));
  const ephPub = getPublicKey(ephPriv, true); // 33 bytes compressed

  const aesKey = ecdhDeriveKey(ephPriv, recipientPubKey);
  const encrypted = await aesGcmEncrypt(aesKey, plaintext);

  // ephPub (33) || encrypted (12 iv + ciphertext)
  const out = new Uint8Array(ephPub.length + encrypted.length);
  out.set(ephPub);
  out.set(encrypted, ephPub.length);
  return out;
}

export async function eciesDecrypt(myPrivateKey: Uint8Array, blob: Uint8Array): Promise<Uint8Array> {
  const ephPub = blob.slice(0, 33); // compressed public key
  const encrypted = blob.slice(33);

  const aesKey = ecdhDeriveKey(myPrivateKey, ephPub);
  return aesGcmDecrypt(aesKey, encrypted);
}

// ── UUID ↔ uint256 ──────────────────────────────────────────────────────────

export function uuidToUint256(uuid: string): bigint {
  return BigInt('0x' + uuid.replace(/-/g, ''));
}

export function uint256ToUuid(n: bigint): string {
  const hex = n.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ── Public key derivation ───────────────────────────────────────────────────

/**
 * Derive the uncompressed secp256k1 public key (65 bytes, hex) from a private key.
 * This is the format stored on the backend for ECDH.
 */
export function derivePublicKey(privateKeyHex: string): string {
  const privBytes = hexToBytes(privateKeyHex);
  const pub = getPublicKey(privBytes, false); // false = uncompressed (65 bytes)
  return bytesToHex(pub);
}
