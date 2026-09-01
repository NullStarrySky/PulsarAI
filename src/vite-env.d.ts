/// <reference types="vite/client" />

declare module "*.vue" {
	import type { DefineComponent } from "vue";

	const component: DefineComponent<{}, {}, any>;
	export default component;
}

declare module "*.mjs" {
	export function hydrateSecretPlaceholders(
		text: string,
		readSecret: (name: string) => Promise<string | null>,
	): Promise<string>;
	export function secretPreview(value: string): string;
}
