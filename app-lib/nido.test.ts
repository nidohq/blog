import { afterEach, describe, expect, it, vi } from "vitest"
import {
	Networks,
	StrKey,
	contract,
	nativeToScVal,
	rpc,
} from "@stellar/stellar-sdk"
import {
	createNidoModules,
	smartAccountBalance,
	submitSmartAccount,
	transactionSource,
} from "./nido"

const address = StrKey.encodeContract(Buffer.alloc(32, 1))
const hash = "ab".repeat(32)
const value = nativeToScVal(true)
const fixture = () => {
	const parseResultXdr = vi.fn(() => "confirmed result")
	const tx = {
		toXDR: () => "transaction-xdr",
		options: { networkPassphrase: Networks.TESTNET, parseResultXdr },
		signAndSend: vi.fn(),
	} as unknown as contract.AssembledTransaction<string>
	const getTransaction = vi
		.fn()
		.mockResolvedValue({ status: "SUCCESS", returnValue: value })
	const server = {
		getTransaction,
		sendTransaction: vi.fn(),
	} as unknown as rpc.Server
	const sign = vi.fn().mockResolvedValue({ submitted: true, signedTxXdr: hash })
	return { tx, server, sign, getTransaction, parseResultXdr }
}

afterEach(() => vi.useRealTimers())

describe("Nido integration boundaries", () => {
	it("registers Nido only on its supported network", () => {
		expect(createNidoModules(Networks.TESTNET)[0]?.productId).toBe("nido")
		for (const network of [
			Networks.PUBLIC,
			Networks.STANDALONE,
			Networks.FUTURENET,
		]) {
			expect(createNidoModules(network)).toEqual([])
		}
	})
	it("keeps C-addresses out of the transaction source", () => {
		expect(transactionSource(address)).toBeUndefined()
		const classic = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2))
		expect(transactionSource(classic)).toBe(classic)
	})
	it("reads XLM through the native asset contract with the C-address argument", async () => {
		const simulateTransaction = vi.fn().mockResolvedValue({
			id: "1",
			latestLedger: 1,
			events: [],
			transactionData: {},
			minResourceFee: "100",
			result: { auth: [], retval: nativeToScVal(123456789n, { type: "i128" }) },
		})
		expect(
			await smartAccountBalance(
				address,
				{ simulateTransaction } as unknown as rpc.Server,
				Networks.TESTNET,
			),
		).toBe(123456789n)
		const tx = simulateTransaction.mock.calls[0]![0]
		const args = tx.operations[0].func.invokeContract().args()
		expect(args[0].address().contractId()).toEqual(
			StrKey.decodeContract(address),
		)
	})
	it("surfaces failed balance simulation", async () => {
		const server = {
			simulateTransaction: vi.fn().mockResolvedValue({ error: "unavailable" }),
		}
		await expect(
			smartAccountBalance(
				address,
				server as unknown as rpc.Server,
				Networks.TESTNET,
			),
		).rejects.toThrow("Unable to read")
	})
	it("decodes the confirmed return value and never rebroadcasts", async () => {
		const { tx, server, sign, parseResultXdr } = fixture()
		expect(await submitSmartAccount(tx, address, sign, server)).toEqual({
			result: "confirmed result",
			hash,
		})
		expect(sign).toHaveBeenCalledWith("transaction-xdr", {
			address,
			networkPassphrase: Networks.TESTNET,
		})
		expect(parseResultXdr).toHaveBeenCalledWith(value)
		expect(tx.signAndSend).not.toHaveBeenCalled()
		expect(server.sendTransaction).not.toHaveBeenCalled()
	})
	it("does not interpret legacy signed XDR as a submission", async () => {
		const { tx, server, sign, getTransaction } = fixture()
		sign.mockResolvedValue({ signedTxXdr: "AAAA" })
		await expect(submitSmartAccount(tx, address, sign, server)).rejects.toThrow(
			"without submitting",
		)
		expect(getTransaction).not.toHaveBeenCalled()
	})
	it("rejects malformed relayer hashes", async () => {
		const { tx, server, sign, getTransaction } = fixture()
		sign.mockResolvedValue({ submitted: true, signedTxXdr: "not-a-hash" })
		await expect(submitSmartAccount(tx, address, sign, server)).rejects.toThrow(
			"invalid transaction hash",
		)
		expect(getTransaction).not.toHaveBeenCalled()
	})
	it("reports chain failure instead of using the earlier simulation result", async () => {
		const { tx, server, sign, getTransaction, parseResultXdr } = fixture()
		getTransaction.mockResolvedValue({ status: "FAILED" })
		await expect(submitSmartAccount(tx, address, sign, server)).rejects.toThrow(
			"failed on chain",
		)
		expect(parseResultXdr).not.toHaveBeenCalled()
	})
	it("waits for indexing without signing again", async () => {
		vi.useFakeTimers()
		const { tx, server, sign, getTransaction } = fixture()
		getTransaction.mockResolvedValueOnce({ status: "NOT_FOUND" })
		const pending = submitSmartAccount(tx, address, sign, server)
		await vi.runAllTimersAsync()
		await expect(pending).resolves.toMatchObject({ hash })
		expect(sign).toHaveBeenCalledTimes(1)
		expect(getTransaction).toHaveBeenCalledTimes(2)
	})
	it("includes the hash on confirmation timeout so users can check before retrying", async () => {
		vi.useFakeTimers()
		const { tx, server, sign, getTransaction } = fixture()
		getTransaction.mockResolvedValue({ status: "NOT_FOUND" })
		const assertion = expect(
			submitSmartAccount(tx, address, sign, server),
		).rejects.toThrow(hash)
		await vi.runAllTimersAsync()
		await assertion
		expect(sign).toHaveBeenCalledTimes(1)
	})
})
