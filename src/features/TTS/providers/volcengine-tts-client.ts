import { modelProxyFetch } from "@/features/ModelConnection/providers/model-proxy-fetch";
import {
  VOLCENGINE_TTS_ACCESS_KEY_SECRET,
  VOLCENGINE_TTS_APP_ID_SECRET,
  VOLCENGINE_TTS_ENDPOINT,
} from "../tts";

export interface VolcengineTtsGenerateOptions {
  text: string;
  resourceId: string;
  speakerId: string;
  sampleRate?: number;
  contextText?: string;
  signal?: AbortSignal;
}

interface VolcengineChunk {
  code?: number | string;
  message?: string;
  data?: string;
}

export async function synthesizeWithVolcengineTts(options: VolcengineTtsGenerateOptions) {
  const text = options.text.trim();
  const resourceId = options.resourceId.trim();
  const speakerId = options.speakerId.trim();
  if (!text) throw new Error("豆包语音合成文本不能为空。");
  if (!resourceId) throw new Error("请填写豆包语音 Resource ID。");
  if (!speakerId) throw new Error("请填写豆包语音 Speaker ID。");
  options.signal?.throwIfAborted();

  const additions = options.contextText?.trim()
    ? { context_texts: [options.contextText.trim()] }
    : {};
  const response = await modelProxyFetch(VOLCENGINE_TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-App-Key": `<<${VOLCENGINE_TTS_APP_ID_SECRET}>>`,
      "X-Api-Access-Key": `<<${VOLCENGINE_TTS_ACCESS_KEY_SECRET}>>`,
      "X-Api-Resource-Id": resourceId,
    },
    body: JSON.stringify({
      user: { uid: `pulsar_${crypto.randomUUID()}` },
      req_params: {
        text,
        speaker: speakerId,
        audio_params: {
          format: "mp3",
          sample_rate: options.sampleRate ?? 24000,
        },
        additions: JSON.stringify(additions),
      },
    }),
    signal: options.signal,
  });
  options.signal?.throwIfAborted();

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`豆包语音请求失败 (${response.status})${responseText.trim() ? `：${responseText.trim().slice(0, 240)}` : ""}`);
  }

  const chunks = parseChunkedJson(responseText);
  const audioBase64 = chunks.flatMap((chunk) => chunk.data ? [chunk.data] : []).join("");
  if (!audioBase64) throw new Error("豆包语音响应中没有音频数据。");

  const binary = atob(audioBase64);
  const audio = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return {
    audio,
    mediaType: "audio/mpeg",
    chunkCount: chunks.filter((chunk) => Boolean(chunk.data)).length,
  };
}

function parseChunkedJson(value: string): VolcengineChunk[] {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^data:\s*/, ""))
    .filter(Boolean);
  const chunks: VolcengineChunk[] = [];
  for (const line of lines) {
    let chunk: VolcengineChunk;
    try {
      chunk = JSON.parse(line) as VolcengineChunk;
    } catch {
      throw new Error("豆包语音返回了无法解析的流式 JSON。");
    }
    const code = chunk.code == null ? 0 : Number(chunk.code);
    if (Number.isFinite(code) && code !== 0 && code !== 20000000) {
      throw new Error(`豆包语音返回异常 [${chunk.code}]${chunk.message ? `：${chunk.message}` : ""}`);
    }
    chunks.push(chunk);
  }
  return chunks;
}
