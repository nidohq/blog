// `npm run test-browser`: a throwaway Chrome that automation can drive through
// a real Nido account, on testnet only.
//
// Finds a Chrome (CHROME_PATH, an installed Google Chrome or Chromium, or
// Playwright's Chrome for Testing), starts it on a free debugging port with a
// profile in target/test-browser, and gives every tab and popup a virtual
// passkey (webauthn-sidecar.mjs). Passkeys persist in
// target/nido-passkeys.json, so a restarted browser still signs for the same
// accounts. Prints, and writes to target/test-browser.env, the environment
// chrome-devtools-axi needs; runs until Ctrl-C. Never use your own profile.
//
//   npm run test-browser                       # headless
//   npm run test-browser -- --headed --port 9333
import { spawn } from "node:child_process"
import {
	existsSync,
	mkdirSync,
	readFileSync,
	readlinkSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { basename, delimiter, join, relative } from "node:path"
import { setTimeout as sleep } from "node:timers/promises"
import { parseArgs } from "node:util"
import { root } from "./tools.mjs"
import { armPasskeys } from "./webauthn-sidecar.mjs"

const { values } = parseArgs({
	options: {
		headed: { type: "boolean", default: false },
		port: { type: "string", default: "0" },
	},
})
const dir = join(root, "target", "test-browser")
const profile = join(dir, "profile")
const store = join(root, "target", "nido-passkeys.json")

const chrome = await findChrome()
if (!chrome) {
	console.error(
		"No Chrome found. Install Google Chrome, set CHROME_PATH, or run `npx playwright install chromium` (the e2e workspace already depends on Playwright).",
	)
	process.exit(1)
}

// Chrome hands a second launch on one profile to the first and exits.
const running = holder()
if (running) {
	console.error(
		`A test browser (pid ${running}) already uses ${relative(root, profile)}; its settings are in target/test-browser.env. Stop it first for a new one.`,
	)
	process.exit(1)
}
mkdirSync(profile, { recursive: true })
rmSync(join(profile, "DevToolsActivePort"), { force: true })
const browser = spawn(
	chrome,
	[
		...(values.headed ? [] : ["--headless=new"]),
		`--remote-debugging-port=${values.port}`,
		`--user-data-dir=${profile}`,
		"--no-first-run",
		"--no-default-browser-check",
		"about:blank",
	],
	{ stdio: "ignore" },
)
const stop = () => {
	browser.kill()
	process.exit(0)
}
process.on("SIGINT", stop)
process.on("SIGTERM", stop)
browser.on("exit", (code) => {
	console.log(`Chrome exited (${code ?? "signal"})`)
	process.exit(code ?? 0)
})

const port = await debuggingPort()
const browserUrl = `http://127.0.0.1:${port}`
await armPasskeys(browserUrl, store)

const app = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).name
const env = `CHROME_DEVTOOLS_AXI_BROWSER_URL=${browserUrl}\nCHROME_DEVTOOLS_AXI_SESSION=${app.replace(/\W+/g, "-").replace(/^-+|-+$/g, "")}\n`
writeFileSync(join(root, "target", "test-browser.env"), env)
const appPort = /^PORT=(\d+)/m.exec(
	existsSync(join(root, ".env"))
		? readFileSync(join(root, ".env"), "utf8")
		: "",
)?.[1]
console.log(`
Test browser ready: ${basename(chrome)}${values.headed ? "" : " (headless)"}, profile ${relative(root, profile)}
Virtual passkeys (throwaway, testnet only): ${relative(root, store)}

For chrome-devtools-axi, in another shell (or \`set -a; . target/test-browser.env\`):
${env
	.trim()
	.split("\n")
	.map((line) => `  export ${line}`)
	.join("\n")}

Then open the app (npm run dev): http://localhost:${appPort ?? 5173}
Create a Nido account at https://test.nido.fyi; it arrives with 5 test XLM.
Ctrl-C closes Chrome.`)

async function findChrome() {
	const candidates = [
		process.env.CHROME_PATH,
		"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
		"/Applications/Chromium.app/Contents/MacOS/Chromium",
		...[
			"google-chrome",
			"google-chrome-stable",
			"chromium",
			"chromium-browser",
		].flatMap((name) =>
			(process.env.PATH ?? "").split(delimiter).map((d) => join(d, name)),
		),
	]
	try {
		const { chromium } = await import("@playwright/test")
		candidates.push(chromium.executablePath())
	} catch {
		// Playwright isn't installed in this checkout
	}
	return candidates.find((path) => path && existsSync(path))
}

async function debuggingPort() {
	const file = join(profile, "DevToolsActivePort")
	for (let i = 0; i < 300; i++) {
		if (existsSync(file)) {
			const [line] = readFileSync(file, "utf8").split("\n")
			if (line) return Number(line)
		}
		await sleep(100)
	}
	console.error("Chrome did not open a debugging port within 30 s")
	stop()
}

/** The pid of a live Chrome holding the profile, if any. */
function holder() {
	try {
		const pid = Number(
			readlinkSync(join(profile, "SingletonLock")).split("-").at(-1),
		)
		process.kill(pid, 0)
		return pid
	} catch {
		return undefined
	}
}
