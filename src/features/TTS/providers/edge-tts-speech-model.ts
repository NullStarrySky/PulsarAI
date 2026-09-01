import type { SpeechModelV4 } from "@ai-sdk/provider";
import { synthesizeWithEdgeTts } from "./edge-tts-client";

export const EDGE_TTS_MODEL_REF = "edge-tts/edge-tts";

interface EdgeTtsProviderOptions {
	rate?: string;
	volume?: string;
	pitch?: string;
	boundary?: "WordBoundary" | "SentenceBoundary";
}

function readProviderOptions(value: unknown): EdgeTtsProviderOptions {
	if (!value || typeof value !== "object" || Array.isArray(value)) return {};
	const options = value as Record<string, unknown>;
	return {
		rate: typeof options.rate === "string" ? options.rate : undefined,
		volume: typeof options.volume === "string" ? options.volume : undefined,
		pitch: typeof options.pitch === "string" ? options.pitch : undefined,
		boundary:
			options.boundary === "WordBoundary" ||
			options.boundary === "SentenceBoundary"
				? options.boundary
				: undefined,
	};
}

function speedToRate(speed: number | undefined) {
	if (speed === undefined || speed === 1) return undefined;
	const percentage = Math.round((speed - 1) * 100);
	return `${percentage >= 0 ? "+" : ""}${percentage}%`;
}

export const edgeTtsSpeechModel: SpeechModelV4 = {
	specificationVersion: "v4",
	provider: "edge-tts",
	modelId: "edge-tts",
	async doGenerate(options) {
		options.abortSignal?.throwIfAborted();
		const edgeOptions = readProviderOptions(options.providerOptions?.edgeTts);
		const result = await synthesizeWithEdgeTts({
			text: options.text,
			voice: options.voice,
			rate: edgeOptions.rate ?? speedToRate(options.speed),
			volume: edgeOptions.volume,
			pitch: edgeOptions.pitch,
			boundary: edgeOptions.boundary,
		});
		options.abortSignal?.throwIfAborted();

		return {
			audio: new Uint8Array(await result.audio.arrayBuffer()),
			warnings: [],
			response: {
				timestamp: new Date(),
				modelId: "edge-tts",
			},
			providerMetadata: {
				edgeTts: {
					audioBytes: result.audioBytes,
					boundaryCount: result.boundaries.length,
				},
			},
		};
	},
};
