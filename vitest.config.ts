import { defineConfig } from "vitest/config"

export default defineConfig({
	test: {
		include: [
			"app-lib/**/*.test.ts",
			"vendor/**/*.test.ts",
			"scripts/**/*.test.ts",
		],
		setupFiles: ["./scripts/test-browser-storage.ts"],
	},
})
