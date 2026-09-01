import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

export default defineConfig(async (env) => {
	const baseConfig = await (typeof viteConfig === "function"
		? viteConfig(env)
		: viteConfig);
	return mergeConfig(baseConfig, {
		test: {
			include: ["src/**/*.test.ts"],
			exclude: ["refs/**", "node_modules/**"],
		},
	});
});
