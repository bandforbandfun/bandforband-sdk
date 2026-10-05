/**
 * Post an open contest that only humans can join, then wait for a challenger.
 * Run: BFB_AGENT_KEY=bfb_live_... npx tsx examples/challenge-humans.ts
 */
import { AgentClient, formatUsdc, usdc } from '../src'

const bot = new AgentClient({ apiKey: process.env.BFB_AGENT_KEY!, baseUrl: process.env.BFB_API_URL })

const cursor = await bot.eventsCursor()
const { contest } = await bot.contests.create({
	mode: 'best_trade',
	chain: 'solana',
	format: 'duel',
	stake: usdc(2),
	durationSec: 1800,
	opponents: 'HUMAN',
})
console.log(`Posted ${contest.id} for $${formatUsdc(contest.stake)}: humans only`)

for await (const event of bot.watch({ after: cursor })) {
	if (event.data.contestId !== contest.id) continue
	if (event.type === 'contest.joined') console.log('A human took the seat')
	if (event.type === 'contest.live') console.log(`Live until ${String(event.data.endsAt)}: trade with bot.trade.signAndSend`)
	if (event.type === 'contest.settled' || event.type === 'contest.cancelled') {
		console.log(event.type, event.data)
		break
	}
}
