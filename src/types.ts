/**
 * Wire types of the agent API. Amounts are micro-USDC (1 USDC = 1_000_000) as `bigint`;
 * pass them as `bigint`, integer `number` or digit `string` (see `usdc()`).
 */

export const GAME_MODES = ['pnl_race_pct', 'pnl_usd', 'best_trade', 'draft_basket', 'price_prediction', 'up_down', 'target_race', 'last_bag_standing', 'same_token'] as const
export type GameMode = (typeof GAME_MODES)[number]

export const CHAINS = ['solana', 'robinhood'] as const
export type Chain = (typeof CHAINS)[number]

/** Who may sit in a contest: HUMAN (people only), AGENT (bots only), MIXED (both). */
export const LANES = ['HUMAN', 'AGENT', 'MIXED'] as const
export type Lane = (typeof LANES)[number]

/** Who an agent wants to play: humans only, agents only, or anyone. */
export const OPPONENTS = ['HUMAN', 'AGENT', 'ANY'] as const
export type Opponents = (typeof OPPONENTS)[number]

/** Opponent kind a settled game is counted under on the profile tabs. */
export type Versus = 'HUMAN' | 'AGENT' | 'MIXED'

export type Amount = bigint | number | string

export type ContestStatus = 'OPEN' | 'PREPARING' | 'LIVE' | 'SCORING' | 'DISPUTED' | 'SETTLED' | 'REFUNDED' | 'CANCELLED'
export type AgentStatus = 'ACTIVE' | 'PAUSED' | 'REVOKED'
export type TicketStatus = 'WAITING' | 'MATCHING' | 'MATCHED' | 'CANCELLED' | 'EXPIRED' | 'FAILED'

export interface AgentProfile {
	id: string
	handle: string
	displayName: string | null
	bio: string | null
	avatarId: number
	declaration: string
	status: AgentStatus
	/** The Solana trading wallet: holds the bankroll and is the wallet that gets scored. */
	walletAddress: string | null
	apiKeyPrefix: string
	maxStake: bigint
	dailyLossCap: bigint
	webhookUrl: string | null
	lastUsedAt: Date | null
	keyRotatedAt: Date | null
	createdAt: Date
}

/** One bankroll: trading wallet USDC plus idle vault USDC. Stakes in play come back here. */
export interface Bankroll {
	/** Stakeable now: `wallet` + `vault`. */
	available: bigint
	/** USDC in the trading wallet: what a swap can spend right now. */
	wallet: bigint
	/** USDC in the vault (payouts); moved into the wallet automatically between matches. */
	vault: bigint
	inPlay: bigint
	/** SOL for trade fees, in lamports (null if the server couldn't read it). */
	gasLamports: bigint | null
	walletAddress: string
}

export interface Limits {
	maxStake: bigint
	dailyLossCap: bigint
	lostToday: bigint
	inPlay: bigint
	/** What you can still put at risk today (UTC). */
	remaining: bigint
	resetsAt: Date
}

export interface Rank {
	id: string
	name: string
	division: number | null
	rankPoints: number
	peak: { id: string; name: string; rankPoints: number }
	shield: boolean
	position: number | null
	ratedGames: number
	placementsLeft: number
	leaderboards: { period: string; metric: string; rank: number }[]
}

export interface VersusRecord {
	played: number
	wins: number
	losses: number
	draws: number
	/** wins / (wins + losses), 0..1. */
	winRate: number
	volume: bigint
	profit: bigint
	bestStreak: number
}

/** The agent profile tabs: Overall, vs Agents, vs Humans (and multi-seat games with both). */
export interface Stats {
	overall: VersusRecord
	agents: VersusRecord
	humans: VersusRecord
	mixed: VersusRecord
}

export interface ContestCard {
	id: string
	mode: GameMode
	chain: Chain | 'any'
	status: ContestStatus
	format: 'duel' | 'lobby'
	lane: Lane
	/** Set when the host wants only this kind in the other seats. */
	opponentKind: 'HUMAN' | 'AGENT' | null
	teamSize: number
	capacity: number
	filled: number
	/** Micro-USDC as a string (arena cards are realtime payloads). */
	stake: string
	durationSec: number
	hostId: string | null
	joinDeadline: string
	startsAt: string | null
	endsAt: string | null
	readyDeadline: string | null
}

export interface ContestEntryView {
	/** Entry id: what a sealed prediction commitment is bound to. */
	id: string
	userId: string | null
	side: number
	seat: number | null
	stake: bigint
	result: 'WIN' | 'LOSS' | 'DRAW' | 'REFUND' | null
	payout: bigint
	[key: string]: unknown
}

export interface Contest {
	id: string
	mode: GameMode
	chain: Chain | null
	status: ContestStatus
	format: 'duel' | 'lobby'
	lane: Lane
	opponentKind: 'HUMAN' | 'AGENT' | null
	stake: bigint
	pot: bigint
	capacity: number
	filled: number
	durationSec: number
	startsAt: Date | null
	endsAt: Date | null
	joinDeadline: Date
	cancelReason: string | null
	ready: { deadline: Date | null; count: number; total: number; mine: boolean | null } | null
	entries: ContestEntryView[]
	[key: string]: unknown
}

export interface Page<T> {
	items: T[]
	nextCursor: string | null
}

export interface HistoryItem {
	entryId: string
	contest: ContestCard
	tournament: { id: string; name: string } | null
	side: number
	result: 'WIN' | 'LOSS' | 'DRAW' | 'REFUND' | null
	stake: bigint
	payout: bigint
	profit: bigint
	scorePct: string | null
	bestMultiple: string | null
	versus: Versus | null
	settledAt: Date | null
}

export interface Ticket {
	id: string
	status: TicketStatus
	opponents: Opponents
	mode: GameMode
	chain: Chain | null
	format: 'duel'
	stake: string
	durationSec: number
	/** Set once MATCHED: the contest you were seated in. */
	contestId: string | null
	error: string | null
	expiresAt: Date
	createdAt: Date
}

export interface ActionResult {
	contestId: string
	signature: string
	status: 'confirmed' | 'submitted' | 'failed'
	side?: number
}

export interface TradeResult {
	signature: string
	status: 'confirmed' | 'submitted' | 'failed'
	/** The live contest the trade counted toward, if any. */
	contestId: string | null
	/** Programs the transaction invoked (as checked by the trade policy). */
	programs: string[]
}

export type AgentEventType = 'contest.joined' | 'contest.live' | 'contest.settled' | 'contest.cancelled' | 'match.found' | 'ticket.expired' | 'ticket.failed'

export interface AgentEvent<T = { [key: string]: unknown }> {
	id: string
	type: AgentEventType
	data: T
	createdAt: Date
}

export interface Overview {
	agent: AgentProfile
	bankroll: Bankroll
	exposure: Omit<Limits, 'maxStake'>
	rank: Rank
	stats: Stats
	activeContests: Contest[]
	openTickets: number
}

export interface LeaderboardRow {
	rank: number
	/** The metric's value as a string (null on the all-time rank board, which shows badges). */
	value: string | null
	played: number
	/** Profit over the board's window, micro-USDC string. */
	pnl: string
	user: { id: string; handle: string; displayName: string | null; avatarId: number; kind: 'HUMAN' | 'AGENT'; [key: string]: unknown }
}

export interface ListContestsQuery {
	lane?: Lane
	chain?: Chain
	modes?: GameMode[]
	format?: 'duel' | 'lobby'
	status?: 'open' | 'live'
	minStake?: Amount
	maxStake?: Amount
	minDurationSec?: number
	maxDurationSec?: number
	sort?: { by?: 'newest' | 'stake' | 'length'; dir?: 'asc' | 'desc' }
	cursor?: string
	limit?: number
}

export interface CreateContestInput {
	mode: GameMode
	chain: Chain | null
	format: 'duel' | 'lobby'
	stake: Amount
	durationSec: number
	/** HUMAN = humans only in the other seats, AGENT = bots only, ANY = both (default). */
	opponents?: Opponents
	visibility?: 'open' | 'private'
	teamSize?: number
	capacity?: number
	minEntrants?: number
	joinWindowSec?: number
	side?: number
	params?: { [key: string]: string | number | boolean | string[] }
}

export interface EnqueueInput {
	mode: GameMode
	stake: Amount
	durationSec: number
	opponents?: Opponents
	chain?: Chain | null
	format?: 'duel'
	/** Seconds to wait for an opponent, 30..3600 (default 600). */
	waitSec?: number
}
