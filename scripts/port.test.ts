import { mkdtempSync, writeFileSync } from "node:fs"
import { type Server, createServer } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { DEFAULT_PORT, assertPortFree, devPort } from "./port.mjs"

const dir = (env?: string) => {
	const root = mkdtempSync(join(tmpdir(), "port-"))
	if (env !== undefined) writeFileSync(join(root, ".env"), env)
	return root
}

describe("the dev server's port", () => {
	it("is 5421 in a clean checkout, with no .env and no PORT", () => {
		expect(DEFAULT_PORT).toBe(5421)
		expect(devPort(dir(), {})).toBe(5421)
		expect(devPort(dir("STELLAR_NETWORK=testnet\n"), {})).toBe(5421)
	})

	it("follows PORT in .env, and the shell's PORT over it", () => {
		const root = dir("STELLAR_NETWORK=testnet\nPORT=5500\n")
		expect(devPort(root, {})).toBe(5500)
		expect(devPort(root, { PORT: "5600" })).toBe(5600)
		expect(devPort(dir(), { PORT: "5700" })).toBe(5700)
	})
})

describe("assertPortFree", () => {
	let server: Server | undefined
	afterEach(
		() => new Promise<void>((done) => server?.close(() => done()) ?? done()),
	)

	/** A port nothing listens on, and a server holding it on `host`. */
	const hold = (host: string) =>
		new Promise<number>((done) => {
			server = createServer().listen(0, host, () => {
				const address = server?.address()
				done(typeof address === "object" && address ? address.port : 0)
			})
		})

	it("passes a free port", async () => {
		const port = await hold("127.0.0.1")
		await new Promise<void>((done) => server?.close(() => done()))
		server = undefined
		await expect(assertPortFree(port)).resolves.toBeUndefined()
	})

	it.each(["127.0.0.1", "0.0.0.0"])(
		"refuses a port another process holds on %s, naming it",
		async (host) => {
			const port = await hold(host)
			const refusal = assertPortFree(port)
			await expect(refusal).rejects.toThrow(`Port ${port} is already in use`)
			await expect(refusal).rejects.toThrow(host)
			await expect(refusal).rejects.toThrow("set PORT")
		},
	)
})
