import { readFile, resolveResourcePath } from "../dataflow/pulse";
import {
	type PluginData,
	type ResourcePath,
	resourceType,
} from "../dataflow/types";
import { evaluateResourceCondition } from "./resource-condition";
import { parsePluginChatContext } from "./types/chat/plugin-chat";
import { importJavaScript } from "./types/javascript/plugin-javascript";

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

/** Imports exactly one source resource. Recursive macro parsing remains the Sandbox caller's job. */
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
		meta.conditionEnabled !== false &&
		meta.condition?.trim() &&
		!evaluateResourceCondition(meta.condition, environment)
	)
		return undefined;
	const type = resourceType(resolvedPath);
	if (type === "markdown" || type === "text" || type === "component")
		return source;
	if (type === "chat") return parsePluginChatContext(source);
	if (type === "json") return parseJson(source);
	if (type === "javascript") return importJavaScript(source, environment);
	return source;
}
