import type { Amount } from './types.js'

const MICRO = 1_000_000n

/** Dollars to micro-USDC: `usdc(5)` = 5_000_000n, `usdc('2.5')` = 2_500_000n. */
export function usdc(dollars: number | string): bigint {
	const text = typeof dollars === 'number' ? dollars.toFixed(6) : dollars.trim()
	const match = /^(\d+)(?:\.(\d{0,6})\d*)?$/.exec(text)
	if (!match) throw new Error(`Not a USDC amount: ${dollars}`)
	return BigInt(match[1]!) * MICRO + BigInt((match[2] ?? '').padEnd(6, '0'))
}

/** Micro-USDC to a dollar string with 2 decimals (`5_000_000n` -> `'5.00'`). */
export function formatUsdc(micro: bigint | string): string {
	const value = BigInt(micro)
	const negative = value < 0n
	const abs = negative ? -value : value
	const cents = (abs + 5_000n) / 10_000n
	return `${negative ? '-' : ''}${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`
}

/** What the API expects for amounts: an integer of micro-USDC as a digit string. */
export function amountParam(value: Amount): string {
	const text = typeof value === 'bigint' ? value.toString() : typeof value === 'number' ? (Number.isInteger(value) && value >= 0 ? String(value) : '') : value
	if (!/^\d+$/.test(text)) throw new Error(`Amounts are integers of micro-USDC (use usdc(1.5) for dollars), got ${String(value)}`)
	return text
}
