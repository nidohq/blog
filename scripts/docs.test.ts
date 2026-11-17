import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// NIDO.md (people) and AGENTS.md (agents) describe the same template. Keep
// them from drifting apart, or from the commands that actually exist.
const read = (file: string) => {
	try {
		return readFileSync(file, "utf8")
	} catch {
		return ""
	}
}
const docs = ["README.md", "NIDO.md", "AGENTS.md"].map((file) => ({
	file,
	text: read(file),
}))
const scripts = Object.keys(
	(JSON.parse(read("package.json")) as { scripts: Record<string, string> })
		.scripts,
)
// Run from the template checkout; apps made from it don't carry it.
const templateOnly = new Set(["new-app"])

describe("docs", () => {
	it("name only npm scripts that exist", () => {
		for (const { file, text } of docs)
			for (const [, name] of text.matchAll(/npm run ([\w:-]+)/g))
				if (!templateOnly.has(name!))
					expect(scripts, `${file}: npm run ${name}`).toContain(name)
	})
	it("show the same call pattern for people and agents", () => {
		const snippet = (text: string) =>
			/## Calling a contract from React\n+```tsx\n([\s\S]*?)```/.exec(text)?.[1]
		const [nido, agents] = ["NIDO.md", "AGENTS.md"].map((file) =>
			snippet(read(file)),
		)
		expect(nido).toBeTruthy()
		expect(agents).toBe(nido)
	})
})
