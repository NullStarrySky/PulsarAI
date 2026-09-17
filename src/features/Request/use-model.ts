import { createSandboxFunction } from "@/features/Plugin/runtime/sandbox";
import { builtInFunctions } from "./provider";
import type { Provider, RequestKind } from "./types";
import { setParamPath } from "./utils/params";

type Operation = keyof Provider["requestOverride"];

export type ModelOverride = <T>(
	operation: Operation,
	options: Record<string, unknown>,
	native: (next?: Record<string, unknown>) => T,
) => T;

function modelKind(provider: Provider, modelId: string): RequestKind {
	for (const kind of [
		"text",
		"image",
		"video",
		"speech",
		"transcribe",
	] as const) {
		if (provider.models[kind].some((model) => model.id === modelId && model.enabled))
			return kind;
	}
	throw new Error(`模型 ${modelId} 未启用或不属于提供商 ${provider.name}。`);
}

function params(definitions: Provider["params"][RequestKind | "basic" | "provider"]) {
	const result: Record<string, unknown> = {};
	for (const definition of definitions) {
		if (definition.paramName.trim())
			setParamPath(result, definition.paramName, definition.value);
	}
	return result;
}

/** Resolves one enabled Provider model into request and provider option objects. */
export function useModel(provider: Provider, modelId: string) {
	if (!provider.enabled) throw new Error(`提供商 ${provider.name} 未启用。`);
	const kind = modelKind(provider, modelId);

	const hasOverrides = Object.keys(provider.requestOverride).length > 0;
	const override: ModelOverride | undefined = hasOverrides
		? (operation, options, native) => {
			const source = provider.requestOverride[operation];
			if (!source) return native(options);
			const fn = builtInFunctions.get(source) ?? createSandboxFunction(source);
			return fn({ provider, modelId, options, native }) as T;
		}
		: undefined;

	return {
		param: params([...provider.params.basic, ...provider.params[kind]]),
		providerParam: params(provider.params.provider),
		...(override ? { override } : {}),
	};
}
