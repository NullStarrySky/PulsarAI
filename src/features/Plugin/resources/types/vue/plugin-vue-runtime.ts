import * as LucideIcons from "lucide-vue-next";
import * as Vue from "vue";
import { type Component, defineAsyncComponent, markRaw } from "vue";
import { loadModule } from "vue3-sfc-loader";
import * as FluidComponents from "@/components/fluid";
import * as DatabaseService from "@/features/Database/database-service";
import { host } from "@/host";
import type { ResourceFile } from "../../resource-types";

export interface PluginVueRuntimeResult {
	component: Component | null;
	error: string | null;
}

export async function loadPluginVueModule(
	source: string,
	filename = "component.vue",
) {
	return loadModule(filename, {
		moduleCache: {
			vue: Vue,
			"lucide-vue-next": LucideIcons,
			"@/components/fluid": FluidComponents,
			"@/features/Database/database-service": DatabaseService,
			"@/host": { host },
		} as Record<string, unknown>,
		getFile: async (url: string) =>
			url === filename ||
			url === `/${filename}` ||
			url.endsWith(filename) ||
			url.endsWith(".vue")
				? source
				: "",
		addStyle(text: string) {
			if (typeof document === "undefined") return;
			const style = document.createElement("style");
			style.textContent = text;
			style.setAttribute("data-plugin-vue-style", filename);
			document.head.appendChild(style);
		},
		log(type: string, ...args: unknown[]) {
			if (type === "error") console.error("[PluginVueRuntime]", ...args);
		},
	}) as Promise<Component>;
}

export function compilePluginVueFile(
	file: ResourceFile,
): PluginVueRuntimeResult {
	if (!file.content.trim())
		return { component: null, error: "Vue 文件内容为空。" };
	if (!/<template[\s>]/i.test(file.content))
		return { component: null, error: "Vue 文件缺少 <template>。" };
	return {
		component: markRaw(
			defineAsyncComponent(() =>
				loadPluginVueModule(
					file.content,
					file.path.split("/").at(-1) ?? "component.vue",
				),
			),
		),
		error: null,
	};
}
