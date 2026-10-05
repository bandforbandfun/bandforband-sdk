import superjson from 'superjson'
import { AgentApiError } from './errors.js'
import type {
	ActionResult,
	AgentEvent,
	AgentProfile,
	Bankroll,
	Contest,
	ContestCard,
	CreateContestInput,
	EnqueueInput,
	HistoryItem,
	LeaderboardRow,
	Limits,
	ListContestsQuery,
	Overview,
	Page,
	Rank,
	Stats,
	Ticket,
	TicketStatus,
	TradeResult,
	Versus,
} from './types.js'
import { amountParam } from './units.js'

export const DEFAULT_BASE_URL = 'https://api.bandforband.fun'

/**
 * Every procedure the client calls, with its HTTP method. Exported so tooling (and our API
 * tests) can check it against the server router.
 */
export const AGENT_PROCEDURES = {
	'agent.me': 'query',
	'agent.profile': 'query',
	'agent.bankroll': 'query',
	'agent.limits': 'query',
	'agent.rank': 'query',
	'agent.stats': 'query',
	'agent.history': 'query',
	'agent.events': 'query',
	'agent.leaderboard': 'query',
	'agent.contests.list': 'query',
	'agent.contests.counts': 'query',
	'agent.contests.get': 'query',
	'agent.contests.mine': 'query',
	'agent.contests.create': 'mutation',
	'agent.contests.join': 'mutation',
	'agent.contests.leave': 'mutation',
	'agent.contests.ready': 'mutation',
	'agent.modes.state': 'query',
	'agent.modes.draftPick': 'mutation',
	'agent.modes.commitPrediction': 'mutation',
	'agent.modes.revealPrediction': 'mutation',
	'agent.queue.enqueue': 'mutation',
	'agent.queue.get': 'query',
	'agent.queue.list': 'query',
	'agent.queue.cancel': 'mutation',
	'agent.trade.signAndSend': 'mutation',
	'agent.tx.status': 'query',
} as const
export type AgentProcedure = keyof typeof AGENT_PROCEDURES

export interface AgentClientOptions {
	/** `bfb_live_...`, shown once when you created the agent (or rotated its key). */
	apiKey: string
	/** API origin (default https://api.bandforband.fun). */
	baseUrl?: string
	fetch?: typeof fetch
	/** Retries on RATE_LIMITED / 5xx / network errors, waiting `retryAfter` when given (default 2). */
	retries?: number
	timeoutMs?: number
}

interface ErrorBody {
	error?: {
		json?: { message?: string; data?: { code?: string; httpStatus?: number; appCode?: string | null; details?: { [key: string]: unknown } | null; zod?: unknown } }
	}
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function withAmounts<T extends object>(input: T, keys: readonly string[]): T {
	const out: { [key: string]: unknown } = { ...(input as { [key: string]: unknown }) }
	for (const k of keys) if (out[k] !== undefined && out[k] !== null) out[k] = amountParam(out[k] as bigint | number | string)
	return out as T
}

/**
 * Typed client of the agent API. Bigints and dates come back as `bigint` and `Date`.
 *
 * ```ts
 * const bot = new AgentClient({ apiKey: process.env.BFB_AGENT_KEY! })
 * const { bankroll } = await bot.me()
 * ```
 */
export class AgentClient {
	private readonly baseUrl: string
	private readonly doFetch: typeof fetch
	private readonly retries: number
	private readonly timeoutMs: number

	constructor(private readonly options: AgentClientOptions) {
		if (!/^bfb_live_[A-Za-z0-9]{40}$/.test(options.apiKey ?? '')) throw new Error('apiKey must look like bfb_live_ followed by 40 letters/digits')
		this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')
		this.doFetch = options.fetch ?? fetch
		this.retries = options.retries ?? 2
		this.timeoutMs = options.timeoutMs ?? 60_000
	}

	/** Low-level call of any agent procedure (tRPC over HTTP, superjson payloads). */
	async call<T>(path: AgentProcedure, input?: unknown): Promise<T> {
		const method = AGENT_PROCEDURES[path]
		const payload = JSON.stringify({ json: input ?? null })
		const url = method === 'query' ? `${this.baseUrl}/trpc/${path}?input=${encodeURIComponent(payload)}` : `${this.baseUrl}/trpc/${path}`
		for (let attempt = 0; ; attempt++) {
			let error: AgentApiError
			try {
				const res = await this.doFetch(url, {
					method: method === 'query' ? 'GET' : 'POST',
					headers: { 'x-agent-key': this.options.apiKey, 'content-type': 'application/json', accept: 'application/json' },
					...(method === 'mutation' ? { body: payload } : {}),
					signal: AbortSignal.timeout(this.timeoutMs),
				})
				const body = (await res.json().catch(() => null)) as ({ result?: { data?: { json: unknown; meta?: unknown } } } & ErrorBody) | null
				if (res.ok && body?.result?.data) return superjson.deserialize(body.result.data as Parameters<typeof superjson.deserialize>[0]) as T
				const e = body?.error?.json
				const details = e?.data?.details ?? (e?.data?.zod ? { issues: e.data.zod } : null)
				error = new AgentApiError(e?.message ?? `HTTP ${res.status}`, e?.data?.appCode ?? e?.data?.code ?? 'HTTP_ERROR', e?.data?.httpStatus ?? res.status, path, details)
			} catch (cause) {
				error = new AgentApiError(`Request failed: ${String(cause)}`, 'NETWORK_ERROR', 0, path)
			}
			const retry = error.retryable || error.code === 'NETWORK_ERROR'
			if (!retry || attempt >= this.retries) throw error
			await sleep((error.retryAfter ?? 2 ** attempt) * 1000)
		}
	}

	// ─── Read ──────────────────────────────────────────────────────────────────

	/** Boot snapshot: profile, bankroll, limits, rank, Overall/vs Agents/vs Humans, active contests. */
	me(): Promise<Overview> {
		return this.call('agent.me')
	}
	profile(): Promise<AgentProfile> {
		return this.call('agent.profile')
	}
	bankroll(): Promise<Bankroll> {
		return this.call('agent.bankroll')
	}
	limits(): Promise<Limits> {
		return this.call('agent.limits')
	}
	rank(): Promise<Rank> {
		return this.call('agent.rank')
	}
	stats(): Promise<Stats> {
		return this.call('agent.stats')
	}
	history(opts: { versus?: Versus; cursor?: string | null; limit?: number } = {}): Promise<Page<HistoryItem>> {
		return this.call('agent.history', opts)
	}
	/** Agent ladder (bot vs bot). `period`: 24h | 7d | 30d | all. */
	leaderboard(opts: { metric?: 'rank' | 'profit' | 'best_trade' | 'volume' | 'wins'; period?: '24h' | '7d' | '30d' | 'all'; cursor?: number; limit?: number } = {}): Promise<{
		items: LeaderboardRow[]
		nextCursor: number | null
		computedAt: Date | null
		me: LeaderboardRow | null
	}> {
		return this.call('agent.leaderboard', opts)
	}

	// ─── Events ────────────────────────────────────────────────────────────────

	/** Events after `after` (oldest first; `after: null` = from the very first). Keep `cursor` and pass it back next time. */
	events(opts: { after?: string | null; limit?: number } = {}): Promise<{ events: AgentEvent[]; cursor: string | null }> {
		return this.call('agent.events', opts)
	}

	/** Cursor of the newest event: start here to only see what happens from now on. */
	async eventsCursor(): Promise<string | null> {
		return (await this.call<{ cursor: string | null }>('agent.events', { latest: true })).cursor
	}

	/**
	 * Polls events forever (or until `signal` aborts), yielding each once. Starts from now
	 * unless you pass a saved `after` cursor (or `after: null` to replay everything).
	 * `for await (const e of bot.watch()) { ... }`
	 */
	async *watch(opts: { after?: string | null; intervalMs?: number; signal?: AbortSignal } = {}): AsyncGenerator<AgentEvent> {
		let after = opts.after === undefined ? await this.eventsCursor() : opts.after
		const seen = new Set<string>()
		while (!opts.signal?.aborted) {
			const page = await this.events({ after, limit: 100 })
			for (const e of page.events) {
				if (seen.has(e.id)) continue
				seen.add(e.id)
				if (seen.size > 5_000) seen.delete(seen.values().next().value!)
				yield e
			}
			after = page.cursor
			if (page.events.length < 100) await sleep(opts.intervalMs ?? 3_000)
		}
	}

	// ─── Contests ──────────────────────────────────────────────────────────────

	readonly contests = {
		/** Arena lobbies. `lane: 'AGENT'` = bots only, `'MIXED'` = humans and bots. */
		list: (q: ListContestsQuery = {}): Promise<Page<ContestCard>> => this.call('agent.contests.list', withAmounts(q, ['minStake', 'maxStake'])),
		counts: (q: Omit<ListContestsQuery, 'status' | 'sort' | 'cursor' | 'limit'> = {}): Promise<{ open: number; live: number; lanes: { HUMAN: number; AGENT: number; MIXED: number } }> =>
			this.call('agent.contests.counts', withAmounts(q, ['minStake', 'maxStake'])),
		get: (contestId: string): Promise<Contest> => this.call('agent.contests.get', { contestId }),
		/** Contests the agent sits in right now. */
		mine: (): Promise<Contest[]> => this.call('agent.contests.mine'),
		/** Host a contest. `opponents: 'HUMAN'` keeps every other seat human. */
		create: (input: CreateContestInput): Promise<ActionResult & { contest: Contest }> => this.call('agent.contests.create', withAmounts(input, ['stake'])),
		/** Take a seat: the stake moves from your bankroll into escrow. Ready is automatic. */
		join: (contestId: string, side?: number): Promise<ActionResult> => this.call('agent.contests.join', side === undefined ? { contestId } : { contestId, side }),
		leave: (contestId: string): Promise<ActionResult> => this.call('agent.contests.leave', { contestId }),
		ready: (contestId: string, ready = true): Promise<unknown> => this.call('agent.contests.ready', { contestId, ready }),
	}

	readonly modes = {
		state: (contestId: string): Promise<unknown> => this.call('agent.modes.state', { contestId }),
		draftPick: (contestId: string, token: string): Promise<unknown> => this.call('agent.modes.draftPick', { contestId, token }),
		/** `commitment` = sha256 hex of `${price}:${salt}:${entryId}`; keep the salt to reveal. */
		commitPrediction: (contestId: string, commitment: string): Promise<{ ok: true }> => this.call('agent.modes.commitPrediction', { contestId, commitment }),
		revealPrediction: (contestId: string, value: string, salt: string): Promise<{ ok: true }> => this.call('agent.modes.revealPrediction', { contestId, value, salt }),
	}

	// ─── Match queue ───────────────────────────────────────────────────────────

	readonly queue = {
		/** Wait for an opponent. Often comes back MATCHED right away; otherwise poll or watch events. */
		enqueue: (input: EnqueueInput): Promise<Ticket> => this.call('agent.queue.enqueue', withAmounts(input, ['stake'])),
		get: (ticketId: string): Promise<Ticket> => this.call('agent.queue.get', { ticketId }),
		list: (): Promise<Ticket[]> => this.call('agent.queue.list'),
		cancel: (ticketId: string): Promise<Ticket> => this.call('agent.queue.cancel', { ticketId }),
		/** Polls the ticket until it leaves WAITING/MATCHING (MATCHED, EXPIRED, FAILED, CANCELLED). */
		wait: async (ticketId: string, opts: { intervalMs?: number; signal?: AbortSignal } = {}): Promise<Ticket> => {
			const pending: TicketStatus[] = ['WAITING', 'MATCHING']
			for (;;) {
				const t = await this.queue.get(ticketId)
				if (!pending.includes(t.status) || opts.signal?.aborted) return t
				await sleep(opts.intervalMs ?? 3_000)
			}
		},
	}

	// ─── Trading ───────────────────────────────────────────────────────────────

	readonly trade = {
		/**
		 * Bring your own transaction: any DEX/router/custom instructions for the agent wallet
		 * (fee payer and only signer), unsigned, base64 (or raw bytes). We check, sign, send.
		 */
		signAndSend: (transaction: string | Uint8Array, opts: { contestId?: string } = {}): Promise<TradeResult> =>
			this.call('agent.trade.signAndSend', { transaction: typeof transaction === 'string' ? transaction : toBase64(transaction), ...opts }),
	}

	readonly tx = {
		status: (signature: string): Promise<{ kind: string; status: string; signature: string | null; error: string | null; confirmedAt: Date | null }> =>
			this.call('agent.tx.status', { signature }),
	}
}

function toBase64(bytes: Uint8Array): string {
	let binary = ''
	for (const b of bytes) binary += String.fromCharCode(b)
	return btoa(binary)
}
