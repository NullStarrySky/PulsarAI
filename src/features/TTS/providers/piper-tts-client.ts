import { invoke } from "@tauri-apps/api/core";

export const PIPER_TTS_PROVIDER_ID = "piper";

export interface PiperModelPack {
  id: string;
  version: string;
  sha256: string;
  size: number;
  diskSize: number;
  language?: string;
  runtime: "sherpa-onnx-piper";
}

export type PiperModelDownloadPack = Omit<PiperModelPack, "diskSize">;

export interface PiperSynthesis {
  audio: number[];
  sampleRate: number;
  modelId: string;
}

export function listPiperModels() {
  return invoke<PiperModelPack[]>("tts_piper_models");
}

export function downloadPiperModel(pack: PiperModelDownloadPack, url: string) {
  return invoke<PiperModelPack>("tts_piper_download", { request: { pack, url } });
}

export function deletePiperModel(id: string) {
  return invoke<void>("tts_piper_delete", { id });
}

export async function synthesizeWithPiper(options: {
  modelId: string;
  text: string;
  speaker?: number;
  speed?: number;
}) {
  const result = await invoke<PiperSynthesis>("tts_piper_synthesize", {
    request: options,
  });
  return {
    ...result,
    audio: new Uint8Array(result.audio),
  };
}
