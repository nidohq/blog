// Drive a real Nido account from an automated browser, on testnet only.
//
// Nido's ceremonies need a passkey. Agents and CI have no fingerprint, so this
// attaches to a Chrome launched with --remote-debugging-port, gives every tab
// and popup a CDP virtual authenticator, and copies each new credential to
// the others: Nido creates the passkey on one page and asks for it in another.
// Credentials are throwaway testnet keys, saved so a restarted browser can
// still sign for the same account. Never point this at a real profile.
//
// `npm run test-browser` launches Chrome and runs this for you. By hand:
//
//   chrome --headless=new --remote-debugging-port=9333 --user-data-dir=target/chrome
//   node scripts/webauthn-sidecar.mjs http://127.0.0.1:9333
//   (then drive the browser with chrome-devtools-axi, Playwright, ...)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"
import { pathToFileURL } from "node:url"

const log = (...args) => console.log(new Date().toISOString(), ...args)

/**
 * Arm every page of the browser at `browserUrl` with virtual passkeys that
 * persist in `store`. Resolves once watching; `closed` settles when the
 * browser goes away.
 */
export async function armPasskeys(
	browserUrl = "http://127.0.0.1:9333",
	store = "target/nido-passkeys.json",
) {
	const credentials = existsSync(store)
		? JSON.parse(readFileSync(store, "utf8"))
		: []
	const save = () => {
		mkdirSync(dirname(store), { recursive: true })
		writeFileSync(store, JSON.stringify(credentials, null, 2))
	}

	const { webSocketDebuggerUrl } = await (
		await fetch(`${browserUrl}/json/version`)
	).json()
	const ws = new WebSocket(webSocketDebuggerUrl)
	let nextId = 0
	const pending = new Map()
	const send = (method, params = {}, sessionId) =>
		new Promise((resolve, reject) => {
			const id = ++nextId
			pending.set(id, { resolve, reject, method })
			ws.send(JSON.stringify({ id, method, params, sessionId }))
		})
	/** sessionId → the virtual authenticator on that page */
	const pages = new Map()

	async function arm(sessionId, url) {
		try {
			await send("WebAuthn.enable", { enableUI: false }, sessionId)
			const { authenticatorId } = await send(
				"WebAuthn.addVirtualAuthenticator",
				{
					options: {
						protocol: "ctap2",
						ctap2Version: "ctap2_1",
						transport: "internal",
						hasResidentKey: true,
						hasUserVerification: true,
						isUserVerified: true,
						automaticPresenceSimulation: true,
					},
				},
				sessionId,
			)
			pages.set(sessionId, authenticatorId)
			for (const credential of credentials)
				await send(
					"WebAuthn.addCredential",
					{ authenticatorId, credential },
					sessionId,
				)
			log("armed", url || "(new page)", `${credentials.length} passkeys`)
		} catch (error) {
			log("could not arm", url, error.message)
		} finally {
			await send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(
				() => {},
			)
		}
	}

	ws.addEventListener("message", async ({ data }) => {
		const message = JSON.parse(data)
		if (message.id && pending.has(message.id)) {
			const { resolve, reject, method } = pending.get(message.id)
			pending.delete(message.id)
			if (message.error)
				reject(new Error(`${method}: ${message.error.message}`))
			else resolve(message.result)
			return
		}
		const { method, params, sessionId } = message
		if (method === "Target.attachedToTarget") {
			if (params.targetInfo.type === "page")
				await arm(params.sessionId, params.targetInfo.url)
			else
				await send(
					"Runtime.runIfWaitingForDebugger",
					{},
					params.sessionId,
				).catch(() => {})
		} else if (method === "Target.detachedFromTarget") {
			pages.delete(params.sessionId)
		} else if (method === "WebAuthn.credentialAdded") {
			credentials.push(params.credential)
			save()
			log("passkey created for", params.credential.rpId)
			for (const [other, authenticatorId] of pages)
				if (other !== sessionId)
					await send(
						"WebAuthn.addCredential",
						{ authenticatorId, credential: params.credential },
						other,
					).catch((error) => log("could not share passkey", error.message))
		} else if (method === "WebAuthn.credentialAsserted") {
			log("passkey used for", params.credential.rpId)
		}
	})

	const closed = new Promise((resolve) => ws.addEventListener("close", resolve))
	await new Promise((resolve, reject) => {
		ws.addEventListener("open", resolve)
		ws.addEventListener("error", reject)
	})
	await send("Target.setDiscoverTargets", { discover: true })
	// Browser-level auto-attach also covers the pages that are already open.
	await send("Target.setAutoAttach", {
		autoAttach: true,
		waitForDebuggerOnStart: true,
		flatten: true,
	})
	log("watching", browserUrl, `(passkeys in ${store})`)
	return { closed }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const { closed } = await armPasskeys(process.argv[2], process.argv[3])
	await closed
}
