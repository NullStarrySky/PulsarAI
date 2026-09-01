import { parsePluginChatContext } from "@/features/Plugin/editors/chat/plugin-chat";
import {
	createDataFacade,
	parsePluginDataDefinition,
} from "@/features/Plugin/editors/data/plugin-data";
import { executeSandboxCodeAsync } from "@/features/Sandbox/sandbox";
import type { ResourceFile } from "./resource-types";
import {
	binaryContent,
	type PluginResource,
	resourceType,
	textContent,
} from "./resource-types";

export interface ResourceImportEnvironment extends Record<string, unknown> {
	imports?: (path: string | string[]) => unknown | Promise<unknown>;
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
			const text = textContent(file);
			if (type === "markdown") return text;
			if (type === "chat") {
				return parsePluginChatContext(text);
			}
			if (type === "data") {
				const definition = parsePluginDataDefinition(text);
				return createDataFacade(
					{ name: file.name, wrapperSource: definition.wrapperSource },
					definition.initialValue,
					{ readonly: true },
				);
			}
			if (type === "json") return parseJson(text);
			if (type === "javascript")
				return executeSandboxCodeAsync(text, [environment]);
			return type === "media" ? new TextEncoder().encode(text).buffer : text;
		},
	};
}
