// Run the `stellar` CLI with this project's tools and keys (see tools.mjs):
// `.tools/bin` first on PATH and STELLAR_CONFIG_HOME=.stellar-config. Every
// npm script that calls `stellar` goes through here, and so can you:
//
//   npm run stellar -- keys ls
//   npm run stellar -- contract invoke --id <C…> --network testnet -- --help
//
// `--check` only verifies that a new enough stellar-scaffold is installed.
//
// Scaffold builds for STELLAR_NETWORK, from the shell or the root .env. A
// clean checkout has no .env, so `scaffold` commands default it to testnet,
// as .env.example does: hosted Nido runs there. An explicit `--network` wins.
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"
import { SCAFFOLD_MIN, older, root, toolEnv, versionOf } from "./tools.mjs"

const args = process.argv.slice(2)
if (args[0] === "--check" || args[0] === "scaffold") {
	const problems = []
	if (!versionOf("stellar"))
		problems.push(
			"The Stellar CLI is not installed: https://developers.stellar.org/docs/tools/cli/install-cli",
		)
	const found = versionOf("stellar-scaffold")
	if (!found || older(found, SCAFFOLD_MIN))
		problems.push(
			`stellar-scaffold ${SCAFFOLD_MIN} or newer is needed (found ${found ?? "none"}). Run \`npm run tools:scaffold\`: it downloads the tested release into .tools/ in seconds and changes nothing global.`,
		)
	if (problems.length) {
		console.error(problems.join("\n"))
		process.exit(1)
	}
	if (args[0] === "--check") process.exit(0)
}
const env = toolEnv()
const dotEnv = resolve(root, ".env")
if (
	args[0] === "scaffold" &&
	!env.STELLAR_NETWORK &&
	!(
		existsSync(dotEnv) &&
		/^\s*STELLAR_NETWORK\s*=/m.test(readFileSync(dotEnv, "utf8"))
	)
)
	env.STELLAR_NETWORK = "testnet"
const { status } = spawnSync("stellar", args, {
	stdio: "inherit",
	env,
	shell: process.platform === "win32",
})
process.exit(status ?? 1)
