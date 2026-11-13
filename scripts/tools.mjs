// Where this project keeps its Stellar tools and keys. Everything stays inside
// the project: `.tools/bin` holds a pinned stellar-scaffold, and
// `.stellar-config` the CLI's identities and contract aliases (throwaway
// testnet keys). Apps on one machine never share a deployer, and nothing here
// replaces a global binary.
import { execFileSync } from "node:child_process"
import { delimiter, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")

/** scaffold.yml version 2 needs 0.0.30. Older releases ignore it without an
 * error: they compile the contracts and write no clients. */
export const SCAFFOLD_MIN = "0.0.30"
/** The release `npm run tools:scaffold` installs; tested with this template. */
export const SCAFFOLD_PINNED = "0.0.31"

export const toolsBin = resolve(root, ".tools", "bin")
export const configHome = resolve(root, ".stellar-config")

/** The environment every `stellar` call in this project runs with. */
export const toolEnv = (env = process.env) => ({
	...env,
	PATH: [toolsBin, env.PATH].join(delimiter),
	STELLAR_CONFIG_HOME: env.STELLAR_CONFIG_HOME || configHome,
})

/** The first x.y.z a command prints, or undefined when it does not run. */
export function versionOf(command, args = ["--version"]) {
	try {
		return execFileSync(command, args, {
			encoding: "utf8",
			env: toolEnv(),
			stdio: ["ignore", "pipe", "ignore"],
		}).match(/(\d+\.\d+\.\d+)/)?.[1]
	} catch {
		return undefined
	}
}

/** Whether version `found` is older than `min` (both x.y.z). */
export function older(found, min) {
	const [a, b] = [found, min].map((v) => v.split(".").map(Number))
	for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] < b[i]
	return false
}
