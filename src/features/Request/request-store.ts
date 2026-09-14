import { defineStore } from "pinia";
import {
	remove,
	selectAll,
	upsert,
} from "@/features/Database/database-service";
import { invokeRequestFunction, localRequestProviders } from "./provider";
import type {
	ModelApiType,
	ModelProviderDefinition,
} from "./provider/shared/legacy-model-catalog";
import { builtinModelProviders } from "./provider/shared/model-catalog";
import type {
	ModelDefinition,
	ParamDefinition,
	Provider,
	RequestKind,
} from "./types";

const table = "request_providers";

const kindByApiType: Partial<Record<ModelApiType, RequestKind>> = {
	chat: "text",
	image: "image",
	video: "video",
	tts: "speech",
	asr: "transcribe",
};

function param(paramName: string, value: unknown): ParamDefinition {
	return {
		paramName,
		enableInDefault: false,
		paramComponent: { component: "input", componentParam: {} },
		defaultValue: value,
		value,
	};
}

function emptyModels(): Provider["models"] {
	return { text: [], image: [], video: [], speech: [], transcribe: [] };
}

function fromModelProvider(source: ModelProviderDefinition): Provider {
	const models = emptyModels();
	for (const model of source.models) {
		const kind = kindByApiType[model.apiType];
		if (!kind) continue;
		models[kind].push({
			id: model.id,
			displayName: model.name,
			enabled: model.enabled,
			icon: model.iconUrl,
			extraInfo: {
				...(model.contextSize
					? { contextSize: String(model.contextSize) }
					: {}),
				...(model.knowledgeCutoff
					? { knowledgeCutoff: model.knowledgeCutoff }
					: {}),
			},
		});
	}
	return {
		id: source.id,
		name: source.name,
		description: source.description,
		icon: source.iconUrl ?? source.icon,
		enabled: source.enabled,
		params: {
			basic: [
				param("baseURL", source.baseUrl),
				param("apiKeyName", source.apiKeyName),
			],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models,
		...(source.transport === "openai-compatible"
			? { hydrator: "openai-compatible" }
			: {}),
		requestOverride: {},
	};
}

function cloneBuiltinProviders() {
	return [
		...builtinModelProviders.map(fromModelProvider),
		...structuredClone(localRequestProviders),
	];
}

export const useRequestStore = defineStore("request", {
	state: () => ({
		providers: cloneBuiltinProviders() as Provider[],
		loaded: false,
	}),
	actions: {
		async initialize() {
			if (this.loaded) return;
			const persisted = await selectAll<Provider>(table);
			const byId = new Map(
				this.providers.map((provider) => [provider.id, provider]),
			);
			for (const { value } of persisted) byId.set(value.id, value);
			this.providers = [...byId.values()];
			this.loaded = true;
		},
		provider(id: string) {
			return this.providers.find((provider) => provider.id === id);
		},
		async save(provider: Provider) {
			const index = this.providers.findIndex((item) => item.id === provider.id);
			if (index < 0) this.providers.push(provider);
			else this.providers[index] = provider;
			await upsert(table, provider.id, provider);
		},
		async addProvider(provider: Provider) {
			const id = provider.id.trim();
			if (!id || this.provider(id)) throw new Error("提供商 id 为空或已存在。");
			provider.id = id;
			this.providers.push(provider);
			await this.save(provider);
		},
		async deleteProvider(providerId: string) {
			if (!this.provider(providerId)) return;
			this.providers = this.providers.filter((item) => item.id !== providerId);
			await remove(table, providerId);
		},
		async patchProvider(providerId: string, patch: Partial<Provider>) {
			const provider = this.provider(providerId);
			if (!provider) return;
			Object.assign(provider, patch);
			await this.save(provider);
		},
		async addModel(
			providerId: string,
			kind: RequestKind,
			model: ModelDefinition,
		) {
			const provider = this.provider(providerId);
			if (!provider) return;
			if (provider.models[kind].some((item) => item.id === model.id)) {
				throw new Error("该类型下的模型 id 已存在。");
			}
			provider.models[kind].push(model);
			await this.save(provider);
		},
		async upsertModels(
			providerId: string,
			kind: RequestKind,
			models: ModelDefinition[],
		) {
			const provider = this.provider(providerId);
			if (!provider) return 0;
			let added = 0;
			for (const model of models) {
				const existing = provider.models[kind].find(
					(item) => item.id === model.id,
				);
				if (existing)
					Object.assign(existing, { ...model, enabled: existing.enabled });
				else {
					provider.models[kind].push(model);
					added += 1;
				}
			}
			await this.save(provider);
			return added;
		},
		async removeModel(providerId: string, kind: RequestKind, modelId: string) {
			const provider = this.provider(providerId);
			if (!provider) return;
			provider.models[kind] = provider.models[kind].filter(
				(item) => item.id !== modelId,
			);
			await this.save(provider);
		},
		async refreshModels(providerId: string) {
			const provider = this.provider(providerId);
			if (!provider?.modelGetter) return 0;
			const result = await invokeRequestFunction<
				Partial<Record<RequestKind, ModelDefinition[]>> | ModelDefinition[]
			>(provider.modelGetter, { provider });
			let added = 0;
			if (Array.isArray(result)) {
				added += await this.upsertModels(providerId, "text", result);
			} else {
				for (const kind of [
					"text",
					"image",
					"video",
					"speech",
					"transcribe",
				] as const) {
					if (result[kind])
						added += await this.upsertModels(providerId, kind, result[kind]);
				}
			}
			return added;
		},
		async patchParam(
			providerId: string,
			kind: keyof Provider["params"],
			paramName: string,
			value: unknown,
		) {
			const provider = this.provider(providerId);
			const definition = provider?.params[kind].find(
				(item) => item.paramName === paramName,
			);
			if (!provider || !definition) return;
			definition.value = value;
			await this.save(provider);
		},
	},
});

export function requestKindForApiType(
	apiType: ModelApiType,
): RequestKind | undefined {
	return kindByApiType[apiType];
}

export function requestModels(
	provider: Provider,
	kind: RequestKind,
): ModelDefinition[] {
	return provider.models[kind];
}
