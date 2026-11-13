// Fold freshly generated contract clients back into the npm workspace.
//
// `stellar scaffold build --build-clients` installs each new client package
// outside the workspace, then moves it into app-lib/clients/<name> with its own
// node_modules (and lockfile). The app then loads two copies of @stellar/stellar-sdk, and
// TypeScript rejects the generated AssembledTransaction wherever app-lib
// expects its own (`submitContract(tx, address)` in every component). This
// removes those nested installs, pins each client to app-lib's SDK range, and
// reinstalls from the root so there is one copy. Safe to run repeatedly.
import { execFileSync } from "node:child_process"
import {
	existsSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from "node:fs"

const clientsDir = "app-lib/clients"
const sdk = JSON.parse(readFileSync("app-lib/package.json", "utf8"))
	.dependencies["@stellar/stellar-sdk"]
let changed = false
for (const entry of readdirSync(clientsDir, { withFileTypes: true })) {
	const dir = `${clientsDir}/${entry.name}`
	if (!entry.isDirectory() || !existsSync(`${dir}/package.json`)) continue
	for (const nested of ["node_modules", "package-lock.json"])
		if (existsSync(`${dir}/${nested}`)) {
			rmSync(`${dir}/${nested}`, { recursive: true, force: true })
			changed = true
		}
	const manifest = JSON.parse(readFileSync(`${dir}/package.json`, "utf8"))
	if (manifest.dependencies?.["@stellar/stellar-sdk"] !== sdk) {
		manifest.dependencies = {
			...manifest.dependencies,
			"@stellar/stellar-sdk": sdk,
		}
		writeFileSync(
			`${dir}/package.json`,
			`${JSON.stringify(manifest, null, 2)}\n`,
		)
		changed = true
	}
}
if (changed)
	execFileSync("npm", ["install", "--no-audit", "--no-fund"], {
		stdio: "inherit",
	})
console.log("Contract clients share app-lib's @stellar/stellar-sdk", sdk)
