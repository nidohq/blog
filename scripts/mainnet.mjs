// The blog on Stellar mainnet, run locally against hosted Nido's mainnet
// wallet (https://nido.fyi). Real XLM: only `deploy`, `upgrade` and
// `keep-alive` send transactions, they sign with the key you name, and each
// asks you to type a word before it sends anything.
//
//   npm run deploy:mainnet -- <key-alias>      # deploy, pin under mainnet:, write clients
//   npm run dev:mainnet                        # verify the pin, write clients, start Vite
//   npm run upgrade:mainnet -- <key-alias>     # as the blog's admin, swap in this checkout's code
//   npm run keep-alive:mainnet -- <key-alias>  # extend the blog and every post to the maximum lifetime
//
// The key that deploys the blog becomes its admin, the one address that may
// upgrade it.
//
// BLOG_REHEARSAL=testnet runs the same steps on testnet, with a throwaway
// testnet key: same build, prompts and checks, testnet's RPC, passphrase and
// Nido, and the pin kept in target/rehearsal/blog-id instead of scaffold.yml
// (Scaffold accepts only networks it knows there).
//
// `<key-alias>` is a `stellar keys` identity holding mainnet XLM: one in this
// project (`npm run stellar -- keys add <alias> --secret-key`, or
// `keys use-ledger`-style hardware identities) or in your global Stellar
// config. Nothing here creates, funds or prints a key. `npm run dev`
// (testnet) writes the testnet clients back.
import { execFileSync, spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { createInterface } from "node:readline/promises"
import { pathToFileURL } from "node:url"
import {
	Account,
	Address,
	Asset,
	Contract,
	Networks,
	Operation,
	StrKey,
	TransactionBuilder,
	nativeToScVal,
	rpc,
	scValToNative,
	xdr,
} from "@stellar/stellar-sdk"
import { parseDocument } from "yaml"
import { assertPortFree, devPort } from "./port.mjs"
import { root, toolEnv } from "./tools.mjs"

export const MAINNET_RPC = "https://mainnet.sorobanrpc.com"
/** Where the commands run: mainnet, or testnet for a rehearsal. */
export const NETWORKS = {
	mainnet: {
		label: "Stellar MAINNET",
		passphrase: Networks.PUBLIC,
		rpcUrl: MAINNET_RPC,
		expert: "public",
	},
	testnet: {
		label: "Stellar TESTNET (rehearsal)",
		passphrase: Networks.TESTNET,
		rpcUrl: "https://soroban-testnet.stellar.org",
		expert: "testnet",
	},
}
const rehearsal = process.env.BLOG_REHEARSAL === "testnet"
const net = rehearsal ? NETWORKS.testnet : NETWORKS.mainnet
const CRATE = "blog"
const targetDir = resolve(root, "target", "release-wasm")
export const wasmPath = resolve(targetDir, "wasm32v1-none/release/blog.wasm")
const rehearsalPin = resolve(root, "target", "rehearsal", "blog-id")
const PLACEHOLDER = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4"

/**
 * Refuse a wasm that names some network's XLM contract. The blog works out
 * the XLM contract of the network it runs on (contracts/blog/src/xlm.rs), so
 * one build serves every network; a wasm with an ID baked in comes from an
 * older checkout, which paid through whichever network it was built for.
 */
export function checkNetworkFree(wasm) {
	const code = Buffer.from(wasm)
	const baked = [
		Networks.PUBLIC,
		Networks.TESTNET,
		Networks.FUTURENET,
		Networks.STANDALONE,
	].filter((network) => code.includes(Asset.native().contractId(network)))
	if (baked.length)
		throw new Error(
			`The blog wasm has the XLM contract of ${baked.join(", ")} built in: it comes from an older checkout. Pull, delete target/release-wasm and run again.`,
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

/** Stop unless `server` is on the network these commands target. */
export async function checkRpc(server, network = net) {
	const { passphrase } = await server.getNetwork()
	if (passphrase !== network.passphrase)
		throw new Error(
			`${network.rpcUrl} is not ${network.label} (${passphrase}).`,
		)
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
	// An archived instance still comes back (live until ledger 0); the next
	// transaction that uses it restores it
	const { entries } = await server.getLedgerEntries(key)
	if (!entries.length) throw new Error(`There is no contract ${id}.`)
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

/** The pinned deployment's ID, if any: under mainnet: in scaffold.yml, or
 * a rehearsal's in target/rehearsal. */
const pinnedId = () =>
	rehearsal
		? existsSync(rehearsalPin)
			? readFileSync(rehearsalPin, "utf8").trim()
			: undefined
		: pinned().mainnet?.source

/** The pinned deployment, checked: it must exist and not be the testnet pin. */
const blogId = () => validateMainnetId(pinnedId(), pinned().testnet?.source)

function pin(id) {
	if (rehearsal) {
		mkdirSync(dirname(rehearsalPin), { recursive: true })
		writeFileSync(rehearsalPin, `${id}\n`)
		return `Deployed and pinned in ${rehearsalPin}: ${id}`
	}
	writeFileSync(resolve(root, "scaffold.yml"), pinMainnet(config(), id))
	return `Deployed and pinned under mainnet: in scaffold.yml: ${id}`
}

/** The flags that point `stellar` at the network, signing with `alias`. */
const networkFlags = (alias) => [
	"--source-account",
	alias,
	"--rpc-url",
	net.rpcUrl,
	"--network-passphrase",
	net.passphrase,
]

/** What `operation` from `source` would cost in fees, in XLM, as the
 * network simulates it now: nothing is signed or sent. */
async function simulatedFee(server, source, operation) {
	const tx = new TransactionBuilder(new Account(source, "0"), {
		fee: "100",
		networkPassphrase: net.passphrase,
	})
		.addOperation(operation)
		.setTimeout(30)
		.build()
	const result = await server.simulateTransaction(tx)
	if (rpc.Api.isSimulationError(result))
		throw new Error(result.error.split("\n")[0])
	return {
		xlm: Number(result.minResourceFee) / 1e7,
		value: result.result && scValToNative(result.result.retval),
	}
}

const xlm = (amount) => `${amount.toFixed(2)} XLM`

const contractUrl = (id) =>
	`https://stellar.expert/explorer/${net.expert}/contract/${id}`

/** Ask for `word`; anything else stops with nothing sent. */
async function confirm(word) {
	const rl = createInterface({ input: process.stdin, output: process.stdout })
	const answer = await rl.question(`Type "${word}" to send it: `)
	rl.close()
	if (answer.trim() !== word) throw new Error("Nothing was sent.")
}

/** Run `stellar` with this project's tools, and the key store `env`. */
const stellar = (args, env = toolEnv(), options = {}) =>
	execFileSync("stellar", args, {
		cwd: root,
		encoding: "utf8",
		env,
		stdio: ["ignore", "pipe", "inherit"],
		...options,
	})?.trim() ?? ""

/** Compile the blog into target/release-wasm, as the README's hash check
 * does, and return its hash. */
function build() {
	mkdirSync(targetDir, { recursive: true })
	stellar(
		["contract", "build", "--package", CRATE],
		{ ...toolEnv(), CARGO_TARGET_DIR: targetDir },
		{ stdio: ["ignore", "inherit", "inherit"] },
	)
	const wasm = readFileSync(wasmPath)
	checkNetworkFree(wasm)
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

/** Clients for the pinned blog, from the local build, after checking the
 * deployment on chain matches it. */
async function clients(server) {
	const id = blogId()
	await checkRpc(server)
	const local = build()
	const { wasmHash: deployed } = await deployedInstance(id, server)
	if (deployed !== local)
		console.warn(
			`The blog on ${net.label} runs wasm ${deployed.slice(0, 12)}…; this checkout builds ${local.slice(0, 12)}…. The client follows this checkout's contract: upgrade the blog (npm run upgrade:mainnet) or check out the code it runs.`,
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
		`// ${net.label}: written by scripts/mainnet.mjs for the blog at ${id}.
// \`npm run dev\` writes the testnet clients back.
import { Client as Blog } from "./blog/dist/index.js"
export const options = {
  networkPassphrase: "${net.passphrase}",
  rpcUrl: "${net.rpcUrl}",
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
	console.log(`Clients ready for the blog at ${id} on ${net.label}.`)
	return id
}

async function deploy(alias, server) {
	if (!alias) throw new Error("usage: npm run deploy:mainnet -- <key-alias>")
	await checkRpc(server)
	const existing = pinnedId()
	if (existing)
		throw new Error(
			`The blog is already pinned at ${existing} (${rehearsal ? rehearsalPin : "mainnet: in scaffold.yml"}). Remove that pin to deploy a new one.`,
		)
	const { where, env, address } = keyStore(alias)
	const account = await server.getAccount(address).catch(() => {
		throw new Error(
			`${address} (${alias}) has no account on ${net.label}: fund it first.`,
		)
	})
	const hash = build()
	const { xlm: upload } = await simulatedFee(
		server,
		address,
		Operation.uploadContractWasm({ wasm: readFileSync(wasmPath) }),
	)
	console.log(`
Deploy the blog to ${net.label}
  from      ${address} (${alias}, ${where}), sequence ${account.sequenceNumber()}
  admin     ${address} (${alias}): the one address that may upgrade the blog
  wasm      ${hash}
  pays in   XLM, contract ${Asset.native().contractId(net.passphrase)}
  network   ${net.rpcUrl}
  fees      ${xlm(upload)} to upload the code (simulated just now: mostly
            its rent for the network's minimum lifetime), then about 0.05 XLM
            to create the contract, in${rehearsal ? " testnet" : " real"} XLM`)
	await confirm("deploy")
	const id = stellar(
		[
			"contract",
			"deploy",
			"--wasm",
			wasmPath,
			...networkFlags(alias),
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
	console.log(`${pin(id)}
${contractUrl(id)}`)
	await clients(server)
	console.log(`Next: npm run dev:mainnet (http://localhost:${devPort(root)})`)
}

async function upgrade(alias, server) {
	if (!alias) throw new Error("usage: npm run upgrade:mainnet -- <key-alias>")
	await checkRpc(server)
	const id = blogId()
	const { where, env, address } = keyStore(alias)
	const { wasmHash: deployed, admin } = await deployedInstance(id, server)
	if (!admin)
		throw new Error(
			`The blog ${id} has no admin: it was deployed before the blog could be upgraded. Deploy a new one.`,
		)
	if (admin !== address)
		throw new Error(
			`${alias} is ${address}, but only ${admin} may upgrade the blog at ${id}.`,
		)
	const hash = build()
	if (hash === deployed)
		throw new Error(`The blog already runs this code (${hash}).`)
	const { xlm: upload } = await simulatedFee(
		server,
		address,
		Operation.uploadContractWasm({ wasm: readFileSync(wasmPath) }),
	)
	console.log(`
Upgrade the blog on ${net.label}
  blog      ${id}
  admin     ${address} (${alias}, ${where})
  code      ${deployed} → ${hash}
  network   ${net.rpcUrl}
  fees      ${xlm(upload)} to upload the code (simulated just now), then under
            0.01 XLM to switch to it, in${rehearsal ? " testnet" : " real"} XLM
Posts, comments and tips stay; the contract ID does not change.`)
	await confirm("upgrade")
	const network = networkFlags(alias)
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
${contractUrl(id)}`)
	await clients(server)
}

/**
 * Extend the blog's instance, its code, and every post with its stats to the
 * network's maximum lifetime (180 days on mainnet), restoring anything
 * archived: one `keep_alive` call per page of 20 posts. Comments are written
 * once and read even when archived, so they are left as they are.
 */
async function keepAlive(alias, server) {
	if (!alias)
		throw new Error("usage: npm run keep-alive:mainnet -- <key-alias>")
	await checkRpc(server)
	const id = blogId()
	const { where, env, address } = keyStore(alias)
	const blog = new Contract(id)
	const u32 = (n) => nativeToScVal(n, { type: "u32" })
	const { value: count } = await simulatedFee(
		server,
		address,
		blog.call("post_count"),
	)
	const firsts = []
	for (let first = 1; first <= Math.max(count, 1); first += 20)
		firsts.push(first)
	let fees = 0
	for (const first of firsts)
		try {
			fees += (
				await simulatedFee(
					server,
					address,
					blog.call("keep_alive", u32(first), u32(20)),
				)
			).xlm
		} catch (error) {
			throw new Error(
				`keep_alive can't run on the blog at ${id} (${error.message}). A blog deployed before keep_alive existed needs \`npm run upgrade:mainnet\` first.`,
			)
		}
	console.log(`
Keep the blog alive on ${net.label}
  blog      ${id}
  posts     ${count}, in ${firsts.length} call${firsts.length === 1 ? "" : "s"} of keep_alive
  paid by   ${address} (${alias}, ${where})
  fees      ${xlm(fees)} (simulated just now), in${rehearsal ? " testnet" : " real"} XLM: rent for the time
            each entry gains up to the maximum lifetime, and a restore for
            anything archived. Run it again sooner and it costs less.`)
	await confirm("keep")
	for (const first of firsts) {
		// keep_alive writes no data, only lifetimes, so the CLI would take it
		// for a read and not send it
		stellar(
			[
				"contract",
				"invoke",
				"--id",
				id,
				...networkFlags(alias),
				"--send=yes",
				"--",
				"keep_alive",
				"--first",
				String(first),
				"--limit",
				"20",
			],
			env,
		)
		console.log(
			count
				? `Kept posts ${first}–${Math.min(first + 19, count)}.`
				: "Kept the blog.",
		)
	}
	console.log(`The blog and its ${count} posts live for the network's maximum from now.
${contractUrl(id)}`)
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
	const server = new rpc.Server(net.rpcUrl)
	if (rehearsal)
		console.log(
			"BLOG_REHEARSAL=testnet: rehearsing on testnet. Nothing here touches mainnet.",
		)
	const [alias] = rest
	if (command === "deploy") return deploy(alias, server)
	if (command === "upgrade") return upgrade(alias, server)
	if (command === "keep-alive") return keepAlive(alias, server)
	if (command === "clients") return clients(server)
	if (command === "dev") return dev(server)
	throw new Error(
		"usage: node scripts/mainnet.mjs deploy <key-alias> | upgrade <key-alias> | keep-alive <key-alias> | clients | dev",
	)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
	main().catch((error) => {
		console.error(error.message)
		process.exitCode = 1
	})
