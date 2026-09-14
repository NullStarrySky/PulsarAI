import type { ParamDefinition, Provider, RequestKind } from "../types";

const blockedSegments = new Set(["__proto__", "constructor", "prototype"]);

function segments(path: string) {
	const result = path.split(".").map((part) => part.trim());
	if (
		!result.length ||
		result.some((part) => !part || blockedSegments.has(part))
	) {
		throw new Error(`无效的参数访问链：${path}`);
	}
	return result;
}

/** Assigns a value without ever replacing an existing incompatible branch. */
export function setParamPath(
	target: Record<string, unknown>,
	path: string,
	value: unknown,
) {
	const parts = segments(path);
	let current = target;
	for (const part of parts.slice(0, -1)) {
		const existing = current[part];
		if (existing === undefined) {
			const next: Record<string, unknown> = {};
			current[part] = next;
			current = next;
			continue;
		}
		if (!isRecord(existing)) {
			throw new Error(`参数 ${path} 与已有参数类型不兼容。`);
		}
		current = existing;
	}
	const key = parts.at(-1)!;
	if (current[key] !== undefined) {
		if (isRecord(current[key]) && isRecord(value)) {
			mergeObject(current[key], value, path);
			return;
		}
		throw new Error(`参数 ${path} 重复。`);
	}
	current[key] = value;
}

export function buildRequestParams(provider: Provider, kind: RequestKind) {
	const params: Record<string, unknown> = {};
	for (const definition of [
		...provider.params.basic,
		...provider.params[kind],
	]) {
		if (!definition.paramName.trim()) continue;
		setParamPath(params, definition.paramName, definition.value);
	}
	const providerOptions: Record<string, unknown> = {};
	for (const definition of provider.params.provider) {
		if (!definition.paramName.trim()) continue;
		setParamPath(providerOptions, definition.paramName, definition.value);
	}
	if (Object.keys(providerOptions).length)
		params.providerOptions = providerOptions;
	return params;
}

export function defaultParam(definition: ParamDefinition) {
	return { ...definition, value: structuredClone(definition.defaultValue) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeObject(
	target: Record<string, unknown>,
	source: Record<string, unknown>,
	path: string,
) {
	for (const [key, value] of Object.entries(source)) {
		if (target[key] === undefined) {
			target[key] = value;
			continue;
		}
		if (isRecord(target[key]) && isRecord(value)) {
			mergeObject(target[key], value, `${path}.${key}`);
			continue;
		}
		throw new Error(`参数 ${path}.${key} 重复或类型不兼容。`);
	}
}
