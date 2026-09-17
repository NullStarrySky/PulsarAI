import {
	generateImage as baseGenerateImage,
	generateSpeech as baseGenerateSpeech,
	generateText as baseGenerateText,
	streamText as baseStreamText,
	transcribe as baseTranscribe,
	type EmbeddingModel,
	type ImageModel,
	type LanguageModel,
	type SpeechModel,
	type TranscriptionModel,
} from "ai";
import { writeMedia } from "@/features/Plugin/media/media-link";
import { createSandboxFunction } from "@/features/Plugin/runtime/sandbox";
import { useRequestDefaults } from "./defaults";
import {
	hydrateModel as hydrateLegacyModel,
	type HydratableModel as LegacyHydratableModel,
	registerProviderHydration,
} from "./provider/shared/native-ai";
import { builtInFunctions } from "./provider";
import { useRequestStore } from "./request-store";
import type { ModelSelection, Provider, RequestKind } from "./types";
import { useModel } from "./use-model";

export type HydratableModel =
	| ModelSelection
	| string
	| LanguageModel
	| ImageModel
	| EmbeddingModel
	| TranscriptionModel
	| SpeechModel;

export type GenerateImageResult = Awaited<ReturnType<typeof baseGenerateImage>>;
type WithModel<T> = T extends { model: unknown }
	? Omit<T, "model"> & { model: HydratableModel }
	: T;

export type GenerateImageOptions = Omit<
	Parameters<typeof baseGenerateImage>[0],
	"model"
> & { model?: HydratableModel };
export type GenerateSpeechOptions = Omit<
	Parameters<typeof baseGenerateSpeech>[0],
	"model"
> & { model?: HydratableModel };
export type TranscribeOptions = Omit<
	Parameters<typeof baseTranscribe>[0],
	"model"
> & { model?: HydratableModel };

function selectionFor(
	model: HydratableModel,
	kind: RequestKind,
): ModelSelection | undefined {
	if (typeof model === "object" && model && "providerId" in model) {
		return model as ModelSelection;
	}
	if (typeof model !== "string") return;
	const [providerId, ...parts] = model.split("/");
	return providerId && parts.length
		? { providerId, modelId: parts.join("/"), kind }
		: undefined;
}

function providerFor(model: HydratableModel, kind: RequestKind) {
	const selection = selectionFor(model, kind);
	return {
		selection,
		provider: selection
			? useRequestStore().providers.get(selection.providerId)
			: undefined,
	};
}

function providerValue(provider: Provider, name: string) {
	return provider.params.basic.find((param) => param.paramName === name)?.value;
}

function hydrateFromProvider(
	provider: Provider,
	modelId: string,
	kind: RequestKind,
) {
	const baseUrl = providerValue(provider, "baseURL");
	const apiKeyName = providerValue(provider, "apiKeyName");
	if (typeof baseUrl !== "string" || typeof apiKeyName !== "string") {
		throw new Error(`提供商 ${provider.id} 缺少 baseURL 或 apiKeyName。`);
	}
	registerProviderHydration({
		id: provider.id,
		baseUrl,
		apiKeyName,
		transport:
			provider.hydrator === "openai-compatible"
				? "openai-compatible"
				: "ai-sdk",
	});
	return hydrateLegacyModel(`${provider.id}/${modelId}`, legacyKind(kind));
}

function legacyKind(kind: RequestKind) {
	if (kind === "video") throw new Error("当前 AI SDK 水合器尚未支持视频模型。");
	return { text: "chat", image: "image", speech: "tts", transcribe: "asr" }[
		kind
	] as "chat" | "image" | "tts" | "asr";
}

export function hydrateRequestModel(model: HydratableModel, kind: RequestKind) {
	const { provider, selection } = providerFor(model, kind);
	if (!provider || !selection) return model as LegacyHydratableModel;
	if (
		!provider.models[kind].some(
			(item) => item.id === selection.modelId && item.enabled,
		)
	)
		throw new Error(`模型 ${selection.modelId} 未启用或不支持 ${kind}。`);
	useModel(provider, selection.modelId);
	const hydrator = provider.hydrator;
	if (!hydrator || hydrator === "ai-sdk" || hydrator === "openai-compatible") {
		return hydrateFromProvider(provider, selection.modelId, kind);
	}
	const builtIn = builtInFunctions.get(hydrator);
	const fn = builtIn ?? createSandboxFunction(hydrator);
	const result = fn({ provider, modelId: selection.modelId, kind });
	if (result instanceof Promise)
		throw new Error("模型水合器必须同步返回 AI SDK 模型。");
	return result as LegacyHydratableModel;
}

export function generateText(
	options: WithModel<Parameters<typeof baseGenerateText>[0]>,
) {
	const { provider, selection } = providerFor(options.model, "text");
	if (!provider || !selection)
		return baseGenerateText(options as Parameters<typeof baseGenerateText>[0]);
	const model = useModel(provider, selection.modelId);
	const input = {
		...model.param,
		...(Object.keys(model.providerParam).length
			? { providerOptions: model.providerParam }
			: {}),
		...options,
	};
	const native = (next: Record<string, unknown> = input) =>
		baseGenerateText({
			...next,
			model: hydrateRequestModel(
				(next.model as HydratableModel | undefined) ?? options.model,
				"text",
			),
		} as Parameters<typeof baseGenerateText>[0]);
	return model.override?.("generateText", input, native) ?? native();
}

export function streamText(
	options: WithModel<Parameters<typeof baseStreamText>[0]>,
) {
	const { provider, selection } = providerFor(options.model, "text");
	if (!provider || !selection)
		return baseStreamText(options as Parameters<typeof baseStreamText>[0]);
	const model = useModel(provider, selection.modelId);
	const input = {
		...model.param,
		...(Object.keys(model.providerParam).length
			? { providerOptions: model.providerParam }
			: {}),
		...options,
	};
	const native = (next: Record<string, unknown> = input) =>
		baseStreamText({
			...next,
			model: hydrateRequestModel(
				(next.model as HydratableModel | undefined) ?? options.model,
				"text",
			),
		} as Parameters<typeof baseStreamText>[0]);
	return model.override?.("streamText", input, native) ?? native();
}

export function generateImage(options: GenerateImageOptions) {
	const model = options.model ?? useRequestDefaults().defaults.imageModel;
	if (!model) throw new Error("尚未配置图片生成模型。");
	const inputOptions = { ...options, model };
	const { provider, selection } = providerFor(model, "image");
	if (!provider || !selection)
		return baseGenerateImage(
			inputOptions as Parameters<typeof baseGenerateImage>[0],
		);
	const selected = useModel(provider, selection.modelId);
	const input = {
		...selected.param,
		...(Object.keys(selected.providerParam).length
			? { providerOptions: selected.providerParam }
			: {}),
		...inputOptions,
	};
	const native = (next: Record<string, unknown> = input) =>
		baseGenerateImage({
			...next,
			model: hydrateRequestModel(
				(next.model as HydratableModel | undefined) ?? model,
				"image",
			),
		} as Parameters<typeof baseGenerateImage>[0]);
	return selected.override?.("generateImage", input, native) ?? native();
}

export async function generateImageToPath(
	options: GenerateImageOptions & { path?: string },
) {
	const { path = "temp", ...input } = options;
	const result = await generateImage(input);
	return (
		await writeMedia(result.image.uint8Array, result.image.mediaType, path)
	).id;
}

/** AI SDK 7 has no generic video helper yet; Providers must supply this override. */
export function generateVideo(
	options: { model: HydratableModel } & Record<string, unknown>,
) {
	const { provider, selection } = providerFor(options.model, "video");
	if (!provider || !selection)
		throw new Error("此提供商没有实现 generateVideo override。");
	const model = useModel(provider, selection.modelId);
	const input = {
		...model.param,
		...(Object.keys(model.providerParam).length
			? { providerOptions: model.providerParam }
			: {}),
		...options,
	};
	const native = () => {
		throw new Error("此提供商没有实现 generateVideo override。");
	};
	return model.override?.("generateVideo", input, native) ?? native();
}

export function generateSpeech(options: GenerateSpeechOptions) {
	const model = options.model ?? useRequestDefaults().defaults.speechModel;
	if (!model) throw new Error("尚未配置语音生成模型。");
	const inputOptions = { ...options, model };
	const { provider, selection } = providerFor(model, "speech");
	if (!provider || !selection)
		return baseGenerateSpeech(
			inputOptions as Parameters<typeof baseGenerateSpeech>[0],
		);
	const selected = useModel(provider, selection.modelId);
	const input = {
		...selected.param,
		...(Object.keys(selected.providerParam).length
			? { providerOptions: selected.providerParam }
			: {}),
		...inputOptions,
	};
	const native = (next: Record<string, unknown> = input) =>
		baseGenerateSpeech({
			...next,
			model: hydrateRequestModel(
				(next.model as HydratableModel | undefined) ?? model,
				"speech",
			),
		} as Parameters<typeof baseGenerateSpeech>[0]);
	return selected.override?.("generateSpeech", input, native) ?? native();
}

export function transcribe(options: TranscribeOptions) {
	const model =
		options.model ?? useRequestDefaults().defaults.transcriptionModel;
	if (!model) throw new Error("尚未配置语音转写模型。");
	const inputOptions = { ...options, model };
	const { provider, selection } = providerFor(model, "transcribe");
	if (!provider || !selection)
		return baseTranscribe(inputOptions as Parameters<typeof baseTranscribe>[0]);
	const selected = useModel(provider, selection.modelId);
	const input = {
		...selected.param,
		...(Object.keys(selected.providerParam).length
			? { providerOptions: selected.providerParam }
			: {}),
		...inputOptions,
	};
	const native = (next: Record<string, unknown> = input) =>
		baseTranscribe({
			...next,
			model: hydrateRequestModel(
				(next.model as HydratableModel | undefined) ?? model,
				"transcribe",
			),
		} as Parameters<typeof baseTranscribe>[0]);
	return selected.override?.("transcribe", input, native) ?? native();
}

/** Lets Provider overrides wrap ToolLoopAgent without creating a second Agent path. */
export function createToolLoopAgent<T>(
	model: HydratableModel,
	options: Record<string, unknown>,
	native: (options: Record<string, unknown>) => T,
): T {
	const { provider, selection } = providerFor(model, "text");
	if (!provider || !selection)
		return native({ ...options, model: hydrateRequestModel(model, "text") });
	const selected = useModel(provider, selection.modelId);
	const input = {
		...selected.param,
		...(Object.keys(selected.providerParam).length
			? { providerOptions: selected.providerParam }
			: {}),
		...options,
	};
	const callNative = (next: Record<string, unknown> = input) =>
		native({
			...next,
			model: hydrateRequestModel(
				(next.model as HydratableModel | undefined) ?? model,
				"text",
			),
		});
	const result = selected.override?.("ToolLoopAgent", input, callNative) ?? callNative();
	if (result instanceof Promise) {
		throw new Error("ToolLoopAgent override 必须同步返回 Agent 实例。");
	}
	return result as T;
}
