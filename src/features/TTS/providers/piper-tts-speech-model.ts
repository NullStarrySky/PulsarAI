import type { SpeechModelV4 } from "@ai-sdk/provider";
import { PIPER_TTS_PROVIDER_ID, synthesizeWithPiper } from "./piper-tts-client";

export { PIPER_TTS_PROVIDER_ID } from "./piper-tts-client";

function readSpeaker(voice: string | undefined) {
  const parsed = Number.parseInt(voice ?? "0", 10);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export function createPiperTtsSpeechModel(modelId: string): SpeechModelV4 {
  return {
    specificationVersion: "v4",
    provider: PIPER_TTS_PROVIDER_ID,
    modelId,
    async doGenerate(options) {
      options.abortSignal?.throwIfAborted();
      const result = await synthesizeWithPiper({
        modelId,
        text: options.text,
        speaker: readSpeaker(options.voice),
        speed: options.speed,
      });
      options.abortSignal?.throwIfAborted();
      return {
        audio: result.audio,
        warnings: [],
        response: {
          timestamp: new Date(),
          modelId,
        },
        providerMetadata: {
          piper: {
            sampleRate: result.sampleRate,
          },
        },
      };
    },
  };
}
