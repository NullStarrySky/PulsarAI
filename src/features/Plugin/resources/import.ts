import { readFile, resolveResourcePath } from "../dataflow/pulse";
import {
	defaultFileMeta,
	type PluginData,
	type ResourcePath,
	resourceType,
} from "../dataflow/types";
import {
	resolveSandboxMessagesAsync,
	resolveSandboxTextAsync,
} from "../runtime/sandbox";
import { evaluateResourceCondition } from "./resource-condition";
import { parsePluginChatContext } from "./types/chat/plugin-chat";
import { importJavaScript } from "./types/javascript/plugin-javascript";
import { compilePluginVueFile } from "./types/vue/plugin-vue-runtime";

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

function isModelMessage(value: unknown) {
	return Boolean(
		value && typeof value === "object" && "role" in value && "content" in value,
	);
}

function resolveImportedValue(
	value: unknown,
	environment: ResourceImportEnvironment,
) {
	if (typeof value === "string")
		return resolveSandboxTextAsync(value, [environment]);
	if (Array.isArray(value)) {
		if (value.every(isModelMessage))
			return resolveSandboxMessagesAsync(value, [environment]);
		return Promise.all(
			value.map((item) =>
				typeof item === "string"
					? resolveSandboxTextAsync(item, [environment])
					: item,
			),
		);
	}
	return value;
}

/** Imports one resource and recursively resolves text and chat macros by default. */
export function importResource(
	data: PluginData,
	path: ResourcePath,
	environment: ResourceImportEnvironment = {},
): unknown | Promise<unknown> {
	const resolvedPath = resolveResourcePath(
		String(environment.sourcePath ?? path),
		path,
	);
	const source = readFile(data, resolvedPath);
	const meta = data.meta[resolvedPath];
	if (
		meta &&
		"condition" in meta &&
		!evaluateResourceCondition(meta.condition, environment)
	)
		return undefined;
	const type = resourceType(resolvedPath);
	if (type === "component")
		return resolveSandboxTextAsync(source, [environment]).then((content) => {
			return compilePluginVueFile({
				...defaultFileMeta(),
				...meta,
				path: resolvedPath,
				content,
			}).component;
		});
	if (type === "markdown" || type === "text")
		return resolveImportedValue(source, environment);
	if (type === "chat")
		return resolveImportedValue(parsePluginChatContext(source), environment);
	if (type === "json") return parseJson(source);
	if (type === "javascript") return importJavaScript(source, environment);
	return source;
}
