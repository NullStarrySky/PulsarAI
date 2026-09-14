import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { synthesizeWithEdgeTts } from "./client";

const model: SpeechModelV4 = {
	specificationVersion: "v4",
	provider: "edge-tts",
	modelId: "edge-tts",
	async doGenerate(options) {
		const values = options.providerOptions?.edgeTts as
			| Record<string, unknown>
			| undefined;
		const result = await synthesizeWithEdgeTts({
			text: options.text,
			voice: options.voice,
			rate: string(values?.rate) ?? rate(options.speed),
			volume: string(values?.volume),
			pitch: string(values?.pitch),
		});
		return {
			audio: new Uint8Array(await result.audio.arrayBuffer()),
			warnings: [],
			response: { timestamp: new Date(), modelId: "edge-tts" },
			providerMetadata: { edgeTts: { audioBytes: result.audioBytes } },
		};
	},
};
export const edgeTts: ProviderRegistration = {
	provider: {
		id: "edge-tts",
		name: "Edge TTS",
		description: "Microsoft Edge 在线语音服务。",
		enabled: true,
		params: {
			basic: [],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [
				param("edgeTts.rate", "+0%", "语速"),
				param("edgeTts.volume", "+0%", "音量"),
				param("edgeTts.pitch", "+0Hz", "音调"),
			],
		},
		models: {
			...emptyModels(),
			speech: [{ id: "edge-tts", displayName: "Edge TTS", enabled: true }],
		},
		requestOverride: { generateSpeech: "edgeTtsGenerateSpeech" },
	},
	functions: {
		edgeTtsGenerateSpeech: ({ options, native }: any) =>
			native({ ...options, model }),
	},
};
function string(value: unknown) {
	return typeof value === "string" ? value : undefined;
}
function rate(speed: number | undefined) {
	return speed === undefined || speed === 1
		? undefined
		: `${Math.round((speed - 1) * 100) >= 0 ? "+" : ""}${Math.round((speed - 1) * 100)}%`;
}
