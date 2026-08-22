import { host } from "@/host";

export const WHISPER_CANDLE_PROVIDER_ID = "whisper-candle";

export interface WhisperModelPack {
  id: string;
  version: string;
  sha256: string;
  size: number;
  diskSize: number;
  language?: string;
  runtime: "whisper-candle-core";
}

export type WhisperModelDownloadPack = Omit<WhisperModelPack, "diskSize">;

export interface WhisperTranscription {
  text: string;
  modelId: string;
  language?: string;
}

export function listWhisperModels() {
  return host.local.invoke<WhisperModelPack[]>("stt", "whisper_candle_models");
}

export function downloadWhisperModel(pack: WhisperModelDownloadPack, url: string) {
  return host.local.invoke<WhisperModelPack>("stt", "whisper_candle_download", { request: { pack, url } });
}

export function deleteWhisperModel(id: string) {
  return host.local.invoke<void>("stt", "whisper_candle_delete", { id });
}

export function transcribeWithWhisper(
  modelId: string,
  audio: Uint8Array,
  language?: string,
) {
  return host.local.invoke<WhisperTranscription>("stt", "transcribe", {
    request: { modelId, audio: Array.from(audio), language },
  });
}
