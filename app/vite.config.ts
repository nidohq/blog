import { copyFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { type Plugin, defineConfig, loadEnv } from "vite"
import { nodePolyfills } from "vite-plugin-node-polyfills"
import wasm from "vite-plugin-wasm"

// PORT and BASE_PATH live in the root .env (a value set in the shell wins)
const rootEnv = (mode: string) =>
	loadEnv(mode, fileURLToPath(new URL("..", import.meta.url)), "")

// GitHub Pages has no rewrites: a refresh on /posts/3 finds no file and gets
// 404.html. Making that the app keeps client-side routes working.
const pagesFallback = (): Plugin => ({
	name: "pages-404-fallback",
	apply: "build",
	writeBundle({ dir }) {
		if (dir) copyFileSync(join(dir, "index.html"), join(dir, "404.html"))
	},
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
	// Where the app is served: /blog/ on GitHub Pages
	base: rootEnv(mode).BASE_PATH || "/",
	plugins: [
		react(),
		nodePolyfills({
			include: ["buffer"],
			globals: {
				Buffer: true,
			},
		}),
		wasm(),
		pagesFallback(),
	],
	build: {
		target: "esnext",
	},
	resolve: {
		// Generated clients can carry their own install (see
		// scripts/link-clients.mjs); one SDK copy keeps XDR types compatible.
		dedupe: ["@stellar/stellar-sdk"],
	},
	optimizeDeps: {
		exclude: ["@stellar/stellar-xdr-json"],
	},
	define: {
		global: "window",
	},
	envPrefix: "PUBLIC_",
	server: {
		// One fixed port per app (PORT in the root .env): Nido sessions live in
		// the origin's localStorage, so a server that drifted to another port
		// would have none. Fail loudly instead.
		port: Number(rootEnv(mode).PORT) || 5173,
		strictPort: true,
		proxy: {
			"/friendbot": {
				target: "http://localhost:8000/friendbot",
				changeOrigin: true,
			},
		},
	},
	// The same fixed port, so a base-path preview keeps the dev server's
	// origin and with it the session.
	preview: {
		port: Number(rootEnv(mode).PORT) || 5173,
		strictPort: true,
	},
}))
