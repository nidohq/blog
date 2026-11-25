import { Address, Asset, Networks, StrKey, xdr } from "@stellar/stellar-sdk"
import { describe, expect, it, vi } from "vitest"
import {
	checkNetworkFree,
	checkRpc,
	deployedInstance,
	pinMainnet,
	validateMainnetId,
} from "./mainnet.mjs"

const id = StrKey.encodeContract(Buffer.alloc(32, 7))
const xlm = (passphrase: string) =>
	Buffer.from(Asset.native().contractId(passphrase))

describe("deploy:mainnet / dev:mainnet preflight", () => {
	it("takes only a wasm with no network's XLM contract built in", () => {
		const code = Buffer.concat([Buffer.from("\0asm"), Buffer.alloc(64)])
		expect(() => checkNetworkFree(code)).not.toThrow()
		for (const passphrase of [Networks.PUBLIC, Networks.TESTNET])
			expect(() =>
				checkNetworkFree(Buffer.concat([code, xlm(passphrase)])),
			).toThrow(`XLM contract of ${passphrase}`)
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

	it("pins the blog under mainnet: and leaves the rest of scaffold.yml as it was", () => {
		const yml = `networks:
  local:
    accounts: [me]
contracts:
  blog:
    networks:
      # the testnet deployment
      testnet:
        type: contract
        source: CTEST
      testnet-dev:
        type: workspace
        args:
          admin: \${account.testnet-user}
      # mainnet: goes here
  token:
    networks:
      local:
        args:
          initial_supply: 1000000000000000000000000
`
		const pinned = pinMainnet(yml, id)
		expect(pinned).toBe(
			yml.replace(
				"      # mainnet: goes here",
				`      mainnet:\n        type: contract\n        source: ${id}\n      # mainnet: goes here`,
			),
		)
		expect(() => pinMainnet(pinned, id)).toThrow("already pins")
	})

	it("checks the RPC is mainnet before anything else", async () => {
		await expect(
			checkRpc({
				getNetwork: async () => ({ passphrase: Networks.TESTNET }),
			} as never),
		).rejects.toThrow("is not Stellar MAINNET")
		await expect(
			checkRpc({
				getNetwork: async () => ({ passphrase: Networks.PUBLIC }),
			} as never),
		).resolves.toBeUndefined()
	})

	it("needs the pinned contract on chain", async () => {
		const server = {
			getLedgerEntries: vi.fn().mockResolvedValue({ entries: [] }),
		}
		await expect(deployedInstance(id, server as never)).rejects.toThrow(
			"There is no contract",
		)
	})

	it("reads the deployed code and the admin the constructor recorded", async () => {
		const hash = Buffer.alloc(32, 3)
		const admin = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 5))
		const live = (storage: xdr.ScMapEntry[]) => ({
			getLedgerEntries: async () => ({
				entries: [
					{
						val: xdr.LedgerEntryData.contractData(
							new xdr.ContractDataEntry({
								ext: new xdr.ExtensionPoint(0),
								contract: new Address(id).toScAddress(),
								key: xdr.ScVal.scvLedgerKeyContractInstance(),
								durability: xdr.ContractDataDurability.persistent(),
								val: xdr.ScVal.scvContractInstance(
									new xdr.ScContractInstance({
										executable:
											xdr.ContractExecutable.contractExecutableWasm(hash),
										storage,
									}),
								),
							}),
						),
					},
				],
			}),
		})
		const entry = (name: string, val: xdr.ScVal) =>
			new xdr.ScMapEntry({
				key: xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(name)]),
				val,
			})
		await expect(
			deployedInstance(
				id,
				live([
					entry("PostCount", xdr.ScVal.scvU32(2)),
					entry("Admin", new Address(admin).toScVal()),
				]) as never,
			),
		).resolves.toEqual({ wasmHash: hash.toString("hex"), admin })
		// A blog deployed before it had an admin
		await expect(deployedInstance(id, live([]) as never)).resolves.toEqual({
			wasmHash: hash.toString("hex"),
			admin: undefined,
		})
	})
})
