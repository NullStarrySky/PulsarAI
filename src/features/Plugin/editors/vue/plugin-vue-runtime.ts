import { type Component, compile, defineComponent, markRaw } from "vue";
import type { WorldFileNode } from "@/features/Plugin/tree/world-types";

export interface PluginVueRuntimeResult {
	component: Component | null;
	diagnostics: string[];
}

export function compilePluginVueFile(
	file: WorldFileNode,
): PluginVueRuntimeResult {
	const diagnostics: string[] = [];
	const source = typeof file.content === "string" ? file.content : "";
	const template = /<template(?:\s[^>]*)?>([\s\S]*?)<\/template>/i.exec(
		source,
	)?.[1];
	if (template == null) {
		return { component: null, diagnostics: ["Vue 文件缺少 <template>。"] };
	}
	if (/<script\b/i.test(source)) {
		diagnostics.push(
			"动态插件组件暂不执行 <script>；状态与行为请通过模板插槽或 Feature API 提供。",
		);
	}
	try {
		return {
			component: markRaw(
				defineComponent({
					name: componentName(file.name),
					render: compile(template),
				}),
			),
			diagnostics,
		};
	} catch (error) {
		diagnostics.push(error instanceof Error ? error.message : String(error));
		return { component: null, diagnostics };
	}
}

function componentName(filename: string) {
	const name = filename
		.replace(/\.[^.]+$/, "")
		.split(/[^A-Za-z0-9]+/)
		.filter(Boolean)
		.map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
		.join("");
	return name || "PluginComponent";
}
