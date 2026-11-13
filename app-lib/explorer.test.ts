import { Networks, StrKey, xdr } from "@stellar/stellar-sdk"
import { describe, expect, it } from "vitest"
import { addressUrl, lastGrantTransaction, transactionUrl } from "./explorer"

const hash = "5960d9520ec2079ee5d9dbc08ea772e3c051866fa25761f465fdebc9aa8938d4"
const contract = StrKey.encodeContract(Buffer.alloc(32, 1))
const account = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2))

describe("transactionUrl", () => {
	it("links the transaction on the configured network", () => {
		expect(transactionUrl(hash, Networks.TESTNET)).toBe(
			`https://stellar.expert/explorer/testnet/tx/${hash}`,
		)
		expect(transactionUrl(hash, Networks.PUBLIC)).toBe(
			`https://stellar.expert/explorer/public/tx/${hash}`,
		)
		expect(transactionUrl(hash, Networks.FUTURENET)).toBe(
			`https://stellar.expert/explorer/futurenet/tx/${hash}`,
		)
		expect(transactionUrl(hash.toUpperCase(), Networks.TESTNET)).toBe(
			`https://stellar.expert/explorer/testnet/tx/${hash}`,
		)
	})

	it("gives no link where stellar.expert can't show one", () => {
		expect(transactionUrl(hash, Networks.STANDALONE)).toBeUndefined()
		expect(transactionUrl(hash, "My custom network")).toBeUndefined()
		expect(transactionUrl("not-a-hash", Networks.TESTNET)).toBeUndefined()
		expect(transactionUrl(hash.slice(1), Networks.TESTNET)).toBeUndefined()
	})
})

describe("addressUrl", () => {
	it("links a contract or smart account under /contract/", () => {
		expect(addressUrl(contract, Networks.TESTNET)).toBe(
			`https://stellar.expert/explorer/testnet/contract/${contract}`,
		)
		expect(addressUrl(contract, Networks.PUBLIC)).toBe(
			`https://stellar.expert/explorer/public/contract/${contract}`,
		)
	})

	it("links a classic account under /account/", () => {
		expect(addressUrl(account, Networks.TESTNET)).toBe(
			`https://stellar.expert/explorer/testnet/account/${account}`,
		)
	})

	it("gives no link for a local network or something that isn't an address", () => {
		expect(addressUrl(account, Networks.STANDALONE)).toBeUndefined()
		expect(addressUrl("GNOTANADDRESS", Networks.TESTNET)).toBeUndefined()
		expect(addressUrl(hash, Networks.TESTNET)).toBeUndefined()
	})
})

describe("lastGrantTransaction", () => {
	const docApplied = xdr.ScVal.scvSymbol("doc_applied").toXDR("base64")
	const filters = [
		{ type: "contract", contractIds: [contract], topics: [[docApplied, "*"]] },
	]
	/** A cursor where a scan stopped at `ledger`, as the RPC writes it. */
	const cursor = (ledger: number) =>
		`${(BigInt(ledger) << 32n).toString().padStart(19, "0")}-4294967295`
	/** An RPC that scans 10,000 ledgers a call, with `found` events by ledger. */
	const server = (found: Record<number, string>, fail = false) => {
		const asked: unknown[] = []
		const latest = 100_000
		return {
			asked,
			getHealth: async () => ({
				status: "healthy",
				latestLedger: latest,
				oldestLedger: 1,
				ledgerRetentionWindow: 120_960,
			}),
			getEvents: async (request: { startLedger?: number; cursor?: string }) => {
				asked.push(request)
				if (fail) throw new Error("RPC down")
				const from = request.cursor
					? Number(BigInt(request.cursor.split("-")[0]!) >> 32n) + 1
					: request.startLedger!
				const to = Math.min(from + 10_000, latest)
				return {
					latestLedger: latest,
					cursor: cursor(to),
					events: Object.entries(found)
						.filter(([l]) => Number(l) >= from && Number(l) <= to)
						.map(([, txHash]) => ({ txHash })),
				}
			},
		}
	}

	it("finds the newest doc_applied on the account, paging through a day", async () => {
		const rpc = server({ 85_000: "a".repeat(64), 99_990: hash })
		expect(await lastGrantTransaction(contract, rpc as never)).toBe(hash)
		expect(rpc.asked).toEqual([
			{ startLedger: 100_000 - 17_280, filters, limit: 100 },
			{ cursor: cursor(92_720), filters, limit: 100 },
		])
	})

	it("keeps an earlier find when the last page has none", async () => {
		const rpc = server({ 85_000: hash })
		expect(await lastGrantTransaction(contract, rpc as never)).toBe(hash)
	})

	it("is undefined when nothing was applied or the RPC fails", async () => {
		expect(
			await lastGrantTransaction(contract, server({}) as never),
		).toBeUndefined()
		expect(
			await lastGrantTransaction(
				contract,
				server({ 99_990: hash }, true) as never,
			),
		).toBeUndefined()
	})
})
