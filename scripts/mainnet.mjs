// The blog on Stellar mainnet, run locally against hosted Nido's mainnet
// wallet (https://nido.fyi). Real XLM: only `deploy` and `upgrade` send
// transactions, they sign with the key you name, and they ask before they do.
//
//   npm run deploy:mainnet -- <key-alias>   # deploy, pin under mainnet:, write clients
//   npm run dev:mainnet                     # verify the pin, write clients, start Vite
//   npm run upgrade:mainnet -- <key-alias>  # as the blog's admin, swap in this checkout's code
//
// The key that deploys the blog becomes its admin, the one address that may
// upgrade it.
//
// `<key-alias>` is a `stellar keys` identity holding mainnet XLM: one in this
// project (`npm run stellar -- keys add <alias> --secret-key`, or
// `keys use-ledger`-style hardware identities) or in your global Stellar
// config. Nothing here creates, funds or prints a key. `npm run dev`
// (testnet) writes the testnet clients back.
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { pathToFileURL } from "node:url"
import {
	Address,
	Asset,
	Networks,
	StrKey,
	rpc,
	xdr,
} from "@stellar/stellar-sdk"
import { parseDocument } from "yaml"
import { assertPortFree, devPort } from "./port.mjs"
import { root, toolEnv } from "./tools.mjs"

export const MAINNET_RPC = "https://mainnet.sorobanrpc.com"
const CRATE = "blog"
const targetDir = resolve(root, "target", "mainnet")
export const wasmPath = resolve(targetDir, "wasm32v1-none/release/blog.wasm")
const PLACEHOLDER = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4"

/** A network's XLM contract ID, as the blog's wasm spells it: the strkey
 * `import_asset!("xlm")` bakes in. */
const xlmId = (passphrase) => Asset.native().contractId(passphrase)

/**
 * Refuse a wasm that would pay in another network's XLM: the blog's
 * `import_asset!("xlm")` bakes the contract ID of the network it was built
 * for into the code, so a build for testnet deployed to mainnet would call a
 * contract that isn't there.
 */
export function checkMainnetXlm(wasm) {
	const code = Buffer.from(wasm)
	const other = [Networks.TESTNET, Networks.FUTURENET, Networks.STANDALONE]
	if (
		!code.includes(xlmId(Networks.PUBLIC)) ||
		other.some((network) => code.includes(xlmId(network)))
	)
		throw new Error(
			"The blog wasm doesn't name mainnet's XLM contract: it was built for another network. Delete target/mainnet and run again.",
		)
}

/** The contract ID `id`, if it can be the blog's mainnet deployment. */
export function validateMainnetId(id, testnetId) {
	if (!id || !StrKey.isValidContract(id))
		throw new Error(
			"No mainnet deployment of the blog is pinned. Run `npm run deploy:mainnet -- <key-alias>` first.",
		)
	if (id === testnetId || id === PLACEHOLDER)
		throw new Error(
			"The mainnet pin is the testnet deployment or the prototype placeholder; deploy to mainnet first.",
		)
	return id
}

/**
 * scaffold.yml text with the blog pinned under `mainnet:`, after its last
 * network. Splices the text rather than re-serializing the YAML, which would
 * reformat the rest of the file (`[me]` as `[ me ]`, and a 25-digit
 * `initial_supply` as the float `1e+24`).
 */
export function pinMainnet(text, id) {
	const networks = parseDocument(text).getIn(
		["contracts", CRATE, "networks"],
		true,
	)
	const last = networks?.items?.at(-1)
	if (!last?.key?.range || !last.value?.range)
		throw new Error(`scaffold.yml has no networks: for ${CRATE} to pin under.`)
	if (networks.has("mainnet"))
		throw new Error(`scaffold.yml already pins ${CRATE} under mainnet:.`)
	const lineStart = text.lastIndexOf("\n", last.key.range[0]) + 1
	const indent = text.slice(lineStart, last.key.range[0])
	// The line after the last network's value, before any comment that follows
	const valueEnd = last.value.range[1]
	const at =
		text[valueEnd - 1] === "\n"
			? valueEnd
			: text.indexOf("\n", valueEnd) + 1 || text.length
	const head = text.slice(0, at)
	const entry = `${indent}mainnet:\n${indent}  type: contract\n${indent}  source: ${id}\n`
	return `${head}${head.endsWith("\n") ? "" : "\n"}${entry}${text.slice(at)}`
}

/** Stop unless `server` is a mainnet RPC. */
export async function checkRpc(server) {
	const { passphrase } = await server.getNetwork()
	if (passphrase !== Networks.PUBLIC)
		throw new Error(`${MAINNET_RPC} is not Stellar mainnet (${passphrase}).`)
}

/** Deployed contract `id`'s wasm hash and the admin its constructor
 * recorded; throws if it isn't live. */
export async function deployedInstance(id, server) {
	const key = xdr.LedgerKey.contractData(
		new xdr.LedgerKeyContractData({
			contract: new Address(id).toScAddress(),
			key: xdr.ScVal.scvLedgerKeyContractInstance(),
			durability: xdr.ContractDataDurability.persistent(),
		}),
	)
	const { entries } = await server.getLedgerEntries(key)
	if (!entries.length)
		throw new Error(`The mainnet blog ${id} is absent or archived.`)
	const instance = entries[0].val.contractData().val().instance()
	// The blog keeps its admin under the key `Admin` (a unit enum variant)
	const admin = (instance.storage() ?? []).find((entry) => {
		const vec = entry.key().switch().name === "scvVec" && entry.key().vec()
		return (
			vec?.length === 1 &&
			vec[0].switch().name === "scvSymbol" &&
			vec[0].sym().toString() === "Admin"
		)
	})
	return {
		wasmHash: instance.executable().wasmHash().toString("hex"),
		admin: admin && Address.fromScVal(admin.val()).toString(),
	}
}

const config = () => readFileSync(resolve(root, "scaffold.yml"), "utf8")
const pinned = () =>
	parseDocument(config()).toJS().contracts[CRATE].networks ?? {}

/** Run `stellar` with this project's tools, and the key store `env`. */
const stellar = (args, env = toolEnv(), options = {}) =>
	execFileSync("stellar", args, {
		cwd: root,
		encoding: "utf8",
		env,
		stdio: ["ignore", "pipe", "inherit"],
		...options,
	})?.trim() ?? ""

/** Compile the blog for mainnet into target/mainnet, and check its XLM. */
function buildForMainnet() {
	mkdirSync(targetDir, { recursive: true })
	stellar(
		["contract", "build", "--package", CRATE],
		{
			...toolEnv(),
			STELLAR_NETWORK: "mainnet",
			CARGO_TARGET_DIR: targetDir,
		},
		{ stdio: ["ignore", "inherit", "inherit"] },
	)
	const wasm = readFileSync(wasmPath)
	checkMainnetXlm(wasm)
	return createHash("sha256").update(wasm).digest("hex")
}

/** The key store holding `alias`: this project's, else your global one. */
function keyStore(alias) {
	const project = toolEnv()
	const global = { ...project }
	delete global.STELLAR_CONFIG_HOME
	for (const [where, env] of [
		["this project's .stellar-config", project],
		["your global Stellar config", global],
	]) {
		try {
			return { where, env, address: stellar(["keys", "address", alias], env) }
		} catch {
			// not in this store
		}
	}
	throw new Error(
		`No key named "${alias}" in this project or your global Stellar config. Add it with \`npm run stellar -- keys add ${alias} --secret-key\` (it prompts; nothing echoes).`,
	)
}

/** Clients for the pinned mainnet blog, from the local mainnet build, after
 * checking the deployment on chain matches it. */
async function clients(server) {
	const networks = pinned()
	const id = validateMainnetId(
		networks.mainnet?.source,
		networks.testnet?.source,
	)
	await checkRpc(server)
	const local = buildForMainnet()
	const { wasmHash: deployed } = await deployedInstance(id, server)
	if (deployed !== local)
		console.warn(
			`The mainnet blog runs wasm ${deployed.slice(0, 12)}…; this checkout builds ${local.slice(0, 12)}…. The client follows this checkout's contract.`,
		)
	const client = "app-lib/clients/blog"
	stellar(
		[
			"contract",
			"bindings",
			"typescript",
			"--wasm",
			wasmPath,
			"--output-dir",
			client,
			"--overwrite",
		],
		toolEnv(),
		{ stdio: ["ignore", "inherit", "inherit"] },
	)
	// One SDK copy keeps the XDR types compatible with app-lib's
	const sdk = JSON.parse(
		readFileSync(resolve(root, "app-lib/package.json"), "utf8"),
	).dependencies["@stellar/stellar-sdk"]
	const manifestPath = resolve(root, client, "package.json")
	const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
	manifest.dependencies["@stellar/stellar-sdk"] = sdk
	writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
	execFileSync("npm", ["run", "build", "--workspace", client], {
		cwd: root,
		stdio: "inherit",
	})
	writeFileSync(
		resolve(root, "app-lib/clients/index.ts"),
		`// MAINNET: written by \`npm run dev:mainnet\` for the blog pinned under mainnet: in scaffold.yml.
// \`npm run dev\` writes the testnet clients back.
import { Client as Blog } from "./blog/dist/index.js"
export const options = {
  networkPassphrase: "${Networks.PUBLIC}",
  rpcUrl: "${MAINNET_RPC}",
  allowHttp: false,
  publicKey: undefined,
}
export const blog = new Blog({ ...options, contractId: "${id}" })
`,
	)
	execFileSync(process.execPath, ["scripts/link-clients.mjs"], {
		cwd: root,
		stdio: "inherit",
	})
	console.log(`Mainnet clients ready for the blog at ${id}.`)
	return id
}

async function deploy(alias, server, { yes }) {
	if (!alias) throw new Error("usage: npm run deploy:mainnet -- <key-alias>")
	await checkRpc(server)
	const networks = pinned()
	if (networks.mainnet?.source)
		throw new Error(
			`scaffold.yml already pins the mainnet blog at ${networks.mainnet.source}. Remove that entry to deploy a new one.`,
		)
	const { where, env, address } = keyStore(alias)
	const account = await server.getAccount(address).catch(() => {
		throw new Error(
			`${address} (${alias}) has no mainnet account: fund it first.`,
		)
	})
	const hash = buildForMainnet()
	console.log(`
Deploy the blog to Stellar MAINNET
  from      ${address} (${alias}, ${where}), sequence ${account.sequenceNumber()}
  admin     ${address} (${alias}): the one address that may upgrade the blog
  wasm      ${hash}, paying in mainnet XLM ${Asset.native().contractId(Networks.PUBLIC)}
  network   ${MAINNET_RPC}
Uploading the code and creating the contract costs real XLM in fees.`)
	if (!yes) {
		const rl = createInterface({ input: process.stdin, output: process.stdout })
		const answer = await rl.question('Type "deploy" to send it: ')
		rl.close()
		if (answer.trim() !== "deploy") throw new Error("Nothing was sent.")
	}
	const id = stellar(
		[
			"contract",
			"deploy",
			"--wasm",
			wasmPath,
			"--source-account",
			alias,
			"--rpc-url",
			MAINNET_RPC,
			"--network-passphrase",
			Networks.PUBLIC,
			"--",
			"--admin",
			address,
		],
		env,
	)
		.split("\n")
		.at(-1)
	if (!StrKey.isValidContract(id))
		throw new Error(`Unexpected deploy output: ${id}`)
	writeFileSync(resolve(root, "scaffold.yml"), pinMainnet(config(), id))
	console.log(`Deployed and pinned under mainnet: in scaffold.yml: ${id}
https://stellar.expert/explorer/public/contract/${id}`)
	await clients(server)
	console.log(`Next: npm run dev:mainnet (http://localhost:${devPort(root)})`)
}

async function upgrade(alias, server, { yes }) {
	if (!alias) throw new Error("usage: npm run upgrade:mainnet -- <key-alias>")
	await checkRpc(server)
	const networks = pinned()
	const id = validateMainnetId(
		networks.mainnet?.source,
		networks.testnet?.source,
	)
	const { where, env, address } = keyStore(alias)
	const { wasmHash: deployed, admin } = await deployedInstance(id, server)
	if (!admin)
		throw new Error(
			`The mainnet blog ${id} has no admin: it was deployed before the blog could be upgraded. Deploy a new one.`,
		)
	if (admin !== address)
		throw new Error(
			`${alias} is ${address}, but only ${admin} may upgrade the blog at ${id}.`,
		)
	const hash = buildForMainnet()
	if (hash === deployed)
		throw new Error(`The mainnet blog already runs this code (${hash}).`)
	console.log(`
Upgrade the blog on Stellar MAINNET
  blog      ${id}
  admin     ${address} (${alias}, ${where})
  code      ${deployed} → ${hash}
  network   ${MAINNET_RPC}
Uploading the code and switching to it are two transactions, paid in real XLM.
Posts, comments and tips stay; the contract ID does not change.`)
	if (!yes) {
		const rl = createInterface({ input: process.stdin, output: process.stdout })
		const answer = await rl.question('Type "upgrade" to send it: ')
		rl.close()
		if (answer.trim() !== "upgrade") throw new Error("Nothing was sent.")
	}
	const network = [
		"--source-account",
		alias,
		"--rpc-url",
		MAINNET_RPC,
		"--network-passphrase",
		Networks.PUBLIC,
	]
	const uploaded = stellar(
		["contract", "upload", "--wasm", wasmPath, ...network],
		env,
	)
		.split("\n")
		.at(-1)
	if (uploaded !== hash)
		throw new Error(`Uploaded ${uploaded}, expected ${hash}; nothing upgraded.`)
	stellar(
		[
			"contract",
			"invoke",
			"--id",
			id,
			...network,
			"--",
			"upgrade",
			"--new_wasm_hash",
			hash,
		],
		env,
	)
	const { wasmHash: now } = await deployedInstance(id, server)
	if (now !== hash)
		throw new Error(`The blog still runs ${now}; the upgrade did not land.`)
	console.log(`Upgraded: the blog at ${id} runs ${hash}.
https://stellar.expert/explorer/public/contract/${id}`)
	await clients(server)
}

async function dev(server) {
	// Before the build: the app runs only on its own port
	const port = devPort(root)
	await assertPortFree(port)
	await clients(server)
	const vite = spawn("npm", ["exec", "--workspace", "app", "--", "vite"], {
		cwd: root,
		stdio: "inherit",
	})
	vite.on("exit", (code) => process.exit(code ?? 0))
}

async function main() {
	const [command, ...rest] = process.argv.slice(2)
	const server = new rpc.Server(MAINNET_RPC)
	if (command === "deploy")
		return deploy(
			rest.find((a) => !a.startsWith("--")),
			server,
			{
				yes: rest.includes("--yes"),
			},
		)
	if (command === "upgrade")
		return upgrade(
			rest.find((a) => !a.startsWith("--")),
			server,
			{ yes: rest.includes("--yes") },
		)
	if (command === "clients") return clients(server)
	if (command === "dev") return dev(server)
	throw new Error(
		"usage: node scripts/mainnet.mjs deploy <key-alias> | upgrade <key-alias> | clients | dev",
	)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	main().catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
