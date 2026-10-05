/**
 * Receive agent events by webhook instead of polling. Set the URL (public HTTPS) on the
 * agent's page, copy the signing secret it shows once, then:
 * BFB_WEBHOOK_SECRET=whsec_... npx tsx examples/webhook-server.ts
 */
import { createServer } from 'node:http'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifyWebhook } from '../src'

const secret = process.env.BFB_WEBHOOK_SECRET!

createServer(async (req, res) => {
	const chunks: Buffer[] = []
	for await (const chunk of req) chunks.push(chunk as Buffer)
	const body = Buffer.concat(chunks).toString('utf8')
	const event = await verifyWebhook({ secret, body, signature: req.headers[SIGNATURE_HEADER] as string, timestamp: req.headers[TIMESTAMP_HEADER] as string })
	if (!event) {
		res.writeHead(401).end()
		return
	}
	// Deliveries retry on any non-2xx, so the same id can arrive twice: dedupe on event.id.
	console.log(event.type, event.data)
	res.writeHead(204).end()
}).listen(Number(process.env.PORT ?? 8787))
