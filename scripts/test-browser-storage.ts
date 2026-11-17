// Node 25 exposes a partial localStorage without a backing file. Tests use an
// in-memory browser-style store; production uses the browser's real storage.
const values = new Map<string, string>()
Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
		removeItem: (key: string) => values.delete(key),
		clear: () => values.clear(),
	},
})
