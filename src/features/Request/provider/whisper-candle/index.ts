import { emptyModels, param } from "../shared/definition";
import type { ProviderRegistration } from "../shared/registration";
import { transcribeWithWhisper } from "./client";
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
		requestOverride: { transcribe: "whisperCandleTranscribe" },
	},
	functions: {
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
