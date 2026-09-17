import { defineStore } from "pinia";
import { reactive, toRaw, watch } from "vue";
import { host } from "@/host";
import { localRequestProviders } from "./provider";
import {
	builtinModelProviders,
	type ModelApiType,
	type ModelProviderDefinition,
} from "./provider/shared/model-catalog";
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

function secret(name: string): ParamDefinition {
	return {
		...param("apiKeyName", name),
		title: "API Key",
		customBlockComponent: "SecretInput",
		paramComponent: { component: "secret", componentParam: { name } },
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
		icon: source.icon,
		iconUrl: source.iconUrl,
		enabled: source.enabled,
		params: {
			basic: [
				param("baseURL", source.baseUrl),
				secret(source.apiKeyName),
			],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models,
		modelGetter: source.modelGetter,
		...(source.transport === "openai-compatible"
			? { hydrator: "openai-compatible" }
			: {}),
		requestOverride: {},
	};
}

function builtinProviders() {
	return [
		...builtinModelProviders.map(fromModelProvider),
		...structuredClone(localRequestProviders),
	] as Provider[];
}

function snapshot(providers: Map<string, Provider>) {
	return new Map(
		[...providers].map(([id, provider]) => [
			id,
			JSON.stringify(toRaw(provider)),
		]),
	);
}

/** Provider records stay in memory; a watcher batches their persistence like dbsync. */
export const useRequestStore = defineStore("request", () => {
	const providers = reactive(
		new Map(builtinProviders().map((provider) => [provider.id, provider])),
	);
	let loaded = false;
	let initPromise: Promise<void> | undefined;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let pendingSync = Promise.resolve();
	let persisted = snapshot(providers);

	function scheduleSync() {
		if (!loaded || timer) return;
		timer = setTimeout(() => {
			timer = undefined;
			void _sync();
		}, 500);
	}

	async function _sync() {
		if (timer) clearTimeout(timer);
		timer = undefined;
		const next = snapshot(providers);
		const flush = pendingSync.then(async () => {
			for (const [id, value] of next) {
				if (persisted.get(id) === value) continue;
				await host.database.upsert(table, id, JSON.parse(value));
			}
			for (const id of persisted.keys()) {
				if (!next.has(id)) await host.database.remove(table, id);
			}
			persisted = next;
		});
		pendingSync = flush.catch((error) => {
			console.error("Request provider persistence failed.", error);
		});
		return flush;
	}

	watch(providers, scheduleSync, { deep: true, flush: "post" });

	function init() {
		if (loaded) return Promise.resolve();
		return (initPromise ??= host.database
			.selectAll<Provider>(table)
			.then((rows) => {
				for (const { value } of rows) providers.set(value.id, value);
				persisted = snapshot(providers);
				loaded = true;
			})
			.catch((error) => {
				initPromise = undefined;
				throw error;
			}));
	}

	return { providers, init, _sync };
});
