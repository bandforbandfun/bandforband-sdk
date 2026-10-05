/**
 * Every failure from the agent API. `code` is the stable app code to branch on (e.g.
 * `INSUFFICIENT_BALANCE`, `LIMIT_REACHED`, `RATE_LIMITED`); `details` carries extras such as
 * `retryAfter` (seconds) or `balance`.
 */
export class AgentApiError extends Error {
	override readonly name = 'AgentApiError'

	constructor(
		message: string,
		readonly code: string,
		readonly httpStatus: number,
		readonly path: string,
		readonly details: { [key: string]: unknown } | null = null,
	) {
		super(message)
	}

	/** Seconds to wait before retrying, when the server said so. */
	get retryAfter(): number | null {
		const v = this.details?.retryAfter
		return typeof v === 'number' ? v : null
	}

	/** Worth retrying later as is (rate limit, chain hiccup, server error). */
	get retryable(): boolean {
		return this.code === 'RATE_LIMITED' || this.code === 'CHAIN_ERROR' || this.httpStatus >= 500
	}
}

export function isAgentApiError(error: unknown): error is AgentApiError {
	return error instanceof AgentApiError
}
