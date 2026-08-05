import { modelProxyFetch } from "@/features/ModelConnection/infrastructure/model-proxy-fetch";
import {
  ELEVENLABS_TTS_API_KEY_SECRET,
  type ElevenLabsTtsSettings,
} from "../domain/tts";

export interface ElevenLabsVoice {
  voiceId: string;
  name: string;
  category: string;
  description: string;
  previewUrl: string;
  labels: Record<string, string>;
}

export interface ElevenLabsModel {
  modelId: string;
  name: string;
  description: string;
  languages: Array<{ languageId: string; name: string }>;
}

interface ElevenLabsVoiceResponse {
  voices?: Array<{
    voice_id?: string;
    name?: string;
    category?: string;
    description?: string;
    preview_url?: string;
    labels?: Record<string, string>;
  }>;
  has_more?: boolean;
  next_page_token?: string | null;
}

export async function listElevenLabsVoices(settings: ElevenLabsTtsSettings, signal?: AbortSignal) {
  const voices: ElevenLabsVoice[] = [];
  let nextPageToken = "";
  do {
    const query = new URLSearchParams({ page_size: "100", include_total_count: "false" });
    if (nextPageToken) query.set("next_page_token", nextPageToken);
    const response = await elevenLabsFetch(settings, `/v2/voices?${query}`, { signal });
    const payload = await readJson<ElevenLabsVoiceResponse>(response, "ElevenLabs 声音列表");
    voices.push(...(payload.voices ?? []).flatMap((voice) => {
      if (!voice.voice_id) return [];
      return [{
        voiceId: voice.voice_id,
        name: voice.name || voice.voice_id,
        category: voice.category || "",
        description: voice.description || "",
        previewUrl: voice.preview_url || "",
        labels: voice.labels ?? {},
      }];
    }));
    nextPageToken = payload.has_more && payload.next_page_token ? payload.next_page_token : "";
  } while (nextPageToken);
  return voices.sort((left, right) => left.name.localeCompare(right.name));
}

export async function listElevenLabsModels(settings: ElevenLabsTtsSettings, signal?: AbortSignal) {
  const response = await elevenLabsFetch(settings, "/v1/models", { signal });
  const payload = await readJson<Array<{
    model_id?: string;
    name?: string;
    description?: string;
    can_do_text_to_speech?: boolean;
    languages?: Array<{ language_id?: string; name?: string }>;
  }>>(response, "ElevenLabs 模型列表");
  return payload.flatMap((model): ElevenLabsModel[] => {
    if (!model.model_id || model.can_do_text_to_speech === false) return [];
    return [{
      modelId: model.model_id,
      name: model.name || model.model_id,
      description: model.description || "",
      languages: (model.languages ?? []).flatMap((language) => language.language_id
        ? [{ languageId: language.language_id, name: language.name || language.language_id }]
        : []),
    }];
  });
}

export async function synthesizeWithElevenLabsTts(options: {
  settings: ElevenLabsTtsSettings;
  text: string;
  modelId: string;
  voiceId: string;
  speed?: number;
  signal?: AbortSignal;
}) {
  const text = options.text.trim();
  const modelId = options.modelId.trim();
  const voiceId = options.voiceId.trim();
  if (!text) throw new Error("ElevenLabs 合成文本不能为空。");
  if (!modelId) throw new Error("请选择 ElevenLabs 模型。");
  if (!voiceId) throw new Error("请选择 ElevenLabs 声音。");

  const outputFormat = options.settings.outputFormat.trim() || "mp3_44100_128";
  const response = await elevenLabsFetch(
    options.settings,
    `/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(outputFormat)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: modelId,
        voice_settings: {
          stability: options.settings.stability,
          similarity_boost: options.settings.similarityBoost,
          style: options.settings.style,
          use_speaker_boost: options.settings.speakerBoost,
          speed: options.speed ?? options.settings.speed,
        },
      }),
      signal: options.signal,
    },
  );
  if (!response.ok) await throwResponseError(response, "ElevenLabs 语音生成");
  return {
    audio: new Uint8Array(await response.arrayBuffer()),
    mediaType: mediaTypeForElevenLabsFormat(outputFormat),
    headers: Object.fromEntries(response.headers.entries()),
  };
}

async function elevenLabsFetch(settings: ElevenLabsTtsSettings, path: string, init: RequestInit = {}) {
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(baseUrl)) throw new Error("ElevenLabs API 地址必须使用 HTTPS。");
  const headers = new Headers(init.headers);
  headers.set("xi-api-key", `<<${ELEVENLABS_TTS_API_KEY_SECRET}>>`);
  return modelProxyFetch(`${baseUrl}${path}`, { ...init, headers });
}

async function readJson<T>(response: Response, operation: string): Promise<T> {
  if (!response.ok) await throwResponseError(response, operation);
  return response.json() as Promise<T>;
}

async function throwResponseError(response: Response, operation: string): Promise<never> {
  const detail = (await response.text().catch(() => "")).trim().slice(0, 300);
  throw new Error(`${operation}失败 (${response.status})${detail ? `：${detail}` : ""}`);
}

function mediaTypeForElevenLabsFormat(format: string) {
  if (format.startsWith("mp3")) return "audio/mpeg";
  if (format.startsWith("opus")) return "audio/ogg";
  if (format.startsWith("ulaw")) return "audio/basic";
  return "audio/pcm";
}
