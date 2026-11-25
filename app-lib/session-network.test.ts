import { afterEach, expect, it } from "vitest"
import { Networks } from "@stellar/stellar-sdk"
import { loadSession, setSessionNetwork } from "./session"
afterEach(() => {
	setSessionNetwork(Networks.TESTNET)
	localStorage.clear()
})
it("never reuses testnet session grants on mainnet, including the same address", () => {
	localStorage.setItem(
		"scaffold:nido-session:account",
		JSON.stringify({ passkey: { id: "testnet" } }),
	)
	setSessionNetwork(Networks.TESTNET)
	expect(loadSession("account")).toBeDefined()
	setSessionNetwork(Networks.PUBLIC)
	expect(loadSession("account")).toBeUndefined()
	setSessionNetwork(Networks.TESTNET)
	expect(loadSession("account")).toBeDefined()
})
