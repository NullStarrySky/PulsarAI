declare module "vue3-sfc-loader" {
	export function loadModule(
		path: string,
		options?: Record<string, unknown>,
	): Promise<unknown>;
}
