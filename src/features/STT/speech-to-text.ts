import { getTranscriptionModel } from "@/features/defaultConfigs/default-config-service";
import {
  transcribe as transcribeWithModel,
  type HydratableModel,
} from "@/features/ModelConnection/services/model-ai";
import { transcribeWithWhisper, WHISPER_CANDLE_PROVIDER_ID } from "./providers/whisper-candle-client";

export type TranscribeOptions = Omit<Parameters<typeof transcribeWithModel>[0], "model"> & {
  model?: HydratableModel;
  language?: string;
};

export async function transcribe(options: TranscribeOptions) {
  const model = options.model ?? await getTranscriptionModel();
  if (!model) {
    throw new Error("尚未配置语音转写模型。");
  }
  if (typeof model === "string" && model.startsWith(`${WHISPER_CANDLE_PROVIDER_ID}/`)) {
    if (!(options.audio instanceof Uint8Array)) {
      throw new Error("本地 Whisper 目前仅接收 Uint8Array 格式的 WAV PCM 音频。");
    }
    return transcribeWithWhisper(
      model.slice(`${WHISPER_CANDLE_PROVIDER_ID}/`.length),
      options.audio,
      options.language,
    );
  }
  return transcribeWithModel({ ...options, model });
}
