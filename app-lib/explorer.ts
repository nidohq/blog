// Links to stellar.expert, the block explorer, for the network the app runs
// on. Takes the network passphrase as an argument rather than reading the
// generated clients, so it works (and is tested) before any client exists.
import { Networks, StrKey, rpc, xdr } from "@stellar/stellar-sdk"

/** stellar.expert's name for each network it explores. Local and custom
 * networks have no explorer, so they get no links. */
const EXPERT_NETWORKS: Record<string, string> = {
	[Networks.PUBLIC]: "public",
	[Networks.TESTNET]: "testnet",
	[Networks.FUTURENET]: "futurenet",
}

const EXPERT = "https://stellar.expert/explorer"

/** The stellar.expert page for transaction `hash`, or undefined on a
 * network it doesn't explore. */
export function transactionUrl(
	hash: string,
	passphrase: string,
): string | undefined {
	const network = EXPERT_NETWORKS[passphrase]
	if (!network || !/^[0-9a-f]{64}$/i.test(hash)) return undefined
	return `${EXPERT}/${network}/tx/${hash.toLowerCase()}`
}

/** The stellar.expert page for an address: `/contract/` for a C-address (a
 * contract, or a smart account such as Nido's), `/account/` for a G-address;
 * undefined for anything else or a network it doesn't explore. */
export function addressUrl(
	address: string,
	passphrase: string,
): string | undefined {
	const network = EXPERT_NETWORKS[passphrase]
	if (!network) return undefined
	if (StrKey.isValidContract(address))
		return `${EXPERT}/${network}/contract/${address}`
	if (StrKey.isValidEd25519PublicKey(address))
		return `${EXPERT}/${network}/account/${address}`
	return undefined
}

/** Ledgers in a day: a session lasts at most 24 hours (`GrantDuration`). */
const DAY_LEDGERS = 17_280

/**
 * The transaction that last applied a policy document to Nido account
 * `account`: its `apply_doc` publishes `doc_applied`, and the RPC's events
 * carry the transaction hash. Nido's grant page answers only "approved", so
 * this is how the app links the approval it just saw. Looks back one day,
 * following the RPC's cursor (one call scans about 10,000 ledgers);
 * undefined when there is no such event, or the RPC can't say.
 */
export async function lastGrantTransaction(
	account: string,
	server: Pick<rpc.Server, "getHealth" | "getEvents">,
): Promise<string | undefined> {
	const filters = [
		{
			type: "contract" as const,
			contractIds: [account],
			topics: [[xdr.ScVal.scvSymbol("doc_applied").toXDR("base64"), "*"]],
		},
	]
	try {
		// The RPC's health answer carries its latest ledger, and is cheap
		const { latestLedger } = await server.getHealth()
		let found: string | undefined
		let page = await server.getEvents({
			startLedger: Math.max(1, latestLedger - DAY_LEDGERS),
			filters,
			limit: 100,
		})
		for (let pages = 1; ; pages++) {
			found = page.events.at(-1)?.txHash ?? found
			// A cursor is "<ledger << 32 …>-<index>": where the scan stopped
			const reached = Number(BigInt(page.cursor.split("-")[0] ?? 0) >> 32n)
			if (reached >= page.latestLedger || pages >= 4) return found
			page = await server.getEvents({
				cursor: page.cursor,
				filters,
				limit: 100,
			})
		}
	} catch {
		return undefined
	}
}
