import { test, expect } from "@playwright/test"

// UI smoke: assertions that hold for every app made from this template, with
// no chain or wallet interaction.

test("home page mounts", async ({ page }) => {
	const response = await page.goto("/")
	expect(response?.ok()).toBeTruthy()
	await expect(page.locator("body")).toBeVisible()
})

test("wallet connect button is present", async ({ page }) => {
	await page.goto("/")
	await expect(page.getByRole("button", { name: /connect/i })).toBeVisible()
})

test("contract explorer link is present", async ({ page }) => {
	await page.goto("/")
	await expect(page.locator('a[href="/debug"]').first()).toBeVisible()
})
