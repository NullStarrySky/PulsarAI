import { emptyModels, param, type ProviderRegistration } from "../definition";
import { listWhisperModels, transcribeWithWhisper } from "./client";
export const whisperCandle: ProviderRegistration = {
	provider: {
		id: "whisper-candle",
		name: "Whisper Candle 本地转写",
		description: "下载的本地 Whisper Candle 模型。",
		enabled: true,
		params: {
			basic: [
				{ ...param("", ""), customBlockComponent: "WhisperModelDownload" },
			],
			text: [],
			image: [],
			video: [],
			speech: [],
			transcribe: [],
			provider: [],
		},
		models: emptyModels(),
		modelGetter: "whisperCandleModels",
		requestOverride: { transcribe: "whisperCandleTranscribe" },
	},
	functions: {
		whisperCandleModels: async () => ({
			transcribe: (await listWhisperModels()).map((item) => ({
				id: item.id,
				displayName: item.id,
				enabled: true,
				extraInfo: {
					version: item.version,
					...(item.language ? { language: item.language } : {}),
				},
			})),
		}),
		whisperCandleTranscribe: async ({ modelId, options }: any) => {
			if (!(options.audio instanceof Uint8Array))
				throw new Error(
					"Whisper Candle 仅接收 Uint8Array 格式的 WAV PCM 音频。",
				);
			return transcribeWithWhisper(
				modelId ?? "",
				options.audio,
				typeof options.language === "string" ? options.language : undefined,
			);
		},
	},
};
