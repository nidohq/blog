import { execFileSync } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterAll, describe, expect, it } from "vitest"

const dir = mkdtempSync(join(tmpdir(), "new-app-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const newApp = (...args: string[]) =>
	execFileSync("node", ["scripts/new-app.mjs", ...args], {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "pipe"],
	})
const read = (app: string, file: string) =>
	readFileSync(join(dir, app, file), "utf8")

describe("new-app", () => {
	it("makes the copy its own: name, deployer, port, title, .env", () => {
		const out = newApp(join(dir, "folder"), "--name", "tips")
		const port = /port (\d+)/.exec(out)![1]
		const manifest = JSON.parse(read("folder", "package.json"))
		expect(manifest.name).toBe("tips")
		expect(manifest.scripts["new-app"]).toBeUndefined()
		expect(read("folder", "scaffold.yml")).toContain(
			"accounts: [tips-deployer]",
		)
		expect(read("folder", "scaffold.yml")).not.toContain("testnet-user")
		expect(read("folder", "app/index.html")).toContain("<title>tips</title>")
		expect(read("folder", ".env")).toContain(`PORT=${port}`)
		expect(read("folder", ".env.example")).toContain(`PORT=${port}`)
		for (const left of [
			".git",
			".stellar-config",
			".tools",
			"node_modules",
			"scripts/blank",
		])
			expect(existsSync(join(dir, "folder", left))).toBe(false)
		expect(
			existsSync(join(dir, "folder/app/src/components/GuessTheNumber.tsx")),
		).toBe(true)
		expect(out).toContain("npm run clients:testnet")
		// The same name always gets the same port
		expect(newApp(join(dir, "again"), "--name", "tips")).toContain(
			`port ${port}`,
		)
	})

	it("swaps the sample for the check-in starter with --blank", () => {
		mkdirSync(join(dir, "empty"))
		const out = newApp(join(dir, "empty"), "--name", "blanky", "--blank")
		const yml = read("empty", "scaffold.yml")
		expect(yml).toContain("check-in:")
		expect(yml).not.toMatch(/guess-the-number|fungible|nft/)
		expect(yml).toContain("accounts: [blanky-deployer]")
		expect(read("empty", "app/src/pages/Home.tsx")).toContain("<h1>blanky</h1>")
		expect(read("empty", "contracts/check-in/src/lib.rs")).toContain(
			"require_auth",
		)
		for (const gone of [
			"contracts/guess-the-number",
			"contracts/fungible-allowlist",
			"app/src/components/GuessTheNumber.tsx",
			"e2e/tests/guess.spec.ts",
		])
			expect(existsSync(join(dir, "empty", gone))).toBe(false)
		const lock = JSON.parse(read("empty", "package-lock.json"))
		expect(Object.keys(lock.packages).join()).not.toContain("guess-the-number")
		expect(
			read("empty", ".github/workflows/contract-release.yml"),
		).not.toContain("guess-the-number")
		expect(out).toContain("npm run deploy:testnet")
	})

	it("refuses a folder in use, inside the template, or a name it can't use", () => {
		expect(() => newApp(join(dir, "folder"))).toThrow(/not empty/)
		expect(() => newApp("target/inside")).toThrow(/inside the template/)
		expect(() => newApp(join(dir, "Bad Name"))).toThrow(/--name/)
	})
})
