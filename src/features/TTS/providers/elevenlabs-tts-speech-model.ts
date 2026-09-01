import type { SpeechModelV4 } from "@ai-sdk/provider";
import { loadElevenLabsTtsSettings } from "../elevenlabs-tts-settings";
import { synthesizeWithElevenLabsTts } from "./elevenlabs-tts-client";

export function createElevenLabsTtsSpeechModel(modelId: string): SpeechModelV4 {
	return {
		specificationVersion: "v4",
		provider: "elevenlabs",
		modelId,
		async doGenerate(options) {
			const settings = await loadElevenLabsTtsSettings();
			const result = await synthesizeWithElevenLabsTts({
				settings,
				text: options.text,
				modelId,
				voiceId: options.voice ?? settings.voiceId,
				speed: options.speed,
				signal: options.abortSignal,
			});
			return {
				audio: result.audio,
				warnings: options.instructions
					? [{ type: "unsupported", feature: "instructions" }]
					: [],
				response: {
					timestamp: new Date(),
					modelId,
					headers: result.headers,
				},
				providerMetadata: {
					elevenlabs: { audioBytes: result.audio.byteLength },
				},
			};
		},
	};
}
