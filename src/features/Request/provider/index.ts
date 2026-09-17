import { createSandboxFunction } from "@/features/Plugin/runtime/sandbox";
import type { Component } from "vue";
import type { Provider } from "../types";
import { automatic1111 } from "./automatic1111";
import { comfyui } from "./comfyui";
import { edgeTts } from "./edge-tts";
import { novelai } from "./novelai";
import { piper } from "./piper";
import LocalModelDownload from "./shared/components/LocalModelDownload.vue";
import SecretInput from "./shared/components/SecretInput.vue";
import type { ProviderRegistration } from "./definition";
import { stability } from "./stability";
import { volcengineTts } from "./volcengine-tts";
import { whisperCandle } from "./whisper-candle";

const registrations: ProviderRegistration[] = [
	automatic1111,
	comfyui,
	novelai,
	stability,
	edgeTts,
	piper,
	whisperCandle,
	volcengineTts,
];
export const localRequestProviders: Provider[] = registrations.map(
	({ provider }) => provider,
);
export const builtInFunctions = new Map<string, Function>([
	["listOpenAIModels", listOpenAIModels],
	...registrations.flatMap(({ functions = {} }) => Object.entries(functions)),
]);
export const builtInComponents = new Map<string, Component>([
	["SecretInput", SecretInput],
	["PiperModelDownload", LocalModelDownload],
	["WhisperModelDownload", LocalModelDownload],
	...registrations.flatMap(({ components = {} }) => Object.entries(components)),
]);
export async function invokeRequestFunction<T>(
	source: string,
	context: Record<string, unknown>,
): Promise<T> {
	const builtIn = builtInFunctions.get(source);
	return (
		builtIn
			? await builtIn(context)
			: await createSandboxFunction(source)(context)
	) as T;
}

async function listOpenAIModels({ provider }: { provider: Provider }) {
	const baseURL = value(provider, "baseURL");
	const apiKeyName = value(provider, "apiKeyName");
	if (!baseURL || !apiKeyName)
		throw new Error(`提供商 ${provider.name} 缺少 baseURL 或 apiKeyName。`);
	const { modelProxyFetch } = await import("./shared/custom-fetch");
	const response = await modelProxyFetch(`${baseURL.replace(/\/+$/, "")}/models`, {
		headers: { Authorization: `Bearer <<${apiKeyName}>>` },
	});
	if (!response.ok)
		throw new Error(`获取 ${provider.name} 模型失败 (${response.status})。`);
	const payload = (await response.json()) as { data?: unknown };
	const models = Array.isArray(payload.data) ? payload.data : [];
	return {
		text: models.flatMap((item) => {
			if (!item || typeof item !== "object") return [];
			const id = (item as { id?: unknown }).id;
			return typeof id === "string"
				? [{ id, displayName: id, enabled: true }]
				: [];
		}),
	};
}

function value(provider: Provider, name: string) {
	const value = provider.params.basic.find(
		(param) => param.paramName === name,
	)?.value;
	return typeof value === "string" ? value.trim() : "";
}
