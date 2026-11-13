import { Asset, Networks, StrKey } from "@stellar/stellar-sdk"
import { describe, expect, it, vi } from "vitest"
import {
	checkMainnetXlm,
	checkRpc,
	deployedWasmHash,
	pinMainnet,
	validateMainnetId,
} from "./mainnet.mjs"

const id = StrKey.encodeContract(Buffer.alloc(32, 7))
const xlm = (passphrase: string) =>
	Buffer.from(Asset.native().contractId(passphrase))

describe("deploy:mainnet / dev:mainnet preflight", () => {
	it("takes only a wasm that pays in mainnet's XLM", () => {
		const wasm = (passphrase: string) =>
			Buffer.concat([Buffer.from("\0asm"), xlm(passphrase), Buffer.alloc(8)])
		expect(() => checkMainnetXlm(wasm(Networks.PUBLIC))).not.toThrow()
		expect(() => checkMainnetXlm(wasm(Networks.TESTNET))).toThrow(
			"built for another network",
		)
		// Both networks' IDs: still refused
		expect(() =>
			checkMainnetXlm(
				Buffer.concat([wasm(Networks.PUBLIC), xlm(Networks.TESTNET)]),
			),
		).toThrow("built for another network")
	})

	it("refuses a missing, malformed, testnet or placeholder pin", () => {
		const testnet = StrKey.encodeContract(Buffer.alloc(32, 9))
		for (const candidate of [
			undefined,
			"C...",
			testnet,
			"CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4",
		])
			expect(() => validateMainnetId(candidate, testnet)).toThrow()
		expect(validateMainnetId(id, testnet)).toBe(id)
	})

	it("pins the blog under mainnet: and keeps scaffold.yml's comments", () => {
		const yml = `contracts:
  blog:
    networks:
      # the testnet deployment
      testnet:
        type: contract
        source: CTEST
`
		const pinned = pinMainnet(yml, id)
		expect(pinned).toContain("# the testnet deployment")
		expect(pinned).toContain(
			`mainnet:\n        type: contract\n        source: ${id}`,
		)
	})

	it("checks the RPC is mainnet before anything else", async () => {
		await expect(
			checkRpc({
				getNetwork: async () => ({ passphrase: Networks.TESTNET }),
			} as never),
		).rejects.toThrow("is not Stellar mainnet")
		await expect(
			checkRpc({
				getNetwork: async () => ({ passphrase: Networks.PUBLIC }),
			} as never),
		).resolves.toBeUndefined()
	})

	it("needs the pinned contract live on chain", async () => {
		const server = {
			getLedgerEntries: vi.fn().mockResolvedValue({ entries: [] }),
		}
		await expect(deployedWasmHash(id, server as never)).rejects.toThrow(
			"absent or archived",
		)
	})
})
