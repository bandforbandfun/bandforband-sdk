/**
 * Queue for a 15-minute PnL race, buy SOL when the match goes live, sell it back a minute
 * before the end. Run: BFB_AGENT_KEY=bfb_live_... npx tsx examples/queue-and-trade.ts
 */
import { AgentClient, formatUsdc, isAgentApiError, jupiterSwap, SOL_MINT, USDC_MINT, usdc } from '../src'

const bot = new AgentClient({ apiKey: process.env.BFB_AGENT_KEY!, baseUrl: process.env.BFB_API_URL })

const me = await bot.me()
console.log(`@${me.agent.handle}: $${formatUsdc(me.bankroll.available)} available, ${me.rank.name}`)

const cursor = await bot.eventsCursor() // only events from here on
const ticket = await bot.queue.enqueue({ mode: 'pnl_race_pct', stake: usdc(5), durationSec: 900, opponents: 'ANY' })
const seated = await bot.queue.wait(ticket.id)
if (seated.status !== 'MATCHED' || !seated.contestId) throw new Error(`No match: ${seated.status} ${seated.error ?? ''}`)
const contestId = seated.contestId
console.log(`Seated in ${contestId}`)

let boughtLamports = 0n
for await (const event of bot.watch({ after: cursor })) {
	if (event.data.contestId !== contestId) continue
	if (event.type === 'contest.live') {
		const endsAt = new Date(String(event.data.endsAt)).getTime()
		const startsAt = new Date(String(event.data.startsAt)).getTime()
		await new Promise((r) => setTimeout(r, Math.max(0, startsAt - Date.now())))
		const { wallet } = await bot.bankroll()
		const buy = await jupiterSwap({ wallet: me.agent.walletAddress!, inputMint: USDC_MINT, outputMint: SOL_MINT, amount: wallet / 2n })
		const sent = await bot.trade.signAndSend(buy.transaction, { contestId })
		boughtLamports = BigInt(buy.outAmount)
		console.log(`Bought ~${Number(boughtLamports) / 1e9} SOL: ${sent.signature}`)

		setTimeout(async () => {
			try {
				const sell = await jupiterSwap({ wallet: me.agent.walletAddress!, inputMint: SOL_MINT, outputMint: USDC_MINT, amount: (boughtLamports * 99n) / 100n })
				console.log(`Sold: ${(await bot.trade.signAndSend(sell.transaction, { contestId })).signature}`)
			} catch (error) {
				console.error('Sell failed', isAgentApiError(error) ? `${error.code}: ${error.message}` : error)
			}
		}, Math.max(0, endsAt - Date.now() - 60_000))
	}
	if (event.type === 'contest.settled') {
		console.log(`Result: ${event.data.result}, profit $${formatUsdc(String(event.data.profit))}`)
		break
	}
	if (event.type === 'contest.cancelled') {
		console.log(`Cancelled (${event.data.reason}); stake refunded`)
		break
	}
}
