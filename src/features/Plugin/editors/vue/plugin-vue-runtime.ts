import { type Component, defineAsyncComponent, markRaw } from "vue";
import * as Vue from "vue";
import * as LucideIcons from "lucide-vue-next";
import * as FluidComponents from "@/components/fluid";
import * as FileComposables from "@/features/Plugin/runtime/file-composables";
import * as DatabaseService from "@/features/Database/database-service";
import { host } from "@/host";
import { loadModule } from "vue3-sfc-loader";
import type { WorldFileNode } from "@/features/Plugin/tree/world-types";

export interface PluginVueRuntimeResult {
	component: Component | null;
	diagnostics: string[];
}

export async function loadPluginVueModule(
	source: string,
	filename = "component.vue",
): Promise<Component> {
	const options = {
		moduleCache: {
			vue: Vue,
			"lucide-vue-next": LucideIcons,
			"@/components/fluid": FluidComponents,
			"@/features/Plugin/runtime/file-composables": FileComposables,
			"@/features/Database/database-service": DatabaseService,
			"@/host": { host },
		} as Record<string, any>,
		async getFile(url: string) {
			if (
				url === filename ||
				url === `/${filename}` ||
				url.endsWith(filename) ||
				url.endsWith(".vue")
			) {
				return source;
			}
			return "";
		},
		addStyle(textContent: string) {
			if (typeof document === "undefined") return;
			const style = document.createElement("style");
			style.textContent = textContent;
			style.setAttribute("data-plugin-vue-style", filename);
			document.head.appendChild(style);
		},
		log(type: string, ...args: any[]) {
			if (type === "error") {
				console.error("[PluginVueRuntime]", ...args);
			}
		},
	};

	return (await loadModule(filename, options)) as Component;
}

export function compilePluginVueFile(
	file: WorldFileNode,
): PluginVueRuntimeResult {
	const diagnostics: string[] = [];
	const source = typeof file.content === "string" ? file.content : "";
	if (!source.trim()) {
		return { component: null, diagnostics: ["Vue 文件内容为空。"] };
	}
	if (!/<template[\s>]/i.test(source)) {
		diagnostics.push("Vue 文件缺少 <template>。");
	}

	try {
		const asyncComponent = defineAsyncComponent({
			loader: async () => {
				return await loadPluginVueModule(source, file.name);
			},
			onError(error, retry, fail) {
				console.error(`[PluginVueRuntime] 编译/加载 ${file.name} 失败:`, error);
				fail();
			},
		});

		return {
			component: markRaw(asyncComponent),
			diagnostics,
		};
	} catch (error) {
		diagnostics.push(error instanceof Error ? error.message : String(error));
		return { component: null, diagnostics };
	}
}
