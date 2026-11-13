// Run the `stellar` CLI with this project's tools and keys (see tools.mjs):
// `.tools/bin` first on PATH and STELLAR_CONFIG_HOME=.stellar-config. Every
// npm script that calls `stellar` goes through here, and so can you:
//
//   npm run stellar -- keys ls
//   npm run stellar -- contract invoke --id <C…> --network testnet -- --help
//
// `--check` only verifies that a new enough stellar-scaffold is installed.
import { spawnSync } from "node:child_process"
import { SCAFFOLD_MIN, older, toolEnv, versionOf } from "./tools.mjs"

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
const { status } = spawnSync("stellar", args, {
	stdio: "inherit",
	env: toolEnv(),
	shell: process.platform === "win32",
})
process.exit(status ?? 1)
