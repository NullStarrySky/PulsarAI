import type { SpeechModelV4 } from "@ai-sdk/provider";
import { loadAzureTtsSettings } from "../azure-tts-settings";
import { synthesizeWithAzureSpeech } from "./azure-tts-client";

export function createAzureTtsSpeechModel(): SpeechModelV4 {
  return {
    specificationVersion: "v4",
    provider: "azure-speech",
    modelId: "standard",
    async doGenerate(options) {
      const settings = await loadAzureTtsSettings();
      const azureOptions = readProviderOptions(options.providerOptions?.azureSpeech);
      const result = await synthesizeWithAzureSpeech({
        settings,
        text: options.text,
        voiceId: options.voice ?? settings.voiceId,
        style: azureOptions.style ?? settings.style,
        speed: options.speed,
        signal: options.abortSignal,
      });
      return {
        audio: result.audio,
        warnings: options.instructions
          ? [{ type: "unsupported", feature: "instructions" }]
          : [],
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
}

function readProviderOptions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const options = value as Record<string, unknown>;
  return { style: typeof options.style === "string" ? options.style : undefined };
}
