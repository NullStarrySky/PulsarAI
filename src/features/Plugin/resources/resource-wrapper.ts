import { parsePluginChatContext } from "@/features/Plugin/editors/chat/plugin-chat";
import {
	createDataFacade,
	parsePluginDataDefinition,
} from "@/features/Plugin/editors/data/plugin-data";
import { executeSandboxCodeAsync } from "@/features/Sandbox/sandbox";
import { evaluateResourceCondition } from "./resource-condition";
import type { PluginLogger } from "@/features/Plugin/runtime/logger";
import type { ResourceFile } from "./resource-types";
import {
	binaryContent,
	type PluginResource,
	resourceType,
	textContent,
} from "./resource-types";

export interface ResourceImportEnvironment extends Record<string, unknown> {
	imports?: (path: string | string[]) => unknown | Promise<unknown>;
	logger?: PluginLogger;
}

function describe(value: unknown) {
	if (typeof value === "string") return value.length > 240 ? `${value.slice(0, 240)}…` : value;
	try { return JSON.stringify(value).slice(0, 240); } catch { return String(value); }
}

function parseJson(source: string): unknown {
	try {
		return JSON.parse(source);
	} catch {
		return source;
	}
}

export function wrapResource(file: ResourceFile): PluginResource {
	const type = resourceType(file);
	return {
		file,
		type,
		read: () => (type === "media" ? binaryContent(file) : textContent(file)),
		import(environment: ResourceImportEnvironment) {
			const logger = environment.logger;
			logger?.append(`进入文件：${file.name}`, 0, "enter", file.id);
			if (file.conditionEnabled !== false && file.condition?.trim()) {
				try {
					if (!evaluateResourceCondition(file.condition, environment)) {
						logger?.append(`条件未通过：${file.condition}`, 1, "condition", file.id);
						logger?.append("退出文件：条件未通过", 0, "exit", file.id);
						return undefined;
					}
					logger?.append(`条件通过：${file.condition}`, 1, "condition", file.id);
				} catch (error) {
					logger?.append(`条件执行失败：${error instanceof Error ? error.message : String(error)}`, 1, "error", file.id);
					logger?.append("退出文件：条件执行失败", 0, "exit", file.id);
					throw error;
				}
			}
			const text = textContent(file);
			const result = type === "markdown" ? text
				: type === "chat" ? parsePluginChatContext(text)
				: type === "data" ? createDataFacade({ name: file.name, wrapperSource: parsePluginDataDefinition(text).wrapperSource }, parsePluginDataDefinition(text).initialValue, { readonly: true })
				: type === "json" ? parseJson(text)
				: type === "javascript" ? executeSandboxCodeAsync(text, [environment])
				: type === "media" ? new TextEncoder().encode(text).buffer : text;
			if (result instanceof Promise) return result.then(value => {
				logger?.append(`退出文件，结果：${describe(value)}`, 0, "exit", file.id);
				return value;
			}, error => { logger?.append(`退出文件，执行失败：${error instanceof Error ? error.message : String(error)}`, 0, "error", file.id); throw error; });
			logger?.append(`退出文件，结果：${describe(result)}`, 0, "exit", file.id);
			return result;
		},
	};
}
