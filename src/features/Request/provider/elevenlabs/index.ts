import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { synthesizeWithElevenLabsTts } from "./client";

function model(modelId: string): SpeechModelV4 {
	return {
		specificationVersion: "v4",
		provider: "elevenlabs",
		modelId,
		async doGenerate(options) {
			const value = options.providerOptions?.elevenLabs as
				| Record<string, unknown>
				| undefined;
			const result = await synthesizeWithElevenLabsTts({
				settings: {
					baseUrl: string(value?.baseUrl) ?? "https://api.elevenlabs.io",
					outputFormat: string(value?.outputFormat) ?? "mp3_44100_128",
					stability: number(value?.stability) ?? 0.5,
					similarityBoost: number(value?.similarityBoost) ?? 0.75,
					style: number(value?.style) ?? 0,
					speakerBoost: value?.speakerBoost !== false,
					speed: number(value?.speed) ?? 1,
				},
				text: options.text,
				modelId,
				voiceId: options.voice ?? string(value?.voiceId) ?? "",
				speed: options.speed,
				signal: options.abortSignal,
			});
			return {
				audio: result.audio,
				warnings: [],
				response: { timestamp: new Date(), modelId, headers: result.headers },
				providerMetadata: {
					elevenlabs: { audioBytes: result.audio.byteLength },
				},
			};
		},
	};
}
export const elevenLabs: ProviderRegistration = {
	provider: {
		id: "elevenlabs",
		name: "ElevenLabs",
		description: "ElevenLabs 语音生成 API。",
		icon: "elevenlabs",
		enabled: false,
		params: {
			basic: [secret("elevenlabs_TTS_API_KEY", "API Key")],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [
				param("elevenLabs.baseUrl", "https://api.elevenlabs.io", "API 地址"),
				param("elevenLabs.voiceId", "", "默认声音"),
				param("elevenLabs.outputFormat", "mp3_44100_128", "输出格式"),
				param("elevenLabs.stability", 0.5, "稳定性"),
				param("elevenLabs.similarityBoost", 0.75, "相似度增强"),
				param("elevenLabs.style", 0, "风格"),
				param("elevenLabs.speakerBoost", true, "说话人增强"),
				param("elevenLabs.speed", 1, "语速"),
			],
		},
		models: {
			...emptyModels(),
			speech: [
				{
					id: "eleven_multilingual_v2",
					displayName: "Eleven Multilingual v2",
					enabled: true,
				},
			],
		},
		requestOverride: { generateSpeech: "elevenLabsGenerateSpeech" },
	},
	functions: {
		elevenLabsGenerateSpeech: ({ modelId, options, native }: any) =>
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
