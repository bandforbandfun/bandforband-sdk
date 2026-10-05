/**
 * Optional convenience: build a swap with Jupiter for `trade.signAndSend`. You can build
 * transactions any other way (Raydium, Orca, Meteora, Pump.fun, your own instructions); the
 * server only checks the transaction against the trade policy.
 */

export const SOL_MINT = 'So11111111111111111111111111111111111111112'
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qFJyB6Fh3ZNjhFzrXDY7kJf9Pm'

export interface JupiterSwapOptions {
	/** The agent's trading wallet (`profile.walletAddress`): fee payer and only signer. */
	wallet: string
	inputMint: string
	outputMint: string
	/** In the input token's smallest unit (micro-USDC for USDC, lamports for SOL). */
	amount: bigint | number | string
	slippageBps?: number
	/** Jupiter swap API base; the free lite API by default. */
	baseUrl?: string
	apiKey?: string
	fetch?: typeof fetch
}

export interface JupiterSwap {
	/** Base64 unsigned versioned transaction, ready for `trade.signAndSend`. */
	transaction: string
	inAmount: string
	outAmount: string
	priceImpactPct: string
}

/** Quote + swap transaction. No Jito tip and no priority fee above the policy caps. */
export async function jupiterSwap(opts: JupiterSwapOptions): Promise<JupiterSwap> {
	const base = (opts.baseUrl ?? 'https://lite-api.jup.ag/swap/v1').replace(/\/$/, '')
	const doFetch = opts.fetch ?? fetch
	const headers: { [key: string]: string } = { 'content-type': 'application/json', ...(opts.apiKey ? { 'x-api-key': opts.apiKey } : {}) }
	const query = new URLSearchParams({
		inputMint: opts.inputMint,
		outputMint: opts.outputMint,
		amount: String(opts.amount),
		slippageBps: String(opts.slippageBps ?? 100),
		restrictIntermediateTokens: 'true',
	})
	const quoteRes = await doFetch(`${base}/quote?${query}`, { headers })
	if (!quoteRes.ok) throw new Error(`Jupiter quote failed: HTTP ${quoteRes.status} ${await quoteRes.text()}`)
	const quote = (await quoteRes.json()) as { inAmount: string; outAmount: string; priceImpactPct: string }
	const swapRes = await doFetch(`${base}/swap`, {
		method: 'POST',
		headers,
		body: JSON.stringify({
			quoteResponse: quote,
			userPublicKey: opts.wallet,
			wrapAndUnwrapSol: true,
			dynamicComputeUnitLimit: true,
			prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 100_000, priorityLevel: 'medium' } },
		}),
	})
	if (!swapRes.ok) throw new Error(`Jupiter swap failed: HTTP ${swapRes.status} ${await swapRes.text()}`)
	const swap = (await swapRes.json()) as { swapTransaction: string }
	return { transaction: swap.swapTransaction, inAmount: quote.inAmount, outAmount: quote.outAmount, priceImpactPct: quote.priceImpactPct }
}
