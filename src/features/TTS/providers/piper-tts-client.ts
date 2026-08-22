import { host } from "@/host";

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
  return host.local.invoke<PiperModelPack[]>("tts", "piper_models");
}

export function downloadPiperModel(pack: PiperModelDownloadPack, url: string) {
  return host.local.invoke<PiperModelPack>("tts", "piper_download", { request: { pack, url } });
}

export function deletePiperModel(id: string) {
  return host.local.invoke<void>("tts", "piper_delete", { id });
}

export async function synthesizeWithPiper(options: {
  modelId: string;
  text: string;
  speaker?: number;
  speed?: number;
}) {
  const result = await host.local.invoke<PiperSynthesis>("tts", "piper_synthesize", {
    request: options,
  });
  return {
    ...result,
    audio: new Uint8Array(result.audio),
  };
}
