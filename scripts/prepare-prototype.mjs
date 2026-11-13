// Offline bootstrap: compile each contract the testnet app uses and write
// real SDK clients for them with a placeholder contract ID, so the app builds
// and the browser tests run before anything is deployed. Nothing is
// deployed, signed, or sent.
//
// It compiles into target/prototype, away from Scaffold's builds: a plain
// `stellar contract build` targets the local network, and contracts that bake
// a network's XLM address in at compile time would otherwise reach testnet
// with the local one (`Error(Context, InvalidAction)` on deploy).
import { execFileSync } from "node:child_process"
import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { parse } from "yaml"
import { root } from "./tools.mjs"

const PLACEHOLDER = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4"
const targetDir = resolve(root, "target", "prototype")
const run = (command, args, options = {}) =>
	execFileSync(command, args, { stdio: "inherit", cwd: root, ...options })
const camel = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase())
const pascal = (name) => camel(name).replace(/^\w/, (c) => c.toUpperCase())

const { contracts = {} } = parse(
	readFileSync(resolve(root, "scaffold.yml"), "utf8"),
)
const crates = Object.entries(contracts).flatMap(
	([name, { networks = {} }]) => {
		const workspace = Object.values(networks).find(
			(n) => n?.type === "workspace",
		)
		return (networks.testnet || networks["testnet-dev"]) && workspace
			? [{ name, crate: workspace.source }]
			: []
	},
)
if (!crates.length) {
	console.error("scaffold.yml lists no workspace contract for testnet.")
	process.exit(1)
}

const sdk = JSON.parse(
	readFileSync(resolve(root, "app-lib/package.json"), "utf8"),
).dependencies["@stellar/stellar-sdk"]
for (const { name, crate } of crates) {
	run("stellar", ["contract", "build", "--package", crate], {
		env: { ...process.env, CARGO_TARGET_DIR: targetDir },
	})
	const client = `app-lib/clients/${name}`
	run("stellar", [
		"contract",
		"bindings",
		"typescript",
		"--wasm",
		resolve(
			targetDir,
			`wasm32v1-none/release/${crate.replaceAll("-", "_")}.wasm`,
		),
		"--output-dir",
		client,
		"--overwrite",
	])
	// Generated packages may ask for an older SDK; one SDK copy keeps the XDR
	// types compatible with app-lib's.
	const manifestPath = resolve(root, client, "package.json")
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
	manifest.dependencies["@stellar/stellar-sdk"] = sdk
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
	run("npm", ["run", "build", "--workspace", client])
}
writeFileSync(
	resolve(root, "app-lib/clients/index.ts"),
	`// LOCAL PROTOTYPE ONLY: generated from WASM, not a deployed contract.
${crates.map(({ name }) => `import { Client as ${pascal(name)} } from "./${name}/dist/index.js"`).join("\n")}
export const options = {
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  allowHttp: false,
  publicKey: undefined,
}
${crates.map(({ name }) => `export const ${camel(name)} = new ${pascal(name)}({ ...options, contractId: "${PLACEHOLDER}" })`).join("\n")}
`,
)
console.log(
	"Prototype clients ready. Their contract ID is a placeholder; run browser tests with mocked services, or `npm run clients:testnet` / `npm run deploy:testnet` before live signing.",
)
