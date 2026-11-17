// The dev server's one port, and a check that it is really free.
//
// A Nido session lives in the page origin's storage, and the origin includes
// the port, so the app always runs on the same port: 5421 unless PORT says
// otherwise (the shell's PORT wins over the root .env's). Vite's strictPort
// alone is not enough: it tests only the address it binds. `localhost` can be
// 127.0.0.1 or ::1, and when another app holds one of them Vite binds the
// other, starts, and the browser reaches whichever answers first, perhaps
// the other app. So the port must be free on both, and on every interface.
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { createServer } from "node:net"
import { resolve } from "node:path"

export const DEFAULT_PORT = 5421

/** PORT from the shell, else from `<root>/.env`, else 5421. */
export function devPort(root, env = process.env) {
	const file = resolve(root, ".env")
	const fromFile =
		existsSync(file) &&
		readFileSync(file, "utf8").match(/^\s*PORT\s*=\s*["']?(\d+)/m)?.[1]
	return Number(env.PORT || fromFile) || DEFAULT_PORT
}

/** Whether `host` refuses `port` because something listens there. */
const taken = (port, host) =>
	new Promise((done) => {
		const server = createServer()
			.once("error", (error) => done(error.code === "EADDRINUSE"))
			.once("listening", () => server.close(() => done(false)))
			.listen({ port, host, exclusive: true })
	})

/** The processes listening on `port`, as "PID 123 (command) in /dir"; empty
 * when there are none or `lsof` can't say. */
export function portHolders(port) {
	const lsof = (args) => {
		try {
			return execFileSync("lsof", args, {
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			})
		} catch {
			return ""
		}
	}
	const pids = [
		...new Set(
			lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])
				.split("\n")
				.filter(Boolean),
		),
	]
	return pids.map((pid) => {
		const fields = lsof(["-a", "-p", pid, "-d", "cwd", "-Fcn"]).split("\n")
		const command = fields.find((f) => f.startsWith("c"))?.slice(1)
		const cwd = fields.find((f) => f.startsWith("n"))?.slice(1)
		return `PID ${pid}${command ? ` (${command})` : ""}${cwd ? ` in ${cwd}` : ""}`
	})
}

/** Throw, naming the process that holds it, unless `port` is free on
 * 127.0.0.1 and ::1, and on every interface: a listener on 0.0.0.0 or :: also
 * answers localhost, yet doesn't stop Vite binding a loopback address. */
export async function assertPortFree(port) {
	const hosts = []
	for (const host of ["127.0.0.1", "::1", "0.0.0.0", "::"])
		if (await taken(port, host)) hosts.push(host)
	if (!hosts.length) return
	const holders = portHolders(port)
	throw new Error(
		`Port ${port} is already in use (${hosts.join(" and ")}${
			holders.length ? `, by ${holders.join("; ")}` : ""
		}). This app runs only on ${port}, because a Nido session belongs to the page's origin. Stop that process, or set PORT in the shell or .env and approve the session again on the new port.`,
	)
}
