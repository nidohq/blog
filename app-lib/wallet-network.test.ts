import { expect, it, vi } from "vitest"
import { Asset, Networks } from "@stellar/stellar-sdk"
const kit = vi.hoisted(() => ({
	init: vi.fn(),
	getNetwork: vi.fn(),
	selectedModule: { productId: "freighter" },
}))
vi.mock("@creit.tech/stellar-wallets-kit", async (original) => ({
	...(await original<object>()),
	StellarWalletsKit: kit,
}))
vi.mock("@creit.tech/stellar-wallets-kit/modules/utils", () => ({
	defaultModules: () => [],
}))
vi.mock("./env", () => ({
	networkPassphrase: "Public Global Stellar Network ; September 2015",
	rpcUrl: "https://mainnet.sorobanrpc.com",
	allowHttp: false,
	stellarNetwork: "PUBLIC",
}))
import { nidoBase, nidoRelayer, submitCall, xlmTokenId } from "./wallet"
it("wires the mainnet wallet, relayer, XLM and signing network together", () => {
	expect(nidoBase).toBe("https://nido.fyi")
	expect(nidoRelayer).toBe("https://nido-mainnet.fly.dev")
	expect(xlmTokenId).toBe(Asset.native().contractId(Networks.PUBLIC))
	expect(xlmTokenId).not.toBe(Asset.native().contractId(Networks.TESTNET))
	expect(kit.init.mock.calls[0]![0].network).toBe(Networks.PUBLIC)
})
it("refuses mismatched wallets before building or requesting a signature", async () => {
	kit.getNetwork.mockResolvedValue({ networkPassphrase: Networks.TESTNET })
	const build = vi.fn()
	await expect(submitCall("G-address", build)).rejects.toThrow(
		"network mismatch",
	)
	expect(build).not.toHaveBeenCalled()
})
