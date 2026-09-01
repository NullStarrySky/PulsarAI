import type { SpeechModelV4 } from "@ai-sdk/provider";
import { loadVolcengineTtsSettings } from "../volcengine-tts-settings";
import { synthesizeWithVolcengineTts } from "./volcengine-tts-client";

interface VolcengineTtsProviderOptions {
	resourceId?: string;
	speakerId?: string;
	sampleRate?: number;
	contextText?: string;
}

export function createVolcengineTtsSpeechModel(
	resourceId: string,
): SpeechModelV4 {
	return {
		specificationVersion: "v4",
		provider: "volcengine-tts",
		modelId: resourceId,
		async doGenerate(options) {
			const settings = await loadVolcengineTtsSettings();
			const providerOptions = readProviderOptions(
				options.providerOptions?.volcengineTts,
			);
			const result = await synthesizeWithVolcengineTts({
				text: options.text,
				resourceId:
					providerOptions.resourceId ?? resourceId ?? settings.resourceId,
				speakerId:
					providerOptions.speakerId ?? options.voice ?? settings.speakerId,
				sampleRate: providerOptions.sampleRate ?? settings.sampleRate,
				contextText: providerOptions.contextText ?? options.instructions,
				signal: options.abortSignal,
			});
			return {
				audio: result.audio,
				warnings: [],
				response: {
					timestamp: new Date(),
					modelId: resourceId,
				},
				providerMetadata: {
					volcengineTts: {
						audioBytes: result.audio.byteLength,
						chunkCount: result.chunkCount,
					},
				},
			};
		},
	};
}

function readProviderOptions(value: unknown): VolcengineTtsProviderOptions {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const options = value as Record<string, unknown>;
	return {
		resourceId:
			typeof options.resourceId === "string" ? options.resourceId : undefined,
		speakerId:
			typeof options.speakerId === "string" ? options.speakerId : undefined,
		sampleRate:
			typeof options.sampleRate === "number" ? options.sampleRate : undefined,
		contextText:
			typeof options.contextText === "string" ? options.contextText : undefined,
	};
}
