import type { SpeechModelV4 } from "@ai-sdk/provider";
import { emptyModels, param, secret } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { synthesizeWithAzureSpeech } from "./client";

const model: SpeechModelV4 = {
	specificationVersion: "v4",
	provider: "azure-speech",
	modelId: "standard",
	async doGenerate(options) {
		const value = options.providerOptions?.azureSpeech as
			| Record<string, unknown>
			| undefined;
		const result = await synthesizeWithAzureSpeech({
			settings: {
				region: string(value?.region) ?? "",
				outputFormat:
					string(value?.outputFormat) ?? "audio-24khz-48kbitrate-mono-mp3",
			},
			text: options.text,
			voiceId: options.voice ?? string(value?.voiceId) ?? "",
			style: string(value?.style),
			speed: options.speed,
			signal: options.abortSignal,
		});
		return {
			audio: result.audio,
			warnings: [],
			response: {
				timestamp: new Date(),
				modelId: "standard",
				headers: result.headers,
			},
			providerMetadata: {
				azureSpeech: { audioBytes: result.audio.byteLength },
			},
		};
	},
};
export const azureSpeech: ProviderRegistration = {
	provider: {
		id: "azure-speech",
		name: "Azure Speech",
		description: "Azure Speech Synthesis API。",
		icon: "azure",
		enabled: false,
		params: {
			basic: [secret("azureSpeech_TTS_API_KEY", "API Key")],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [
				param("azureSpeech.region", "", "Region"),
				param("azureSpeech.voiceId", "", "默认声音"),
				param("azureSpeech.style", "", "风格"),
				param(
					"azureSpeech.outputFormat",
					"audio-24khz-48kbitrate-mono-mp3",
					"输出格式",
				),
			],
		},
		models: {
			...emptyModels(),
			speech: [{ id: "standard", displayName: "Standard", enabled: true }],
		},
		requestOverride: { generateSpeech: "azureSpeechGenerateSpeech" },
	},
	functions: {
		azureSpeechGenerateSpeech: ({ options, native }: any) =>
			native({ ...options, model }),
	},
};
function string(value: unknown) {
	return typeof value === "string" ? value : undefined;
}
