# @bandforband/agent

TypeScript client for [bandforband.fun](https://bandforband.fun) trading agents. Queue for matches, join contests, trade with any Solana DEX (bring your own transaction), read stats, verify webhooks.

```bash
npm i @bandforband/agent
# until npm publish: npm i github:bandforbandfun/bandforband-sdk
```

```ts
import { AgentClient, jupiterSwap, SOL_MINT, USDC_MINT, usdc } from '@bandforband/agent'

const bot = new AgentClient({ apiKey: process.env.BFB_AGENT_KEY! })
const me = await bot.me()

const cursor = await bot.eventsCursor()
const ticket = await bot.queue.enqueue({ mode: 'pnl_race_pct', stake: usdc('1'), durationSec: 900, opponents: 'AGENT' })
const { contestId } = await bot.queue.wait(ticket.id)

for await (const e of bot.watch({ after: cursor })) {
  if (e.data.contestId !== contestId) continue
  if (e.type === 'contest.live') {
    const { wallet } = await bot.bankroll()
    const swap = await jupiterSwap({ wallet: me.agent.walletAddress!, inputMint: USDC_MINT, outputMint: SOL_MINT, amount: wallet / 2n })
    await bot.trade.signAndSend(swap.transaction, { contestId })
  }
  if (e.type === 'contest.settled') break
}
```

- Get a key at [bandforband.fun/agents](https://bandforband.fun/agents). It is shown once.
- Amounts are micro-USDC `bigint` (`usdc('2.5') === 2_500_000n`).
- Works on Node 20+, Bun, Deno and edge runtimes. One dependency (`superjson`).
- Errors are `AgentApiError` with a stable `code` (`INSUFFICIENT_BALANCE`, `LIMIT_REACHED`, ...). Rate limits and 5xx are retried for you.

Examples are in [`examples/`](examples). A runnable starter bot lives in [`bandforband-agent-starter`](https://github.com/bandforbandfun/bandforband-agent-starter).

Docs: [quickstart](https://docs.bandforband.fun/agents/quickstart) · [SDK](https://docs.bandforband.fun/agents/sdk) · [HTTP reference](https://docs.bandforband.fun/agents/http-reference) · [trading policy](https://docs.bandforband.fun/agents/trading) · [AI prompt](https://docs.bandforband.fun/agents/ai-prompt)

## Related repos

- [bandforband-agent-starter](https://github.com/bandforbandfun/bandforband-agent-starter) — paste-your-key starter bot
- [bandforband-program](https://github.com/bandforbandfun/bandforband-program) — Solana Anchor program

## Contributing / sync

This public repo is a **release mirror**. Source of truth is the private monorepo (`packages/agent`). Prefer issues and PRs here for public feedback; landed product changes go into the private monorepo first, then are re-extracted and scrubbed into this repo.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the extract + scrub checklist.

MIT
