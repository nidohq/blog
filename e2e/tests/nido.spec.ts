import { expect, test } from "@playwright/test"
import { connect, mockServices, source } from "./mocks"

// Wallet behaviour every app made from this template keeps. The sample's
// session flow is in guess.spec.ts.

test("Nido appears in the real wallet picker alongside standard wallets", async ({
	page,
	context,
}) => {
	await mockServices(context)
	await page.goto("/")
	await page.getByRole("button", { name: "Connect", exact: true }).click()
	await expect(page.getByText("Nido", { exact: true })).toBeVisible()
	// Uninstalled standard modules are hidden by the upstream kit UI, but the
	// always-available Albedo module remains visible.
	await expect(page.getByText("Albedo", { exact: true })).toBeVisible()
	await page.screenshot({
		path: "../screenshots/nido-picker.png",
		fullPage: true,
	})
})

test("connect, balance, reload without popup, and disconnect", async ({
	page,
	context,
}) => {
	const { calls } = await mockServices(context)
	await connect(page)
	await expect(page.getByRole("button", { name: "Fund Account" })).toHaveCount(
		0,
	)
	let popups = 0
	page.on("popup", () => {
		popups++
	})
	await page.reload()
	await expect(page.locator(".wallet-balance")).toContainText("12.5 XLM")
	expect(popups).toBe(0)
	expect(calls).not.toContain("getLedgerEntries")
	await page.locator(".wallet-profile").click()
	await page.getByText("Disconnect", { exact: true }).click()
	await expect(
		page.getByRole("button", { name: "Connect", exact: true }),
	).toBeVisible()
	expect(
		await page.evaluate(() => localStorage.getItem("nido:wallet-kit:address")),
	).toBeNull()
})

test("classic accounts retain the Friendbot button", async ({
	page,
	context,
}) => {
	await mockServices(context)
	await page.addInitScript((address) => {
		localStorage.setItem("@StellarWalletsKit/activeAddress", address)
		localStorage.setItem("@StellarWalletsKit/selectedModuleId", "albedo")
	}, source)
	await page.goto("/")
	await expect(page.getByRole("button", { name: "Fund Account" })).toBeVisible()
})
