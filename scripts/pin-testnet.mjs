// After `npm run deploy:testnet`: pin each contract's new testnet-dev
// deployment under `testnet:` in scaffold.yml.
//
// `npm run dev` watches the network in .env, `testnet`, where a contract only
// exists once its ID is listed. Without the pin, the dev server regenerates
// the clients without your contract. Edits only the `testnet:` entries and
// leaves the rest of the file (comments included) as it was.
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { parseDocument } from "yaml"
import { root } from "./tools.mjs"

const statePath = resolve(root, ".scaffold/state.json")
const configPath = resolve(root, "scaffold.yml")
const deployed = existsSync(statePath)
	? (JSON.parse(readFileSync(statePath, "utf8")).networks?.["testnet-dev"]
			?.contracts ?? {})
	: {}

let text = readFileSync(configPath, "utf8")
const pinned = []
const manual = []
for (const [name, { "contract-id": id }] of Object.entries(deployed)) {
	const doc = parseDocument(text)
	const path = ["contracts", name, "networks"]
	if (doc.getIn([...path, "testnet", "source"]) === id) continue
	const next = pin(text, doc, path, id)
	if (
		next &&
		parseDocument(next).getIn([...path, "testnet", "source"]) === id
	) {
		text = next
		pinned.push(`  ${name}: ${id}`)
	} else manual.push({ name, id })
}
writeFileSync(configPath, text)
if (pinned.length)
	console.log(
		`Pinned under testnet: in scaffold.yml (npm run dev uses them):\n${pinned.join("\n")}`,
	)
for (const { name, id } of manual)
	console.log(
		`Add this under contracts.${name}.networks in scaffold.yml:\n      testnet:\n        type: contract\n        source: ${id}`,
	)

/** scaffold.yml text with `testnet:` for `path` pointing at `id`, or
 * undefined when the file's shape is not one this can edit. */
function pin(source, doc, path, id) {
	const networks = doc.getIn(path, true)
	if (!networks?.items) return undefined
	const testnet = networks.items.find((p) => p.key?.value === "testnet")
	if (testnet?.value?.items) {
		const edits = []
		for (const [key, value] of [
			["type", "contract"],
			["source", id],
		]) {
			const node = testnet.value.get(key, true)
			if (!node?.range) return undefined
			edits.push([node.range[0], node.range[1], value])
		}
		return edits
			.sort((a, b) => b[0] - a[0])
			.reduce(
				(s, [from, to, value]) => s.slice(0, from) + value + s.slice(to),
				source,
			)
	}
	if (testnet) return undefined
	// No testnet entry yet: add one just before testnet-dev's, same indent.
	const dev = networks.items.find((p) => p.key?.value === "testnet-dev")
	if (!dev?.key?.range) return undefined
	const at = source.lastIndexOf("\n", dev.key.range[0]) + 1
	const indent = source.slice(at, dev.key.range[0])
	if (indent.trim()) return undefined
	return `${source.slice(0, at)}${indent}testnet:\n${indent}  type: contract\n${indent}  source: ${id}\n${source.slice(at)}`
}
