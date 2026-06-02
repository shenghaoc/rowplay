/**
 * Seal/open a secret with authenticated symmetric encryption (AES-GCM), keyed by
 * `SESSION_SECRET`. Used to hold the athlete's Concept2 personal token inside an
 * httpOnly cookie instead of storing it server-side: the ciphertext lives only in
 * the browser, and only this server (holding `SESSION_SECRET`) can open it.
 *
 * AES-GCM gives confidentiality *and* integrity — a tampered or wrong-key blob
 * fails the auth tag and `openToken` returns `null` (the caller then treats the
 * request as unauthenticated and prompts a reconnect). No secret material, IV, or
 * plaintext is ever logged.
 */

const IV_BYTES = 12; // GCM standard nonce length

/** Derive a 256-bit AES-GCM key from the secret (SHA-256 of its UTF-8 bytes). */
async function deriveKey(secret: string): Promise<CryptoKey> {
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
	return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function toBase64Url(bytes: Uint8Array): string {
	let bin = '';
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
	const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

/** Encrypt `plaintext`, returning base64url(`iv || ciphertext`). */
export async function sealToken(secret: string, plaintext: string): Promise<string> {
	const key = await deriveKey(secret);
	const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
	const ct = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(plaintext)
	);
	const packed = new Uint8Array(iv.length + ct.byteLength);
	packed.set(iv, 0);
	packed.set(new Uint8Array(ct), iv.length);
	return toBase64Url(packed);
}

/**
 * Decrypt a blob produced by `sealToken`. Returns the plaintext, or `null` for
 * any malformed / tampered / wrong-key input — never throws, never logs.
 */
export async function openToken(secret: string, blob: string): Promise<string | null> {
	try {
		const packed = fromBase64Url(blob);
		if (packed.length <= IV_BYTES) return null;
		// Copy into fresh ArrayBuffer-backed views (subarray's ArrayBufferLike
		// generic isn't assignable to WebCrypto's BufferSource).
		const iv = new Uint8Array(packed.subarray(0, IV_BYTES));
		const ct = new Uint8Array(packed.subarray(IV_BYTES));
		const key = await deriveKey(secret);
		const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
		return new TextDecoder().decode(pt);
	} catch {
		return null;
	}
}
