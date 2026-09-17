import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param, type ProviderRegistration } from "../definition";
import {
	PIPER_TTS_PROVIDER_ID,
	listPiperModels,
	synthesizeWithPiper,
} from "./client";

function model(modelId: string): SpeechModelV4 {
	return {
		specificationVersion: "v4",
		provider: PIPER_TTS_PROVIDER_ID,
		modelId,
		async doGenerate(options) {
			const result = await synthesizeWithPiper({
				modelId,
				text: options.text,
				speaker: Number.parseInt(options.voice ?? "0", 10) || 0,
				speed: options.speed,
			});
			return {
				audio: result.audio,
				warnings: [],
				response: { timestamp: new Date(), modelId },
				providerMetadata: { piper: { sampleRate: result.sampleRate } },
			};
		},
	};
}
export const piper: ProviderRegistration = {
	provider: {
		id: "piper",
		name: "Piper 本地语音",
		description: "下载的本地 Piper 模型。",
		enabled: true,
		params: {
			basic: [{ ...param("", ""), customBlockComponent: "PiperModelDownload" }],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: emptyModels(),
		modelGetter: "piperModels",
		requestOverride: { generateSpeech: "piperGenerateSpeech" },
	},
	functions: {
		piperModels: async () => ({
			speech: (await listPiperModels()).map((item) => ({
				id: item.id,
				displayName: item.id,
				enabled: true,
				extraInfo: {
					version: item.version,
					...(item.language ? { language: item.language } : {}),
				},
			})),
		}),
		piperGenerateSpeech: ({ modelId, options, native }: any) =>
			native({ ...options, model: model(modelId ?? "") }),
	},
};
