import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { synthesizeWithVolcengineTts } from "./client";

function model(modelId: string): SpeechModelV4 {
	return {
		specificationVersion: "v4",
		provider: "volcengine-tts",
		modelId,
		async doGenerate(options) {
			const value = options.providerOptions?.volcengineTts as
				| Record<string, unknown>
				| undefined;
			const result = await synthesizeWithVolcengineTts({
				text: options.text,
				resourceId: string(value?.resourceId) ?? modelId,
				speakerId: string(value?.speakerId) ?? options.voice ?? "",
				sampleRate: number(value?.sampleRate),
				contextText: string(value?.contextText) ?? options.instructions,
				signal: options.abortSignal,
			});
			return resultFor(modelId, result.audio, {
				volcengineTts: {
					audioBytes: result.audio.byteLength,
					chunkCount: result.chunkCount,
				},
			});
		},
	};
}
export const volcengineTts: ProviderRegistration = {
	provider: {
		id: "volcengine-tts",
		name: "豆包语音",
		description: "火山引擎流式语音合成。",
		icon: "volcengine",
		enabled: false,
		params: {
			basic: [
				secret("volcengine_TTS_APP_ID", "App ID"),
				secret("volcengine_TTS_ACCESS_KEY", "Access Key"),
			],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [
				param("volcengineTts.resourceId", "", "Resource ID"),
				param("volcengineTts.speakerId", "", "Speaker ID"),
				param("volcengineTts.sampleRate", 24000, "采样率"),
				param("volcengineTts.contextText", "", "上下文文本"),
			],
		},
		models: {
			...emptyModels(),
			speech: [
				{ id: "seed-tts-2.0", displayName: "Seed TTS 2.0", enabled: true },
			],
		},
		requestOverride: { generateSpeech: "volcengineGenerateSpeech" },
	},
	functions: {
		volcengineGenerateSpeech: ({ modelId, options, native }: any) =>
			native({ ...options, model: model(modelId ?? "") }),
	},
};
function string(value: unknown) {
	return typeof value === "string" ? value : undefined;
}
function number(value: unknown) {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}
function resultFor(
	modelId: string,
	audio: Uint8Array,
	providerMetadata: Record<string, any>,
) {
	return {
		audio,
		warnings: [],
		response: { timestamp: new Date(), modelId },
		providerMetadata,
	};
}
