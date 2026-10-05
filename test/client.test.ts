import { createHash, createHmac } from 'node:crypto'
import superjson from 'superjson'
import { describe, expect, it } from 'vitest'
import { AgentApiError, AgentClient, canonicalPrice, formatUsdc, newSalt, predictionCommitment, usdc, verifyWebhook } from '../src'

const KEY = `bfb_live_${'a'.repeat(40)}`

function fakeFetch(handler: (url: URL, init: RequestInit) => { status?: number; body: unknown }) {
	const calls: { url: URL; init: RequestInit }[] = []
	const impl = (async (input: string | URL | Request, init?: RequestInit) => {
		const url = new URL(String(input))
		calls.push({ url, init: init ?? {} })
		const { status = 200, body } = handler(url, init ?? {})
		return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
	}) as typeof fetch
	return { impl, calls }
}

const ok = (data: unknown) => ({ body: { result: { data: superjson.serialize(data) } } })

describe('AgentClient', () => {
	it('refuses a malformed key before any request', () => {
		expect(() => new AgentClient({ apiKey: 'sk_nope' })).toThrow(/bfb_live_/)
	})

	it('sends queries as GET with the superjson input and the agent key header', async () => {
		const f = fakeFetch(() => ok({ items: [], nextCursor: null }))
		const bot = new AgentClient({ apiKey: KEY, baseUrl: 'https://api.test/', fetch: f.impl })
		await bot.history({ versus: 'HUMAN', limit: 5 })
		const { url, init } = f.calls[0]!
		expect(url.origin + url.pathname).toBe('https://api.test/trpc/agent.history')
		expect(JSON.parse(url.searchParams.get('input')!)).toEqual({ json: { versus: 'HUMAN', limit: 5 } })
		expect(init.method).toBe('GET')
		expect((init.headers as Record<string, string>)['x-agent-key']).toBe(KEY)
	})

	it('posts mutations with amounts as micro-USDC strings and decodes bigints and dates', async () => {
		const f = fakeFetch(() => ok({ id: 't1', status: 'WAITING', stake: '5000000', expiresAt: new Date('2026-10-05T10:00:00Z') }))
		const bot = new AgentClient({ apiKey: KEY, baseUrl: 'https://api.test', fetch: f.impl })
		const ticket = await bot.queue.enqueue({ mode: 'pnl_race_pct', stake: usdc(5), durationSec: 900, opponents: 'AGENT' })
		expect(f.calls[0]!.init.method).toBe('POST')
		expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ json: { mode: 'pnl_race_pct', stake: '5000000', durationSec: 900, opponents: 'AGENT' } })
		expect(ticket.expiresAt).toBeInstanceOf(Date)
	})

	it('decodes bigint fields', async () => {
		const f = fakeFetch(() => ok({ available: 12_500_000n, wallet: 12_000_000n, vault: 500_000n, inPlay: 0n, gasLamports: null, walletAddress: 'W' }))
		const bot = new AgentClient({ apiKey: KEY, fetch: f.impl })
		expect((await bot.bankroll()).available).toBe(12_500_000n)
	})

	it('turns errors into AgentApiError with the app code and details', async () => {
		const f = fakeFetch(() => ({
			status: 400,
			body: { error: { json: { message: 'Not enough bankroll', code: -32600, data: { code: 'BAD_REQUEST', httpStatus: 400, appCode: 'INSUFFICIENT_BALANCE', details: { balance: '10' } } } } },
		}))
		const bot = new AgentClient({ apiKey: KEY, fetch: f.impl, retries: 0 })
		const error = await bot.contests.join('00000000-0000-0000-0000-000000000000').catch((e: unknown) => e)
		expect(error).toBeInstanceOf(AgentApiError)
		expect(error).toMatchObject({ code: 'INSUFFICIENT_BALANCE', httpStatus: 400, details: { balance: '10' }, path: 'agent.contests.join' })
	})

	it('retries rate limits after retryAfter, then succeeds', async () => {
		let n = 0
		const f = fakeFetch(() =>
			n++ === 0 ? { status: 429, body: { error: { json: { message: 'slow down', data: { httpStatus: 429, appCode: 'RATE_LIMITED', details: { retryAfter: 0 } } } } } } : ok({ ok: true }),
		)
		const bot = new AgentClient({ apiKey: KEY, fetch: f.impl, retries: 1 })
		await expect(bot.contests.ready('00000000-0000-0000-0000-000000000000')).resolves.toEqual({ ok: true })
		expect(f.calls).toHaveLength(2)
	})

	it('encodes raw transaction bytes as base64', async () => {
		const f = fakeFetch(() => ok({ signature: 's', status: 'confirmed', contestId: null, programs: [] }))
		const bot = new AgentClient({ apiKey: KEY, fetch: f.impl })
		await bot.trade.signAndSend(new Uint8Array([1, 2, 3]), { contestId: 'c' })
		expect(JSON.parse(String(f.calls[0]!.init.body))).toEqual({ json: { transaction: 'AQID', contestId: 'c' } })
	})

	it('watch() yields each polled event once and follows the cursor', async () => {
		const pages = [
			{ events: [{ id: '1', type: 'match.found', data: {}, createdAt: new Date() }], cursor: '1' },
			{ events: [{ id: '2', type: 'contest.live', data: {}, createdAt: new Date() }], cursor: '2' },
		]
		let i = 0
		const f = fakeFetch(() => ok(pages[Math.min(i++, 1)]))
		const bot = new AgentClient({ apiKey: KEY, fetch: f.impl })
		const controller = new AbortController()
		const got: string[] = []
		for await (const e of bot.watch({ after: null, intervalMs: 1, signal: controller.signal })) {
			got.push(e.id)
			if (got.length === 2) controller.abort()
		}
		expect(got).toEqual(['1', '2'])
		expect(JSON.parse(f.calls[1]!.url.searchParams.get('input')!).json.after).toBe('1')
	})

	it('watch() starts from the newest event unless given a cursor', async () => {
		const f = fakeFetch((url) => {
			const input = JSON.parse(url.searchParams.get('input')!).json
			return ok(input.latest ? { events: [], cursor: '9' } : { events: [{ id: '10', type: 'contest.live', data: {}, createdAt: new Date() }], cursor: '10' })
		})
		const bot = new AgentClient({ apiKey: KEY, fetch: f.impl })
		const controller = new AbortController()
		for await (const e of bot.watch({ intervalMs: 1, signal: controller.signal })) {
			expect(e.id).toBe('10')
			controller.abort()
		}
		expect(JSON.parse(f.calls[0]!.url.searchParams.get('input')!).json).toEqual({ latest: true })
		expect(JSON.parse(f.calls[1]!.url.searchParams.get('input')!).json.after).toBe('9')
	})
})

describe('units', () => {
	it('converts dollars and back', () => {
		expect(usdc(5)).toBe(5_000_000n)
		expect(usdc('2.5')).toBe(2_500_000n)
		expect(usdc(0.000001)).toBe(1n)
		expect(formatUsdc(1_234_567n)).toBe('1.23')
		expect(formatUsdc(-500_000n)).toBe('-0.50')
		expect(() => usdc('abc')).toThrow()
	})
})

describe('verifyWebhook', () => {
	const secret = 'whsec_test'
	const body = JSON.stringify({ id: 'e1', type: 'contest.settled', agentId: 'a', createdAt: '2026-10-05T00:00:00.000Z', data: { result: 'WIN' } })
	// Same construction as the server (packages/core/src/agents/events.ts signWebhook).
	const sign = (ts: number, b = body) => `sha256=${createHmac('sha256', secret).update(`${ts}.${b}`).digest('hex')}`

	it('accepts a fresh, correctly signed delivery', async () => {
		const ts = 1_000_000
		await expect(verifyWebhook({ secret, body, signature: sign(ts), timestamp: String(ts), nowSec: ts + 10 })).resolves.toMatchObject({ type: 'contest.settled' })
	})

	it('rejects a tampered body, a wrong secret and a stale timestamp', async () => {
		const ts = 1_000_000
		await expect(verifyWebhook({ secret, body: body.replace('WIN', 'LOSS'), signature: sign(ts), timestamp: ts, nowSec: ts })).resolves.toBeNull()
		await expect(verifyWebhook({ secret: 'other', body, signature: sign(ts), timestamp: ts, nowSec: ts })).resolves.toBeNull()
		await expect(verifyWebhook({ secret, body, signature: sign(ts), timestamp: ts, nowSec: ts + 301 })).resolves.toBeNull()
	})
})


describe('sealed predictions', () => {
	it('canonicalizes prices like the server', () => {
		expect(canonicalPrice('150.50')).toBe('150.5')
		expect(canonicalPrice('007')).toBe('7')
		expect(canonicalPrice('0.000100')).toBe('0.0001')
		expect(() => canonicalPrice('-1')).toThrow()
		expect(() => canonicalPrice('1e3')).toThrow()
	})

	it('hashes canonical price, salt and entry id', async () => {
		const salt = newSalt()
		expect(salt).toMatch(/^[A-Za-z0-9_-]{16,128}$/)
		const expected = createHash('sha256').update(`150.5:${salt}:entry-1`).digest('hex')
		await expect(predictionCommitment('150.50', salt, 'entry-1')).resolves.toBe(expected)
		await expect(predictionCommitment('1', 'short', 'entry-1')).rejects.toThrow()
	})
})
