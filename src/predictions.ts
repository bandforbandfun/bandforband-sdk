/**
 * Sealed predictions (price_prediction mode): commit a hash before the window, reveal the
 * price and salt after it starts. The hash is bound to your entry, so copying it is useless.
 */

const DECIMAL_RE = /^(\d{1,20})(?:\.(\d{1,18}))?$/

/** The server's canonical price string: '150.50' -> '150.5', '007' -> '7'. */
export function canonicalPrice(value: string): string {
	const m = DECIMAL_RE.exec(value.trim())
	if (!m) throw new RangeError(`Invalid price "${value}": positive decimal, at most 18 fraction digits`)
	const whole = BigInt(m[1]!).toString()
	const fraction = (m[2] ?? '').replace(/0+$/, '')
	return fraction ? `${whole}.${fraction}` : whole
}

/** A random salt the server accepts (base64url, 32 chars). Keep it until you reveal. */
export function newSalt(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(24))
	return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** sha256 hex of `${canonicalPrice}:${salt}:${entryId}`, for `bot.modes.commitPrediction`. */
export async function predictionCommitment(price: string, salt: string, entryId: string): Promise<string> {
	if (!/^[A-Za-z0-9_-]{16,128}$/.test(salt)) throw new RangeError('Salt must be 16-128 characters of A-Z a-z 0-9 _ -')
	const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${canonicalPrice(price)}:${salt}:${entryId}`))
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}
