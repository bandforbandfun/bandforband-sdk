import type { AgentEvent } from './types.js'

export const SIGNATURE_HEADER = 'x-bfb-signature'
export const TIMESTAMP_HEADER = 'x-bfb-timestamp'

export interface WebhookDelivery extends Omit<AgentEvent, 'createdAt'> {
	agentId: string
	createdAt: string
}

async function hmacHex(secret: string, message: string): Promise<string> {
	const enc = new TextEncoder()
	const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
	const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)))
	return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function equal(a: string, b: string): boolean {
	if (a.length !== b.length) return false
	let diff = 0
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
	return diff === 0
}

/**
 * Checks a webhook POST. Pass the raw body string (not re-serialized JSON) and the two headers.
 * Returns the parsed event, or null when the signature is wrong or older than 5 minutes.
 */
export async function verifyWebhook(opts: {
	secret: string
	body: string
	signature: string | null | undefined
	timestamp: string | number | null | undefined
	toleranceSec?: number
	nowSec?: number
}): Promise<WebhookDelivery | null> {
	const ts = Number(opts.timestamp)
	if (!opts.signature || !Number.isFinite(ts)) return null
	const now = opts.nowSec ?? Math.floor(Date.now() / 1000)
	if (Math.abs(now - ts) > (opts.toleranceSec ?? 300)) return null
	const expected = `sha256=${await hmacHex(opts.secret, `${ts}.${opts.body}`)}`
	if (!equal(expected, opts.signature)) return null
	return JSON.parse(opts.body) as WebhookDelivery
}
