import { parsePluginChatContext } from "@/features/Plugin/resources/types/chat/plugin-chat";
import {
	createDataFacade,
	parsePluginDataDefinition,
} from "@/features/Plugin/resources/types/data/plugin-data";
import type { PluginLogger } from "@/features/Plugin/runtime/logger";
import { executeSandboxCodeAsync } from "@/features/Sandbox/sandbox";
import { evaluateResourceCondition } from "./resource-condition";
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
	if (typeof value === "string")
		return value.length > 240 ? `${value.slice(0, 240)}…` : value;
	try {
		return JSON.stringify(value).slice(0, 240);
	} catch {
		return String(value);
	}
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
			logger?.append(`进入文件：${file.path}`, 0, "enter", file.path);
			if (file.conditionEnabled !== false && file.condition?.trim()) {
				try {
					if (!evaluateResourceCondition(file.condition, environment)) {
						logger?.append(
							`条件未通过：${file.condition}`,
							1,
							"condition",
							file.path,
						);
						logger?.append("退出文件：条件未通过", 0, "exit", file.path);
						return undefined;
					}
					logger?.append(
						`条件通过：${file.condition}`,
						1,
						"condition",
						file.path,
					);
				} catch (error) {
					logger?.append(
						`条件执行失败：${error instanceof Error ? error.message : String(error)}`,
						1,
						"error",
						file.path,
					);
					logger?.append("退出文件：条件执行失败", 0, "exit", file.path);
					throw error;
				}
			}
			const text = textContent(file);
			const result =
				type === "markdown"
					? text
					: type === "chat"
						? parsePluginChatContext(text)
						: type === "data"
							? createDataFacade(
									{
										name: file.path.split("/").at(-1) ?? file.path,
										wrapperSource:
											parsePluginDataDefinition(text).wrapperSource,
									},
									parsePluginDataDefinition(text).initialValue,
									{ readonly: true },
								)
							: type === "json"
								? parseJson(text)
								: type === "javascript"
									? executeSandboxCodeAsync(text, [environment])
									: type === "media"
										? new TextEncoder().encode(text).buffer
										: text;
			if (result instanceof Promise)
				return result.then(
					(value) => {
						logger?.append(
							`退出文件，结果：${describe(value)}`,
							0,
							"exit",
							file.path,
						);
						return value;
					},
					(error) => {
						logger?.append(
							`退出文件，执行失败：${error instanceof Error ? error.message : String(error)}`,
							0,
							"error",
							file.path,
						);
						throw error;
					},
				);
			logger?.append(
				`退出文件，结果：${describe(result)}`,
				0,
				"exit",
				file.path,
			);
			return result;
		},
	};
}
