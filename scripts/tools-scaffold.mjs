// `npm run tools:scaffold`: install the tested stellar-scaffold release into
// .tools/bin, inside this project. It downloads the official prebuilt binary
// (seconds, where `cargo install` compiles for 10 to 16 minutes) and changes
// nothing global; the npm scripts put .tools/bin first on PATH.
//
//   npm run tools:scaffold                  # the pinned release
//   npm run tools:scaffold -- --version 0.0.32
import { execFileSync } from "node:child_process"
import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { SCAFFOLD_PINNED, root, toolsBin, versionOf } from "./tools.mjs"

const flag = process.argv.indexOf("--version")
const version = flag > 0 ? process.argv[flag + 1] : SCAFFOLD_PINNED
const binary = join(toolsBin, "stellar-scaffold")

const installed = existsSync(binary) && versionOf(binary)
if (installed === version) {
	console.log(`stellar-scaffold ${version} is already in .tools/bin`)
	process.exit(0)
}

const targets = {
	"darwin-arm64": "aarch64-apple-darwin",
	"darwin-x64": "x86_64-apple-darwin",
	"linux-arm64": "aarch64-unknown-linux-gnu",
	"linux-x64": "x86_64-unknown-linux-gnu",
}
const target = targets[`${process.platform}-${process.arch}`]
const fromSource = `cargo install --locked stellar-scaffold-cli --version ${version} --root .tools`
if (!target) {
	console.error(
		`No prebuilt stellar-scaffold for ${process.platform}-${process.arch}. Build it into this project instead (10 to 16 minutes):\n  ${fromSource}`,
	)
	process.exit(1)
}

const tag = `stellar-scaffold-cli-v${version}`
const url = `https://github.com/stellar-scaffold/cli/releases/download/${tag}/${tag}-${target}.tar.gz`
console.log(`Downloading ${url}`)
const response = await fetch(url)
if (!response.ok) {
	console.error(
		`Download failed (${response.status}). Build it into this project instead:\n  ${fromSource}`,
	)
	process.exit(1)
}
const downloads = join(root, ".tools", "downloads")
mkdirSync(downloads, { recursive: true })
mkdirSync(toolsBin, { recursive: true })
const archive = join(downloads, `${tag}-${target}.tar.gz`)
writeFileSync(archive, Buffer.from(await response.arrayBuffer()))
rmSync(binary, { force: true })
execFileSync("tar", ["-xzf", archive, "-C", toolsBin, "stellar-scaffold"])
chmodSync(binary, 0o755)
const found = versionOf(binary)
if (found !== version) {
	console.error(
		`Installed binary reports ${found ?? "nothing"}, not ${version}`,
	)
	process.exit(1)
}
console.log(
	`stellar-scaffold ${version} installed in .tools/bin. npm scripts use it; for your shell, \`npm run stellar -- scaffold …\`.`,
)
